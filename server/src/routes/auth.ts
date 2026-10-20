import { Router, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { config } from "../config.js";
import { authenticate, AuthRequest, requireUser, JWT_ALGORITHM } from "../middleware/auth.js";
import { AppError, asyncHandler, ok, parseOrThrow, isDuplicateKeyError } from "../lib/http.js";
import { assertEmailConfigured, emailServerHealth, MailDeliveryError } from "../lib/mailer.js";
import { normalizeEmail, maskEmail } from "../lib/emailVerification.js";
import {
  bumpSessionVersion,
  claimPasswordResetToken,
  claimVerificationToken,
  clearVerificationToken,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../lib/accountSecurity.js";

const router = Router();

/**
 * `.trim()` before `.email()`, not after.
 *
 * Trailing whitespace is the single most common copy-paste artefact in this
 * field, and validating first meant `"bob@example.com "` was rejected outright
 * instead of being normalised into the address the user obviously meant.
 */
const emailField = z.string().trim().email().max(254);

const registerSchema = z.object({
  username: z.string().min(3).max(32).regex(/^\S+$/, "Username cannot contain spaces"),
  email: emailField,
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1).max(128),
});

const tokenField = z
  .string()
  // 512 chars covers a base64url 32-byte token with room to spare, and stops
  // the endpoint from being used as an oracle for hashing arbitrary input.
  .min(32)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/, "Malformed verification link");

const tokenSchema = z.object({ token: tokenField });

const emailOnlySchema = z.object({
  email: emailField,
});

const resetPasswordSchema = z.object({
  token: tokenField,
  password: z.string().min(8).max(128),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

const userSelect = {
  id: true,
  username: true,
  email: true,
  bio: true,
  avatar: true,
  cover: true,
  isPrivate: true,
  status: true,
  lastSeen: true,
  emailVerified: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Whether this account is allowed past the verification gate.
 *
 * `false` is the ONLY thing that means "unverified". `null`/absent means the
 * row predates email verification — a legacy account that must keep working,
 * which is why nothing backfills those rows to `false`.
 *
 * The check is always made here, on the server, from the database. A value
 * sent by the client is never consulted.
 */
function isEmailVerified(user: { emailVerified?: boolean | null } | null | undefined): boolean {
  return !!user && user.emailVerified !== false;
}

/** Bumped when a credential changes, to retire tokens issued before it. */
function sessionVersionOf(user: { authSessionVersion?: number | null } | null | undefined): number {
  return typeof user?.authSessionVersion === "number" ? user.authSessionVersion : 0;
}

function generateTokens(userId: string, sessionVersion: number) {
  // `sv` rides along so a token minted before an email or password change can
  // be recognised as stale instead of silently working for its remaining life.
  // The algorithm is named explicitly so the signer and the two verifiers
  // cannot drift apart.
  const accessToken = jwt.sign({ userId, sv: sessionVersion }, config.jwtSecret, {
    algorithm: JWT_ALGORITHM,
    expiresIn: "15m",
  });
  const refreshToken = jwt.sign({ userId, sv: sessionVersion }, config.jwtRefreshSecret, {
    algorithm: JWT_ALGORITHM,
    expiresIn: "7d",
  });
  return { accessToken, refreshToken };
}

// The frontend may live on another site (Cloudflare Pages), so production needs SameSite=None.
const REFRESH_COOKIE = {
  httpOnly: true,
  secure: config.isProduction,
  sameSite: config.isProduction ? "none" : "lax",
} as const;

function setRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie("refreshToken", refreshToken, { ...REFRESH_COOKIE, maxAge: 7 * 24 * 60 * 60 * 1000 });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie("refreshToken");
}

/**
 * Turns a failed send into the right error.
 *
 * A provider that refused the message is an upstream failure (502), not a
 * broken request — and it is never reported as success, so the client cannot
 * tell the user to check an inbox that will stay empty.
 */
function mailError(err: unknown, consequence: string): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof MailDeliveryError) {
    return AppError.of("UPSTREAM_ERROR", `${err.message}: ${err.reason}. ${consequence}`);
  }
  return err as AppError;
}

/**
 * Refuses to continue when the mail server cannot be used at all.
 *
 * Called BEFORE any address lookup, which is the whole point: the answer it
 * gives depends only on the server, never on whether an account exists. A
 * caller probing addresses cannot tell "no such account" from "the provider is
 * down", so the check discloses nothing — and it stops the app telling people
 * to check an inbox when no mail can leave the box.
 */
async function requireWorkingMailServer(): Promise<void> {
  const health = await emailServerHealth();

  if (!health.configured) {
    throw AppError.of(
      "SERVICE_UNAVAILABLE",
      `Email is not configured on this server (missing ${config.email.missingVars.join(", ")}), so no message could be sent. Nothing has been changed — please try again once an administrator has set it up.`
    );
  }

  if (!health.reachable) {
    throw AppError.of(
      "SERVICE_UNAVAILABLE",
      `Email is configured but the mail server is not answering: ${health.detail}. No message was sent — please try again in a few minutes.`
    );
  }
}

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const input = parseOrThrow(registerSchema, req.body);
    const username = input.username;
    const email = normalizeEmail(input.email);

    // Checked before anything is written. Creating an account that can never
    // be verified is worse than refusing to create it: the address is now
    // taken, and the user has no way to recover.
    assertEmailConfigured();

    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { email: { equals: email, mode: "insensitive" } },
          { username: { equals: username, mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });

    if (existing) {
      throw AppError.of("CONFLICT", "An account with this email or username already exists");
    }

    const hashedPassword = await bcrypt.hash(input.password, 12);

    let user;
    try {
      user = await prisma.user.create({
        data: { username, email, password: hashedPassword, emailVerified: false },
        select: userSelect,
      });
    } catch (err) {
      // Two signups for the same address can pass the check above and race
      // into the unique index. That is still a conflict, not a server error.
      if (isDuplicateKeyError(err)) {
        throw AppError.of("CONFLICT", "An account with this email or username already exists");
      }
      throw err;
    }

    try {
      await sendVerificationEmail(user);
    } catch (err) {
      // The account is useless without its verification link, and leaving it
      // behind would burn the address. Removing it is the only way the user
      // can simply sign up again.
      await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
      throw mailError(err, "Your account was not created — please try again.");
    }

    // No access or refresh token is issued here. An unverified account has no
    // session to hand out — the client shows the "check your inbox" notice and
    // the user signs in once the link is clicked.
    ok(res, {
      user,
      verificationRequired: true,
      /** Masked so the page can confirm the address without echoing it back. */
      email: maskEmail(email),
      message: "Account created. Check your inbox to verify your email address.",
    }, 201);
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const input = parseOrThrow(loginSchema, req.body);
    const email = normalizeEmail(input.email);

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });

    // The password is compared before the verification gate is even looked at,
    // so this endpoint cannot be used to discover which addresses are
    // registered, nor which of them are unverified.
    if (!user) throw AppError.of("UNAUTHORIZED", "Invalid email or password");

    const isPasswordValid = await bcrypt.compare(input.password, user.password);
    if (!isPasswordValid) throw AppError.of("UNAUTHORIZED", "Invalid email or password");

    if (!isEmailVerified(user)) {
      throw AppError.of(
        "EMAIL_NOT_VERIFIED",
        "Your email address is not verified yet. Check your inbox for the link, or request a new one."
      );
    }

    const { accessToken, refreshToken } = generateTokens(user.id, sessionVersionOf(user));
    setRefreshCookie(res, refreshToken);

    const { password: _password, ...safe } = user;
    ok(res, { user: safe, accessToken });
  })
);

router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const refreshToken = req.cookies?.refreshToken as string | undefined;
    if (!refreshToken) throw AppError.of("UNAUTHORIZED", "No refresh token");

    let decoded: { userId?: string; sv?: number };
    try {
      decoded = jwt.verify(refreshToken, config.jwtRefreshSecret, {
        algorithms: [JWT_ALGORITHM],
      }) as { userId?: string; sv?: number };
    } catch {
      clearRefreshCookie(res);
      throw AppError.of("UNAUTHORIZED", "Invalid refresh token");
    }
    if (!decoded.userId) {
      clearRefreshCookie(res);
      throw AppError.of("UNAUTHORIZED", "Invalid refresh token");
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, emailVerified: true, authSessionVersion: true },
    });
    if (!user) {
      clearRefreshCookie(res);
      throw AppError.of("UNAUTHORIZED", "Invalid refresh token");
    }

    // Re-checked here, not trusted from the token. Verification state and the
    // session version live in the database precisely so that a state change
    // (address changed, password reset) takes effect without waiting for a
    // token to expire on its own.
    if (!isEmailVerified(user)) {
      clearRefreshCookie(res);
      throw AppError.of("EMAIL_NOT_VERIFIED", "Your email address is not verified yet.");
    }

    if ((decoded.sv ?? 0) !== sessionVersionOf(user)) {
      clearRefreshCookie(res);
      throw AppError.of("UNAUTHORIZED", "Session expired. Please sign in again.");
    }

    const tokens = generateTokens(user.id, sessionVersionOf(user));
    setRefreshCookie(res, tokens.refreshToken);

    ok(res, { accessToken: tokens.accessToken });
  })
);

router.get(
  "/me",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const user = await prisma.user.findUnique({
      where: { id: requireUser(req) },
      select: userSelect,
    });

    if (!user) throw AppError.of("NOT_FOUND", "User not found");

    // Belt and braces alongside /refresh: this is the call the browser makes
    // on every load, so it is where an unverified session is caught even if a
    // token from before the change is still in localStorage.
    if (!isEmailVerified(user)) {
      throw AppError.of("EMAIL_NOT_VERIFIED", "Your email address is not verified yet.");
    }

    ok(res, { user });
  })
);

/**
 * Verification status for the signed-in user.
 *
 * `/auth/me` already carries the flag; this exists so the settings screen can
 * ask one cheap question without pulling the whole profile, and so the answer
 * has a stable contract of its own.
 */
router.get(
  "/verification-status",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const user = await prisma.user.findUnique({
      where: { id: requireUser(req) },
      select: { email: true, emailVerified: true, emailVerifiedAt: true },
    });

    if (!user) throw AppError.of("NOT_FOUND", "User not found");

    ok(res, {
      email: user.email,
      emailVerified: isEmailVerified(user),
      emailVerifiedAt: isEmailVerified(user) ? user.emailVerifiedAt : null,
    });
  })
);

router.post(
  "/verify-email",
  asyncHandler(async (req, res) => {
    const { token } = parseOrThrow(tokenSchema, req.body);
    const outcome = await claimVerificationToken(token);

    switch (outcome) {
      case "verified":
        ok(res, { verified: true, message: "Your email address is verified. You can sign in now." });
        return;

      case "already-used":
        // Reached by clicking the same link twice, or by a mail scanner that
        // fetched it once on the user's behalf. Saying so is more useful than
        // "invalid", and it tells the user to go and sign in rather than hunt
        // for the email again.
        throw AppError.of("TOKEN_ALREADY_USED", "This link has already been used. If that was you, just sign in.");

      case "expired":
        throw AppError.of("TOKEN_EXPIRED", "This link has expired. Request a new one to verify your email.");

      default:
        throw AppError.of("INVALID_TOKEN", "This verification link is not valid.");
    }
  })
);

/**
 * Issues a fresh verification link.
 *
 * Three answers, and the split between them is deliberate:
 *
 *   - the mail server is unusable → 503 for EVERY caller, known address or
 *     not. Account-independent, so it is not an existence oracle, and nobody is
 *     told to check an inbox that cannot receive anything;
 *   - the provider refused the message → 502, truthfully. This is the one case
 *     that can reveal that an account exists, and it is accepted for that:
 *     silently answering "a link is on its way" when no link was sent is the
 *     behaviour that loses people's accounts;
 *   - the send went through, or there was nothing to send → the same generic
 *     200 either way, so a successful response still confirms nothing.
 */
router.post(
  "/resend-verification",
  asyncHandler(async (req, res) => {
    const { email } = parseOrThrow(emailOnlySchema, req.body);
    await requireWorkingMailServer();

    const normalized = normalizeEmail(email);
    const user = await prisma.user.findFirst({
      where: { email: { equals: normalized, mode: "insensitive" } },
      select: { id: true, username: true, email: true, emailVerified: true },
    });

    if (user && !isEmailVerified(user)) {
      try {
        await sendVerificationEmail(user);
      } catch (err) {
        // Clear the half-written token so a retry starts clean rather than
        // leaving a hash nobody holds.
        await clearVerificationToken(user.id).catch(() => undefined);
        console.error(`[email] resend verification failed for user ${user.id}`);
        throw mailError(err, "No new link was sent — please try again in a few minutes.");
      }
    }

    ok(res, {
      message: "If that address needs verification, a new link is on its way.",
    });
  })
);

/**
 * Starts a password reset.
 *
 * Same three-way split as resend, for the same reasons.
 */
router.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const { email } = parseOrThrow(emailOnlySchema, req.body);
    await requireWorkingMailServer();

    try {
      await sendPasswordResetEmail(normalizeEmail(email));
    } catch (err) {
      console.error("[email] password reset send failed");
      throw mailError(err, "No reset link was sent — please try again in a few minutes.");
    }

    ok(res, {
      message: "If that address has a Dangro account, a reset link is on its way.",
    });
  })
);

router.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const input = parseOrThrow(resetPasswordSchema, req.body);
    const { outcome, userId } = await claimPasswordResetToken(input.token);

    if (outcome === "expired") {
      throw AppError.of("TOKEN_EXPIRED", "This reset link has expired. Request a new one.");
    }
    if (outcome === "already-used") {
      throw AppError.of("TOKEN_ALREADY_USED", "This reset link has already been used.");
    }
    if (outcome !== "reset" || !userId) {
      throw AppError.of("INVALID_TOKEN", "This reset link is not valid.");
    }

    const hashedPassword = await bcrypt.hash(input.password, 12);

    // A reset that proves control of the inbox IS the verification step, so
    // the account is marked verified here rather than asking for a second
    // link the owner would have to click again. The version bump retires
    // every token issued under the old password — including one an attacker
    // was holding.
    await bumpSessionVersion(userId);

    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
        emailVerificationUsedAt: null,
      },
    });

    // No cleanup pass here: the token is already marked used, and its hash is
    // deliberately kept so a second click can be answered honestly.
    clearRefreshCookie(res);

    ok(res, {
      message: "Your password has been changed. You can sign in with it now.",
    });
  })
);

/**
 * Changes the password of a signed-in user.
 *
 * The current password is required even though the caller is authenticated:
 * a hijacked access token should not be enough to take the account over
 * permanently, and the check costs one bcrypt compare.
 *
 * Fresh tokens are returned and the session version is bumped, so the device
 * that made the change stays signed in while every other device is signed out.
 */
router.post(
  "/change-password",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const input = parseOrThrow(changePasswordSchema, req.body);

    if (input.currentPassword === input.newPassword) {
      throw AppError.of("BAD_REQUEST", "Choose a password different from your current one.");
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.of("NOT_FOUND", "User not found");

    const valid = await bcrypt.compare(input.currentPassword, user.password);
    if (!valid) throw AppError.of("UNAUTHORIZED", "Your current password is incorrect.");

    const nextVersion = sessionVersionOf(user) + 1;
    const hashedPassword = await bcrypt.hash(input.newPassword, 12);

    await bumpSessionVersion(userId);

    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        passwordResetUsedAt: null,
      },
    });

    const tokens = generateTokens(userId, nextVersion);
    setRefreshCookie(res, tokens.refreshToken);

    ok(res, {
      accessToken: tokens.accessToken,
      message: "Password updated. Other devices have been signed out.",
    });
  })
);

router.post("/logout", (_req, res) => {
  clearRefreshCookie(res);
  ok(res, { message: "Logged out" });
});

export default router;