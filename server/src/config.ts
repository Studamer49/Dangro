import dotenv from "dotenv";
import path from "path";
import { publicOrigin } from "./lib/publicHost.js";

/**
 * Environment loading order (first file wins, later files only fill gaps):
 *   1. server/.env  — local development override
 *   2. <repo>/.env  — repository root fallback
 *
 * In production (Cloudflare) neither file exists: every value comes from the
 * service environment. Never commit either file — only `.env.example`.
 *
 * Skipped under NODE_ENV=test. Otherwise a developer's local server/.env
 * decides what the suite sees: setting MEDIA_PROVIDER=disk locally made
 * "defaults to gridfs on MongoDB" fail on a machine that had never opted out
 * of GridFS. Tests must depend on the environment they set, nothing else.
 */
const isTest = process.env.NODE_ENV === "test";

if (!isTest) {
  dotenv.config({ path: path.resolve(__dirname, "../.env") });
  dotenv.config({ path: path.resolve(__dirname, "../../.env") });
}

const isProduction = process.env.NODE_ENV === "production";

// Test suites run DB-free: allow them to import the server and hit routes
// that never touch Prisma, even when no real credentials are configured.
if (isTest) {
  process.env.JWT_SECRET ??= "test-jwt-secret-that-is-definitely-long-enough-0123456789";
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/dangro-test";
}

/** Thrown instead of exiting when the module is under test, so the test can assert the failure. */
export class ConfigError extends Error {}

function fail(message: string, hint: string): never {
  console.error(`\n[fatal] ${message}`);
  console.error(`        ${hint}\n`);

  // config.test.ts imports this module with bad values on purpose. Calling
  // process.exit there would take the whole test runner down with it, so the
  // throw surfaces the same failure to the caller instead.
  if (isTest) throw new ConfigError(message);

  process.exit(1);
}

function required(name: string, hint: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) fail(`Missing required environment variable: ${name}`, hint);
  return value.trim();
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

/** Best-effort hostname for an error message; never throws on a malformed URL. */
function safeHostname(value: string): string {
  try {
    return new URL(value.trim()).hostname;
  } catch {
    return value.trim();
  }
}

const rawPort = process.env.PORT ?? "3001";
const port = Number.parseInt(rawPort, 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  fail(`PORT must be a valid TCP port, received "${rawPort}"`, "Set PORT in the container environment (Cloudflare sets it to 8080).");
}

const jwtSecret = required(
  "JWT_SECRET",
  isProduction
    ? "Set JWT_SECRET as a Worker secret (`wrangler secret put JWT_SECRET`)."
    : "Add JWT_SECRET to server/.env — see server/.env.example."
);

if (isProduction && jwtSecret.length < 32) {
  console.warn("[config] WARNING: JWT_SECRET is shorter than 32 characters. Use a long random string in production.");
}

/**
 * Which database backs the server. "postgres" (Prisma, the default) or
 * "mongo" (the MongoDB engine in `src/db`). Both expose the same client
 * surface, so no route changes either way.
 */
const databaseProvider = optional("DATABASE_PROVIDER", "postgres");
if (databaseProvider !== "postgres" && databaseProvider !== "mongo") {
  fail(
    `DATABASE_PROVIDER must be "postgres" or "mongo", received "${databaseProvider}"`,
    'Set DATABASE_PROVIDER="postgres" or "mongo" in server/.env.'
  );
}
const usesMongo = databaseProvider === "mongo";

// Where uploaded media is stored. Defaults follow the database choice, and
// can be overridden so media can live somewhere other than the database.
//   disk   - server/uploads, served by express.static (PostgreSQL default)
//   gridfs - GridFS inside MongoDB (MongoDB default)
//   remote - a separate media host; the API redirects to it
const requestedMediaProvider = optional(
  "MEDIA_PROVIDER",
  usesMongo ? "gridfs" : "disk"
);
if (!["disk", "gridfs", "remote"].includes(requestedMediaProvider)) {
  fail(
    `MEDIA_PROVIDER must be "disk", "gridfs" or "remote", received "${requestedMediaProvider}"`,
    'Set MEDIA_PROVIDER in server/.env, or remove it to use the default for your database.'
  );
}
// GridFS lives inside MongoDB, so with the PostgreSQL backend it cannot be
// used at all. Resolve it to the effective value here rather than only
// warning, so nothing downstream acts on a provider that cannot work.
const mediaProvider = requestedMediaProvider === "gridfs" && !usesMongo ? "disk" : requestedMediaProvider;
if (requestedMediaProvider !== mediaProvider) {
  console.warn(
    `[config] MEDIA_PROVIDER=${requestedMediaProvider} but DATABASE_PROVIDER is not mongo — using "${mediaProvider}" instead.`
  );
}

const mediaPublicUrl = optional("MEDIA_PUBLIC_URL", "");
const mediaIngestUrl = optional("MEDIA_INGEST_URL", mediaPublicUrl || "http://127.0.0.1:8081");
const mediaIngestKey = optional("MEDIA_INGEST_KEY", "");

if (mediaProvider === "remote") {
  if (!mediaPublicUrl) {
    fail(
      "MEDIA_PUBLIC_URL is required when MEDIA_PROVIDER=remote",
      "Set MEDIA_PUBLIC_URL to the public base URL of your media host, e.g. https://host.tailnet.ts.net"
    );
  }
  // The browser follows this URL for every image, video and audio clip. A value
  // that is not https, or that points inside the visitor's own network, makes
  // the browser ask "wants to see devices on your local network" and then fail
  // to load the image — so refuse to boot rather than serve a site like that.
  if (!publicOrigin(mediaPublicUrl)) {
    const reason = !/^https:\/\//i.test(mediaPublicUrl.trim())
      ? "it is not an https:// URL"
      : `its host "${safeHostname(mediaPublicUrl)}" is private, loopback or LAN-only`;
    fail(
      `MEDIA_PUBLIC_URL is not usable as a browser-facing origin: ${reason}`,
      "Use the public https:// address of the media host (e.g. https://host.tailnet.ts.net), or set MEDIA_PROVIDER=gridfs to serve media from this app's own origin at no extra cost."
    );
  }
  if (!mediaIngestKey) {
    fail(
      "MEDIA_INGEST_KEY is required when MEDIA_PROVIDER=remote",
      "It must match MEDIA_KEY on the media host and is the only thing guarding write access."
    );
  }
  if (mediaIngestKey.length < 32) {
    console.warn("[config] WARNING: MEDIA_INGEST_KEY is shorter than 32 characters.");
  }
}

const mongoUri = optional("MONGODB_URI", "mongodb://127.0.0.1:27017");
const mongoDbName = optional("MONGODB_DB_NAME", "dangro");

// ---------------------------------------------------------------------------
// Cloudinary — image storage, optimisation and delivery.
//
// Images are uploaded from this backend to Cloudinary and served from
// https://res.cloudinary.com/... The browser only ever talks to this API,
// so no LAN address or local device is ever contacted.
//
// Credentials are deliberately NOT validated at boot. A missing key must not
// take down the whole API for users who are not uploading an image; the
// upload path fails with a message naming the missing variables instead.
// ---------------------------------------------------------------------------

/**
 * Cloudinary's own single-variable form:
 *
 *   CLOUDINARY_URL="cloudinary://<api_key>:<api_secret>@<cloud_name>"
 *
 * This is what the Cloudinary documentation, dashboard "copy" button and CLI
 * default to, so it is a very plausible thing to have been configured while
 * `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`
 * stayed empty. Before this existed the app reported itself unconfigured in
 * that setup and refused every image, which looked exactly like the upload
 * code never calling Cloudinary.
 *
 * Read as a fallback only: the three discrete variables always win, so adding
 * CLOUDINARY_URL can never override a deliberately-set value.
 */
function credentialsFromCloudinaryUrl(): { cloudName: string; apiKey: string; apiSecret: string } {
  const empty = { cloudName: "", apiKey: "", apiSecret: "" };
  const raw = optional("CLOUDINARY_URL", "");
  if (!raw) return empty;

  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    fail(
      "CLOUDINARY_URL is not a valid URL",
      'Use CLOUDINARY_URL="cloudinary://API_KEY:API_SECRET@CLOUD_NAME", or set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET instead.'
    );
  }

  if (parsed.protocol !== "cloudinary:") {
    fail(
      `CLOUDINARY_URL must use the cloudinary:// scheme, received "${parsed.protocol}//"`,
      'Example: CLOUDINARY_URL="cloudinary://123456789012345:abcdef...@my-cloud"'
    );
  }

  // username/password carry the API key and secret; the host carries the cloud
  // name. decodeURIComponent because a secret may legitimately contain '%'.
  const apiKey = decodeURIComponent(parsed.username || "").trim();
  const apiSecret = decodeURIComponent(parsed.password || "").trim();
  const cloudName = (parsed.hostname || parsed.pathname.replace(/^\/+/, "")).trim();

  if (!apiKey || !apiSecret || !cloudName) {
    fail(
      "CLOUDINARY_URL is missing its API key, API secret or cloud name",
      'Expected the form CLOUDINARY_URL="cloudinary://API_KEY:API_SECRET@CLOUD_NAME".'
    );
  }

  return { cloudName, apiKey, apiSecret };
}

const fromUrl = credentialsFromCloudinaryUrl();
const cloudinaryCloudName = optional("CLOUDINARY_CLOUD_NAME", "") || fromUrl.cloudName;
const cloudinaryApiKey = optional("CLOUDINARY_API_KEY", "") || fromUrl.apiKey;
const cloudinaryApiSecret = optional("CLOUDINARY_API_SECRET", "") || fromUrl.apiSecret;

/**
 * Names absent from the *resolved* credentials, for the "not configured"
 * message. Checked after the CLOUDINARY_URL fallback, so that URL alone is
 * reported as configured rather than as three missing variables.
 */
const cloudinaryMissingVars = (
  [
    ["CLOUDINARY_CLOUD_NAME", cloudinaryCloudName],
    ["CLOUDINARY_API_KEY", cloudinaryApiKey],
    ["CLOUDINARY_API_SECRET", cloudinaryApiSecret],
  ] as const
)
  .filter(([, value]) => value.trim() === "")
  .map(([name]) => name);

/**
 * Which variable supplied the credentials, purely for the startup log. Never
 * any part of the credentials themselves.
 */
const cloudinaryCredentialSource = cloudinaryMissingVars.length
  ? null
  : cloudinaryCloudName === fromUrl.cloudName && fromUrl.cloudName
    ? "CLOUDINARY_URL"
    : "CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET";

// Images default to 8 MB. CLOUDINARY_IMAGE_MAX_BYTES overrides it; the value
// is clamped so a typo cannot turn the limit off entirely.
const CLOUDINARY_IMAGE_MAX_BYTES_DEFAULT = 8 * 1024 * 1024;
const cloudinaryImageMaxBytes = (() => {
  const raw = optional("CLOUDINARY_IMAGE_MAX_BYTES", "");
  if (!raw) return CLOUDINARY_IMAGE_MAX_BYTES_DEFAULT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1024) {
    console.warn("[config] CLOUDINARY_IMAGE_MAX_BYTES must be at least 1024 — using the 8 MB default.");
    return CLOUDINARY_IMAGE_MAX_BYTES_DEFAULT;
  }
  return Math.min(parsed, 50 * 1024 * 1024);
})();

const cloudinaryConfigured = cloudinaryMissingVars.length === 0;

// Only the PostgreSQL backend needs a connection string.
const databaseUrl = usesMongo
  ? optional("DATABASE_URL", "")
  : required(
      "DATABASE_URL",
      isProduction
        ? "Set DATABASE_URL as a Worker secret to your Neon connection string."
        : "Add DATABASE_URL to server/.env — see server/.env.example."
    );

/**
 * TURN relay configuration.
 *
 * Calls between two networks (different cities, countries, mobile data,
 * corporate NAT) frequently have no direct path, so the media has to be
 * relayed. Two credential modes:
 *   - static:  TURN_USERNAME + TURN_CREDENTIAL are handed to every client.
 *   - secret:  TURN_SECRET signs short-lived per-user credentials (the coturn
 *              "REST API" / `static-auth-secret` scheme), so the shared relay
 *              password never reaches the browser and a leaked credential
 *              expires on its own.
 */
const turnUrls = optional("TURN_URLS", "")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
const turnSecret = optional("TURN_SECRET", "");
const turnUsername = optional("TURN_USERNAME", "");
const turnCredential = optional("TURN_CREDENTIAL", "");
const turnTtlSeconds = Math.min(
  24 * 60 * 60,
  Math.max(60, Number.parseInt(optional("TURN_TTL_SECONDS", "3600"), 10) || 3600)
);

/** Comma-separated list of allowed browser origins (CORS + Socket.IO). */
const clientUrls = optional("CLIENT_URL", "http://localhost:5173")
  .split(",")
  .map((url) => url.trim().replace(/\/$/, ""))
  .filter(Boolean);

// ---------------------------------------------------------------------------
// Email — SMTP delivery for address verification, password resets and
// email-change confirmations.
//
// Credentials are deliberately NOT validated at boot, for the same reason
// Cloudinary's are not: a missing mail server must not take down chat,
// messages and friends for everyone. What it *does* have to guarantee is that
// no route silently treats an account as verified because it could not send
// an email — the signup, resend and reset paths return 503 and name the
// missing variables instead.
//
// Every value here is SERVER-ONLY. None of them may ever take a VITE_ prefix:
// that would inline the SMTP password into the browser bundle.
// ---------------------------------------------------------------------------

/** Bounded integer from the environment, falling back with a warning on a typo. */
function boundedInt(name: string, fallback: number, min: number, max: number): number {
  const raw = optional(name, "");
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    console.warn(`[config] ${name} must be an integer between ${min} and ${max} — using ${fallback}.`);
    return fallback;
  }
  return parsed;
}

const smtpHost = optional("SMTP_HOST", "");
const smtpPort = boundedInt("SMTP_PORT", 587, 1, 65535);
const smtpUser = optional("SMTP_USER", "");
const smtpPass = optional("SMTP_PASS", "");
// Port 465 is implicit TLS; every other common port starts in the clear and is
// upgraded with STARTTLS, which is what `secure: false` asks nodemailer for.
const smtpSecure = optional("SMTP_SECURE", smtpPort === 465 ? "true" : "false").toLowerCase() === "true";

// Half of a credential pair without the other half is always a mistake, and
// sending it would produce a confusing 535/504 from the provider instead of a
// named variable at boot.
if ((smtpUser && !smtpPass) || (!smtpUser && smtpPass)) {
  fail(
    smtpUser ? "SMTP_USER is set but SMTP_PASS is not" : "SMTP_PASS is set but SMTP_USER is not",
    "Set both SMTP_USER and SMTP_PASS to the mailbox credentials your provider issued, or remove both for an unauthenticated local relay."
  );
}

// Most providers use the login address as the From address, so defaulting to
// it removes one variable from the setup without ever guessing a domain.
const emailFrom = optional("EMAIL_FROM", smtpUser);
const emailFromName = optional("EMAIL_FROM_NAME", "Dangro");

/**
 * `smtp` talks to a real mail server. `json` renders the message and drops it
 * in the server log instead of delivering it — for working on the UI with no
 * mail account, and as the transport the test suite uses. Nothing is ever
 * marked verified because of `json`: a token still has to be clicked.
 */
const requestedEmailTransport = optional("EMAIL_TRANSPORT", "smtp");
if (requestedEmailTransport !== "smtp" && requestedEmailTransport !== "json") {
  fail(
    `EMAIL_TRANSPORT must be "smtp" or "json", received "${requestedEmailTransport}"`,
    'Set EMAIL_TRANSPORT="json" to render emails to the server log without delivering them, or remove it to send real mail.'
  );
}

// In `json` mode nothing is delivered, so requiring a mail server would make
// the mode useless for the two things it exists for: working on the UI with
// no mail account, and running the suite.
const emailMissingVars =
  requestedEmailTransport === "json"
    ? []
    : (
        [
          ["SMTP_HOST", smtpHost],
          ["EMAIL_FROM", emailFrom],
        ] as const
      )
        .filter(([, value]) => value.trim() === "")
        .map(([name]) => name);

const emailConfigured = emailMissingVars.length === 0;

/**
 * The absolute, publicly reachable origin the app is served from, used to
 * build the links inside every email.
 *
 * APP_BASE_URL wins; otherwise the first CLIENT_URL is used, which is correct
 * for both layouts this project supports (single-origin Cloudflare, and the Vite
 * dev server on :5173). Anything that is not an absolute http(s) URL is
 * refused outright — a malformed base silently produces a link that goes
 * nowhere, and the only symptom is a user staring at an inbox.
 */
const appBaseUrl = (() => {
  const raw = optional("APP_BASE_URL", "") || clientUrls[0] || "http://localhost:5173";
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    fail(
      `APP_BASE_URL is not a valid URL (received "${raw}")`,
      "Set APP_BASE_URL to the public address of the app, e.g. https://dangro.<subdomain>.workers.dev"
    );
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    fail(
      `APP_BASE_URL must use http:// or https://, received "${parsed.protocol}//"`,
      'Example: APP_BASE_URL="https://dangro.<subdomain>.workers.dev"'
    );
  }
  if (parsed.username || parsed.password) {
    fail("APP_BASE_URL must not contain credentials", "Remove the user:password part — it ends up in every email link.");
  }
  // Trailing slash stripped so `${appBaseUrl}/verify-email` never doubles it.
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
})();

if (isProduction && !publicOrigin(appBaseUrl)) {
  console.warn(
    `[config] APP_BASE_URL resolves to "${appBaseUrl}", which is not a public https origin — verification and password-reset links will not work for anyone outside your network.`
  );
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction,
  isTest,
  port,
  databaseProvider,
  usesMongo,
  mongoUri,
  mongoDbName,
  mediaProvider,
  mediaPublicUrl,
  cloudinary: {
    cloudName: cloudinaryCloudName,
    apiKey: cloudinaryApiKey,
    apiSecret: cloudinaryApiSecret,
    configured: cloudinaryConfigured,
    missingVars: cloudinaryMissingVars,
    /** Which variable supplied them. Startup logs only — never the values. */
    credentialSource: cloudinaryCredentialSource,
    imageMaxBytes: cloudinaryImageMaxBytes,
    /**
     * The delivery host. Images are fetched from here by the browser, so it
     * has to be named in the CSP or every image is blocked while the upload
     * itself reports success.
     */
    deliveryHost: "https://res.cloudinary.com",
    /**
     * Folder inside the Cloudinary media library. Images go to a nested
     * `images` folder so they sit apart from anything else in the account.
     * Trailing slashes are stripped so a stray one cannot produce a double
     * slash in the asset path.
     */
    folder: optional("CLOUDINARY_FOLDER", "dangro/images").replace(/\/+$/, ""),
    /** Abort an upload that has not completed within this many ms. */
    timeoutMs: Number.parseInt(optional("CLOUDINARY_TIMEOUT_MS", "30000"), 10) || 30_000,
  },
  mediaIngestUrl,
  mediaIngestKey,
  email: {
    transport: requestedEmailTransport,
    host: smtpHost,
    port: smtpPort,
    user: smtpUser,
    pass: smtpPass,
    secure: smtpSecure,
    /** Abort a send that has not completed within this many ms. */
    timeoutMs: boundedInt("EMAIL_TIMEOUT_MS", 10_000, 1_000, 120_000),
    from: emailFrom,
    fromName: emailFromName,
    /** Whether the `From:` header should read "Dangro <addr>" or bare "addr". */
    fromFormatted: emailFromName.trim() !== "",
    configured: emailConfigured,
    missingVars: emailMissingVars,
  },
  /** Public origin used to build every link inside an email. */
  appBaseUrl,
  emailVerification: {
    /** How long a verification link stays usable. */
    tokenTtlMinutes: boundedInt("EMAIL_VERIFICATION_TOKEN_TTL_MINUTES", 30, 5, 1440),
    /** How long a password-reset link stays usable. */
    resetTokenTtlMinutes: boundedInt("PASSWORD_RESET_TOKEN_TTL_MINUTES", 30, 5, 1440),
    /**
     * Per-IP request budget for token *submission* and resend/reset requests.
     * Read per request from the environment so an operator can tighten it on a
     * busy deployment without a code change, and so the test suite can exercise
     * the real limiter with a tiny budget (see lib/rateLimits.ts).
     */
    verifyRateLimit: boundedInt("EMAIL_VERIFY_RATE_LIMIT", 20, 1, 1000),
    resendRateLimit: boundedInt("EMAIL_RESEND_RATE_LIMIT", 5, 1, 1000),
  },
  databaseUrl,
  jwtSecret,
  jwtRefreshSecret: optional("JWT_REFRESH_SECRET", jwtSecret + "_refresh"),
  clientUrls,
  turn: {
    urls: turnUrls,
    configured: turnUrls.length > 0,
    secret: turnSecret,
    username: turnUsername,
    credential: turnCredential,
    ttlSeconds: turnTtlSeconds,
  },
  /** Absolute, CWD-independent directory where uploaded files are written.
   *  Override with UPLOAD_DIR (e.g. a persistent disk mount in production). */
  uploadDir: process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.resolve(__dirname, "../uploads"),
} as const;

/** Origins accepted in local development regardless of CLIENT_URL. */
export const devOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
];

/**
 * CORS / Socket.IO origin decision.
 *
 * - No Origin header  -> non-browser client (curl, tests) -> allowed.
 * - Matches CLIENT_URL -> allowed.
 * - Matches a dev origin and we are not in production -> allowed.
 * - Matches the Host the request arrived on -> allowed (same-service deploy,
 *   this is what makes the single-origin Cloudflare architecture work).
 *
 * Never returns "*" because credentials (cookies + Authorization) are in use.
 */
export function isAllowedOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true;
  if (config.isTest) return true;
  if (config.clientUrls.includes(origin.replace(/\/$/, ""))) return true;
  if (!config.isProduction && devOrigins.includes(origin)) return true;
  if (host) {
    try {
      if (new URL(origin).host === host) return true;
    } catch {
      /* malformed origin */
    }
  }
  return false;
}
