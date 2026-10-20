import { createHash, randomBytes } from "node:crypto";

/**
 * Everything about a verification link that can be decided without touching
 * the database or the mail server.
 *
 * Kept free of both so the rules that actually matter — what a token looks
 * like, how it is stored, what a link may contain — are testable in isolation
 * and cannot drift apart between the signup path, the resend path and the
 * password-reset path.
 */

/**
 * Token entropy. 32 bytes from the OS CSPRNG, base64url-encoded.
 *
 * The token is the *only* thing standing between "can read this inbox" and
 * "this account is verified", so it is generated from the platform CSPRNG and
 * never from `Math.random`. 256 bits of entropy also means a stored hash is
 * not brute-forceable, which is why a plain SHA-256 below is sufficient: there
 * is nothing to slow down.
 */
const TOKEN_BYTES = 32;

/** base64url, so the token survives being a query parameter unescaped. */
export function generateSecureToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * The single SHA-256 of the raw token, hex-encoded.
 *
 * Only this is persisted. A database dump — a backup, a replica, a support
 * export — then contains nothing that can be pasted into the verify endpoint.
 *
 * Deliberately not bcrypt/argon2: those exist to slow down guessing of low
 * entropy secrets, and a 256-bit random token has no guessable space to slow
 * down while costing a ~100ms verification on every request.
 */
export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/**
 * Canonical form of an address: trimmed and lower-cased.
 *
 * Applied at every write, so the unique index on `users.email` is a unique
 * index on *normalised* addresses — `Bob@Example.com` and `bob@example.com`
 * cannot both exist. Gmail-style dots are deliberately NOT stripped: doing so
 * is provider-specific, and getting it wrong silently merges two real mailboxes.
 */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * What the app is willing to echo back about an address it has just mailed.
 *
 * Signup and resend show this so the user can confirm which address the link
 * went to without the response becoming a directory of who has an account.
 */
export function maskEmail(email: string): string {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at <= 0) return "***";

  const local = normalized.slice(0, at);
  const domain = normalized.slice(at);

  // At most two characters, and never more than half of what is left. The
  // arithmetic matters for short addresses: revealing "the first two" of a
  // one-character local part would print the whole thing, turning a masked
  // address back into a readable one.
  const head = local.slice(0, Math.max(0, Math.min(2, Math.floor((local.length - 1) / 2))));
  return `${head}${"*".repeat(Math.max(3, local.length - head.length))}${domain}`;
}

/** Links always carry the token in the query string, never the fragment. */
function mailLink(baseUrl: string, path: string, token: string): string {
  // Tolerates a trailing slash even though `config.appBaseUrl` already strips
  // it: a doubled slash is a link some mail clients and proxies will not
  // resolve, and it is not worth a support ticket.
  return `${baseUrl.replace(/\/+$/, "")}${path}?token=${encodeURIComponent(token)}`;
}

export function verificationUrl(baseUrl: string, token: string): string {
  return mailLink(baseUrl, "/verify-email", token);
}

export function passwordResetUrl(baseUrl: string, token: string): string {
  return mailLink(baseUrl, "/reset-password", token);
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Escapes the handful of characters that break out of HTML text or an attribute. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A dark, table-based, inline-styled message.
 *
 * Everything is inline and every layout box is a `<table>`: Outlook's Word
 * rendering engine ignores `<style>` blocks and flexbox outright, so a
 * "modern" email built with them arrives as an unstyled wall of text at
 * exactly the corporate mailboxes that matter most here.
 */
function shell(opts: {
  preheader: string;
  heading: string;
  paragraphs: string[];
  buttonLabel: string;
  buttonUrl: string;
  footnote: string;
  mutedNote?: string;
}): string {
  const accent = "#6366f1";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>${escapeHtml(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#0b0d14;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0b0d14;padding:24px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#141824;border:1px solid #262b3a;border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

    <tr><td style="padding:28px 32px 8px;">
      <p style="margin:0;font-size:15px;font-weight:700;letter-spacing:-0.01em;color:#ffffff;">
        <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${accent};margin-right:8px;vertical-align:middle;"></span>Dangro
      </p>
    </td></tr>

    <tr><td style="padding:8px 32px 0;">
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.02em;color:#ffffff;">${escapeHtml(opts.heading)}</h1>
      ${opts.paragraphs
        .map(
          (text) =>
            `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#c3c8d6;">${escapeHtml(text)}</p>`
        )
        .join("\n      ")}
    </td></tr>

    <tr><td align="center" style="padding:8px 32px 24px;">
      <a href="${escapeHtml(opts.buttonUrl)}" style="display:inline-block;background:${accent};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:13px 28px;border-radius:10px;">${escapeHtml(opts.buttonLabel)}</a>
    </td></tr>

    <tr><td style="padding:0 32px 8px;">
      <p style="margin:0;font-size:13px;line-height:1.6;color:#7d8398;word-break:break-all;">${escapeHtml(opts.buttonUrl)}</p>
      <p style="margin:10px 0 0;font-size:13px;line-height:1.6;color:#7d8398;">${escapeHtml(opts.footnote)}</p>
      ${opts.mutedNote ? `<p style="margin:10px 0 0;font-size:13px;line-height:1.6;color:#7d8398;">${escapeHtml(opts.mutedNote)}</p>` : ""}
    </td></tr>

    <tr><td style="padding:20px 32px 28px;border-top:1px solid #262b3a;">
      <p style="margin:0;font-size:12px;line-height:1.6;color:#5f6577;">You are receiving this because someone signed up on Dangro with this address. No other mail is sent from this account.</p>
    </td></tr>

  </table>
</td></tr></table>
</body>
</html>`;
}

/**
 * "30 minutes" / "1 hour" / "2 hours".
 *
 * The exact figure matters: a user told a link lasts "1 hour" when it really
 * lasts 30 minutes will reasonably leave it until tomorrow, and the window
 * that is meant to cover "I am at my computer right now" no longer does.
 */
export function humanizeWindow(minutes: number): string {
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const hours = Math.round(minutes / 60);
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

export interface VerificationEmailInput {
  username: string;
  url: string;
  ttlMinutes: number;
}

export function renderVerificationEmail(input: VerificationEmailInput): RenderedEmail {
  const window = humanizeWindow(input.ttlMinutes);

  return {
    subject: "Verify your Dangro email address",
    html: shell({
      preheader: `Confirm this address to finish setting up @${input.username}.`,
      heading: `Welcome to Dangro, ${input.username}`,
      paragraphs: [
        "Confirm this email address to finish setting up your account. We use it to keep the community real and to let you recover your password if you forget it.",
        "This link works once and expires in " + window + ".",
      ],
      buttonLabel: "Verify Email",
      buttonUrl: input.url,
      footnote:
        "Button not working? Copy the address above into your browser. Nothing happens until you do — your account is not verified yet.",
      mutedNote: "Didn't create a Dangro account? You can ignore this email; no account was activated.",
    }),
    text: [
      `Welcome to Dangro, ${input.username}`,
      "",
      "Confirm this email address to finish setting up your account.",
      `This link works once and expires in ${window}.`,
      "",
      `Verify Email: ${input.url}`,
      "",
      "Button not working? Copy the address above into your browser. Nothing happens until you do — your account is not verified yet.",
      "",
      "Didn't create a Dangro account? You can ignore this email; no account was activated.",
    ].join("\n"),
  };
}

export interface PasswordResetEmailInput {
  username: string;
  url: string;
  ttlMinutes: number;
}

export function renderPasswordResetEmail(input: PasswordResetEmailInput): RenderedEmail {
  const window = humanizeWindow(input.ttlMinutes);

  return {
    subject: "Reset your Dangro password",
    html: shell({
      preheader: `A password reset was requested for @${input.username}.`,
      heading: "Reset your password",
      paragraphs: [
        `A password reset was requested for @${input.username}. Use the button below to choose a new one.`,
        "This link works once and expires in " + window + ".",
      ],
      buttonLabel: "Reset Password",
      buttonUrl: input.url,
      footnote:
        "If you did not ask for this, ignore the email — your password stays as it is and nothing has changed.",
      mutedNote: "For your safety this link cannot be used from a different browser session without signing in again afterwards.",
    }),
    text: [
      "Reset your password",
      "",
      `A password reset was requested for @${input.username}.`,
      `This link works once and expires in ${window}.`,
      "",
      `Reset Password: ${input.url}`,
      "",
      "If you did not ask for this, ignore the email — your password stays as it is and nothing has changed.",
    ].join("\n"),
  };
}

/**
 * Sent to the OLD address so the real owner learns the account was moved.
 *
 * There is deliberately no "reset my password" link here. Once the change has
 * landed, a reset link goes to the NEW address — the one the person reading
 * this mail does not control — so pointing them at one would be a promise the
 * app cannot keep. The copy says what is actually true: the password did not
 * change, and recovery now runs through support.
 */
export function renderEmailChangeAlertEmail(input: {
  username: string;
  newAddress: string;
  /** Public origin, for the sign-in link. */
  baseUrl: string;
}): RenderedEmail {
  const body =
    `The email address on your Dangro account @${input.username} was changed to ${input.newAddress}. ` +
    `Your password was NOT changed. If this was not you, contact support straight away.`;

  return {
    subject: "Your Dangro email address was changed",
    html: shell({
      preheader: `The sign-in address on @${input.username} just changed.`,
      heading: "Your email address was changed",
      paragraphs: [body],
      buttonLabel: "Sign in",
      buttonUrl: `${input.baseUrl.replace(/\/+$/, "")}/login`,
      footnote: "If you did make this change, no action is needed.",
      mutedNote:
        "Password resets for this account now go to the new address, so use 'Forgot password' only once you can read that inbox.",
    }),
    text: [
      "Your email address was changed",
      "",
      body,
      "",
      `Sign in: ${input.baseUrl.replace(/\/+$/, "")}/login`,
      "",
      "Password resets for this account now go to the new address, so use 'Forgot password' only once you can read that inbox.",
    ].join("\n"),
  };
}