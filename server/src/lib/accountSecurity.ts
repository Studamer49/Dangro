import { prisma } from "../prisma.js";
import { config } from "../config.js";
import { sendMail, assertEmailConfigured } from "./mailer.js";
import {
  generateSecureToken,
  hashToken,
  passwordResetUrl,
  renderPasswordResetEmail,
  renderVerificationEmail,
  verificationUrl,
} from "./emailVerification.js";

/**
 * Email verification and password reset.
 *
 * Both flows are the same shape — mint a token, keep only its hash, mail a
 * link, then claim the token with one conditional write — so they share this
 * module rather than each route growing its own slightly different version.
 *
 * Two rules hold everywhere in here:
 *
 *  1. The raw token exists only in the URL that is mailed. The database
 *     stores `hashToken(raw)`, so a leaked dump cannot be replayed.
 *  2. A token is *claimed* with a conditional `updateMany` whose filter
 *     includes the token hash, the "not yet used" marker and the expiry.
 *     Exactly one concurrent request can match; every later one matches
 *     nothing. That is what makes a link single-use even when the user
 *     double-clicks it or a mail scanner prefetches it twice.
 */

export type VerificationOutcome = "verified" | "already-used" | "expired" | "invalid";
export type ResetOutcome = "reset" | "already-used" | "expired" | "invalid";

interface IssuedToken {
  raw: string;
  hash: string;
  expiresAt: Date;
}

/** A fresh token with its expiry. The raw value never leaves this scope. */
function issue(ttlMinutes: number): IssuedToken {
  const raw = generateSecureToken();
  return { raw, hash: hashToken(raw), expiresAt: new Date(Date.now() + ttlMinutes * 60_000) };
}

/**
 * Retires every access and refresh token issued before a credential change.
 *
 * Reads-then-writes rather than Prisma's `{ increment: 1 }`: the MongoDB
 * backend translates an update into a plain `$set`, so an increment operator
 * would be stored verbatim as the literal object `{ increment: 1 }` and every
 * later comparison against it would fail.
 *
 * Two simultaneous changes can land on the same number. That is harmless: the
 * version's only job is to differ from the one inside a live token, and both
 * racing writes are already changing the credential the token grants access to.
 */
export async function bumpSessionVersion(userId: string): Promise<number> {
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { authSessionVersion: true },
  });

  const next = (typeof current?.authSessionVersion === "number" ? current.authSessionVersion : 0) + 1;
  await prisma.user.update({ where: { id: userId }, data: { authSessionVersion: next } });
  return next;
}

/**
 * Mails a verification link for a user and stores its hash.
 *
 * Order matters: the token is stored BEFORE the send. If the send then fails,
 * the caller rolls back (or the next resend overwrites it), but the
 * alternative — send first, store second — can mail a link that is already
 * invalid by the time the user clicks it.
 */
export async function sendVerificationEmail(user: {
  id: string;
  username: string;
  email: string;
}): Promise<{ expiresAt: Date }> {
  assertEmailConfigured();

  const token = issue(config.emailVerification.tokenTtlMinutes);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerificationTokenHash: token.hash,
      emailVerificationExpiresAt: token.expiresAt,
      emailVerificationSentAt: new Date(),
      emailVerificationUsedAt: null,
    },
  });

  const mail = renderVerificationEmail({
    username: user.username,
    url: verificationUrl(config.appBaseUrl, token.raw),
    ttlMinutes: config.emailVerification.tokenTtlMinutes,
  });

  await sendMail({ to: user.email, ...mail });

  // The address is logged masked and the URL never at all: this line exists
  // so an operator can see that a send happened, not so the token can be read
  // back out of a log aggregator.
  console.log(`[email] verification link issued for user ${user.id}`);

  return { expiresAt: token.expiresAt };
}

/**
 * Clears verification state so a failed send leaves nothing dangling.
 *
 * Called when `sendVerificationEmail` throws, after the user has already been
 * created or has just asked for a resend.
 */
export async function clearVerificationToken(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      emailVerificationTokenHash: null,
      emailVerificationExpiresAt: null,
      emailVerificationUsedAt: null,
    },
  });
}

/**
 * Claims a verification token.
 *
 * The single conditional write below is the whole security argument. The
 * filter names the hash, an unused marker and a live expiry, so:
 *
 *   - the first matching request flips the row and every later one matches
 *     nothing, no matter how many arrive at once;
 *   - an expired link can never be claimed, even if its row is still there;
 *   - an already-verified (or legacy) account cannot be re-claimed, because
 *     `emailVerified: false` is part of the filter.
 *
 * The hash is deliberately NOT cleared on success. It is what lets the
 * failure path below say "you already used this link" instead of the useless
 * "invalid", and a hash of a spent 256-bit token is not a credential.
 */
export async function claimVerificationToken(rawToken: string): Promise<VerificationOutcome> {
  const hash = hashToken(rawToken);
  const now = new Date();

  const claimed = await prisma.user.updateMany({
    where: {
      emailVerificationTokenHash: hash,
      emailVerificationUsedAt: null,
      emailVerified: false,
      emailVerificationExpiresAt: { gt: now },
    },
    data: {
      emailVerified: true,
      emailVerifiedAt: now,
      emailVerificationUsedAt: now,
    },
  });

  if (claimed.count > 0) return "verified";

  const owner = await prisma.user.findFirst({
    where: { emailVerificationTokenHash: hash },
    select: {
      id: true,
      emailVerified: true,
      emailVerificationUsedAt: true,
      emailVerificationExpiresAt: true,
    },
  });

  if (!owner) return "invalid";
  if (owner.emailVerified || owner.emailVerificationUsedAt) return "already-used";
  if (!owner.emailVerificationExpiresAt || owner.emailVerificationExpiresAt.getTime() <= now.getTime()) {
    return "expired";
  }
  return "invalid";
}

/**
 * Issues a password-reset link, if the address belongs to an account.
 *
 * Returns whether a mail was sent, but callers must NOT surface that to the
 * caller of the HTTP route — see `routes/auth.ts`, which answers the same way
 * for every address.
 */
export async function sendPasswordResetEmail(email: string): Promise<boolean> {
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, username: true, email: true },
  });

  if (!user) return false;

  const token = issue(config.emailVerification.resetTokenTtlMinutes);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetTokenHash: token.hash,
      passwordResetExpiresAt: token.expiresAt,
      passwordResetUsedAt: null,
    },
  });

  const mail = renderPasswordResetEmail({
    username: user.username,
    url: passwordResetUrl(config.appBaseUrl, token.raw),
    ttlMinutes: config.emailVerification.resetTokenTtlMinutes,
  });

  try {
    await sendMail({ to: user.email, ...mail });
  } catch (err) {
    // A provider outage must not leave a usable reset token sitting in the
    // database for an address whose owner never received a link.
    await clearPasswordResetToken(user.id);
    throw err;
  }

  console.log(`[email] password reset link issued for user ${user.id}`);
  return true;
}

export async function clearPasswordResetToken(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
      passwordResetUsedAt: null,
    },
  });
}

/**
 * Marks a reset token spent and returns the account it belongs to.
 *
 * The lookup only narrows WHICH row to claim; it is not the safety check.
 * `updateMany` re-tests the hash, the unused marker and the expiry, so a row
 * that was claimed or expired between the two calls matches nothing and the
 * request is reported as a replay rather than as a success. That keeps two
 * simultaneous clicks from both succeeding while still telling the caller
 * which account to write the new password to.
 *
 * Writing the hash itself is left to the route: bcrypt at cost 12 costs
 * ~100ms, and paying that inside a conditional write would hold a database
 * lock for it.
 */
export async function claimPasswordResetToken(
  rawToken: string
): Promise<{ outcome: ResetOutcome; userId?: string }> {
  const hash = hashToken(rawToken);
  const now = new Date();

  const candidate = await prisma.user.findFirst({
    where: { passwordResetTokenHash: hash },
    select: { id: true, passwordResetUsedAt: true, passwordResetExpiresAt: true },
  });

  if (!candidate) return { outcome: "invalid" };
  if (candidate.passwordResetUsedAt) return { outcome: "already-used" };
  if (!candidate.passwordResetExpiresAt || candidate.passwordResetExpiresAt.getTime() <= now.getTime()) {
    return { outcome: "expired" };
  }

  const claimed = await prisma.user.updateMany({
    where: {
      id: candidate.id,
      passwordResetTokenHash: hash,
      passwordResetUsedAt: null,
      passwordResetExpiresAt: { gt: now },
    },
    // The hash stays behind, exactly as in the verification flow, so a second
    // click can be answered with "already used" instead of a useless
    // "invalid". It is the hash of a spent 256-bit token, not a credential.
    data: { passwordResetUsedAt: now },
  });

  if (claimed.count === 0) return { outcome: "already-used" };
  return { outcome: "reset", userId: candidate.id };
}