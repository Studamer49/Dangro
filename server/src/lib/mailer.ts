import nodemailer, { type SendMailOptions, type Transporter } from "nodemailer";
import { config } from "../config.js";
import { AppError } from "./http.js";

/**
 * SMTP delivery.
 *
 * The only place in the app that talks to a mail server. Every route that
 * promises a user "check your inbox" goes through `sendMail`, so there is a
 * single place where a timeout, a rejected login or an unreachable relay is
 * turned into a truthful answer instead of a silent success.
 */

export interface OutgoingMail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * A send that did not happen, for a reason the caller may be able to fix.
 *
 * Carries a short, already-sanitised reason for the server log. It never
 * carries the SMTP password, the token, or the provider's raw response body:
 * those end up in log aggregators, and a provider error string routinely
 * quotes the credentials it rejected.
 */
export class MailDeliveryError extends Error {
  constructor(
    message: string,
    readonly reason: string
  ) {
    super(message);
    this.name = "MailDeliveryError";
  }
}

/**
 * Throws the user-facing 503 when the mail server is not configured.
 *
 * Called at the TOP of every route that must send mail, before any account is
 * created or any token is stored. That ordering is the whole point: a user
 * must never end up with an account that cannot be verified because the
 * operator forgot an environment variable.
 */
export function assertEmailConfigured(): void {
  if (config.email.configured) return;
  throw AppError.of(
    "SERVICE_UNAVAILABLE",
    `Email is not configured on this server (missing ${config.email.missingVars.join(", ")}), so the message could not be sent. Nothing has been changed — please try again once an administrator has set it up.`,
    { missing: config.email.missingVars }
  );
}

let cached: Transporter | null = null;

function transporter(): Transporter {
  if (cached) return cached;

  if (config.email.transport === "json") {
    // Renders the message and returns it as JSON. Nothing leaves the process,
    // which is exactly what the local UI workflow and the test suite want.
    cached = nodemailer.createTransport({ jsonTransport: true });
    return cached;
  }

  cached = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    // Implicit TLS on 465; STARTTLS on 587 and everything else.
    secure: config.email.secure,
    // Only send the password when there is one: an unauthenticated local
    // relay (MailHog, a dev container) rejects an empty AUTH exchange.
    ...(config.email.user ? { auth: { user: config.email.user, pass: config.email.pass } } : {}),
    connectionTimeout: config.email.timeoutMs,
    greetingTimeout: config.email.timeoutMs,
    socketTimeout: config.email.timeoutMs,
  });
  return cached;
}

/**
 * Keeps a provider's error text from reaching a log verbatim.
 *
 * Nodemailer surfaces the server's response line, which for an authentication
 * failure can contain the login it was given. Only a short classification is
 * allowed through.
 */
function classify(err: unknown): string {
  const code = typeof err === "object" && err !== null ? String((err as { code?: unknown }).code ?? "") : "";

  switch (code) {
    case "EAUTH":
    case "EENVELOPE":
      return "the mail server rejected the credentials or the sender address";
    case "ECONNECTION":
    case "ECONNREFUSED":
    case "EDNS":
    case "ETIMEDOUT":
    case "ESOCKET":
      return "the mail server could not be reached";
    case "EMESSAGE":
      return "the mail server refused the message";
    case "ETIMEOUT":
      return "the mail server did not respond in time";
    default:
      return "the message could not be delivered";
  }
}

/**
 * The `From:` header.
 *
 * `"Dangro <no-reply@…>"` when a sender name is configured, bare address
 * otherwise. Exported because this is the one line a provider's spam filter
 * reads most carefully, so it is worth asserting on directly rather than
 * inferring from a log line.
 */
export function buildFromHeader(from: string, name: string, formatted: boolean): string {
  // The blank-name guard is redundant with `config.email.fromFormatted` and
  // deliberate anyway: `" <>someone@…"` is a malformed header that some
  // providers reject outright, and the fix belongs next to the formatting.
  return formatted && name.trim() !== "" ? `${name} <${from}>` : from;
}

/**
 * Sends one message, or throws `MailDeliveryError`.
 *
 * Never resolves for a message that was not handed to the provider: a caller
 * that gets a resolved promise can truthfully say "check your inbox".
 */
export async function sendMail(mail: OutgoingMail): Promise<void> {
  assertEmailConfigured();

  const from = buildFromHeader(config.email.from, config.email.fromName, config.email.fromFormatted);

  const message: SendMailOptions = {
    from,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    // No reply-to is configured by default, so replies go to the address the
    // provider authenticated, which is a real mailbox rather than a bounce
    // catcher nobody reads.
  };

  // A hard deadline on top of nodemailer's own socket timeouts: a provider
  // that accepts the connection and then stalls still fails in bounded time
  // instead of holding a signup request open until the proxy gives up.
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new MailDeliveryError("Email delivery timed out", "the mail server did not respond in time")),
        config.email.timeoutMs
      );
    });

    await Promise.race([transporter().sendMail(message), timeout]);

    if (config.email.transport === "json") {
      // The message was serialised, not delivered. Say so out loud: this mode
      // is for working on the UI without a mail account, and silently calling
      // it "sent" is how a link gets lost.
      //
      // Only the envelope is logged — recipient masked, subject. The
      // serialised body is NOT, because it contains the one-time token: a
      // deploy log is the last place a verification link should end up.
      console.warn(
        `[email] EMAIL_TRANSPORT=json — rendered but NOT delivered to ${maskForLog(mail.to)} ` +
          `("${mail.subject}"). Use a real SMTP host, or keep this mode for local UI work only.`
      );
    }
  } catch (err) {
    if (err instanceof MailDeliveryError) throw err;
    throw new MailDeliveryError("The verification email could not be sent", classify(err));
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Addresses logged as a delivery failure: their domain, never the local part.
 *
 * Logs never carry a full address (it is personal data and a correlatable
 * identifier) and never carry the token.
 */
export function maskForLog(address: string): string {
  const at = address.lastIndexOf("@");
  return at <= 0 ? "***" : `***@${address.slice(at + 1)}`;
}

/**
 * How long a health verdict is reused.
 *
 * Long enough that a burst of resend requests does not open one SMTP
 * connection each, short enough that a provider outage is noticed within
 * seconds rather than minutes. The probe is a single `NOOP` on a pooled
 * connection, so this is not a meaningful extra load.
 */
const HEALTH_TTL_MS = 10_000;

let cachedHealth: { at: number; value: EmailHealth } | null = null;

/**
 * Is the mail server usable right now?
 *
 * Routes call this BEFORE looking an address up, which is what lets them be
 * both honest and non-enumerating: a server that cannot send mail answers
 * identically for every address, so "there is no account here" and "the
 * provider is down" never become distinguishable from the response.
 *
 * A successful `verify()` is a real SMTP round trip, hence the TTL cache.
 */
export async function emailServerHealth(): Promise<EmailHealth> {
  const now = Date.now();
  if (cachedHealth && now - cachedHealth.at < HEALTH_TTL_MS) return cachedHealth.value;

  const value = await checkEmailConnection();
  cachedHealth = { at: now, value };
  return value;
}

/** Drops the cached verdict. Used by the test suite; not on any hot path. */
export function resetEmailHealthCache(): void {
  cachedHealth = null;
}

export interface EmailHealth {
  configured: boolean;
  transport: string;
  reachable: boolean;
  detail: string;
}

/**
 * One-line startup verdict on email delivery, mirroring the Cloudinary one.
 *
 * Not fatal: a missing mail server must not stop the app from serving chat.
 */
export async function checkEmailConnection(): Promise<EmailHealth> {
  if (!config.email.configured) {
    return { configured: false, transport: config.email.transport, reachable: false, detail: `missing ${config.email.missingVars.join(", ")}` };
  }

  if (config.email.transport === "json") {
    return { configured: true, transport: "json", reachable: true, detail: "messages are written to the server log, not delivered" };
  }

  try {
    await transporter().verify();
    return { configured: true, transport: "smtp", reachable: true, detail: `SMTP ${config.email.host}:${config.email.port}` };
  } catch (err) {
    // Only the classification — never the provider's raw response, which can
    // echo the credentials back.
    return { configured: true, transport: "smtp", reachable: false, detail: classify(err) };
  }
}