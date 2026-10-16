import dotenv from "dotenv";
import path from "path";
import { publicOrigin } from "./lib/publicHost.js";

/**
 * Environment loading order (first file wins, later files only fill gaps):
 *   1. server/.env  — local development override
 *   2. <repo>/.env  — repository root fallback
 *
 * In production (Render) neither file exists: every value comes from the
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
  fail(`PORT must be a valid TCP port, received "${rawPort}"`, "Set PORT in your service environment (Render assigns one automatically).");
}

const jwtSecret = required(
  "JWT_SECRET",
  isProduction
    ? "Set JWT_SECRET in the Render service environment (Dashboard → Environment)."
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
        ? "Set DATABASE_URL in the Render service environment to your Neon connection string."
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
 *   this is what makes the single-origin Render architecture work).
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
