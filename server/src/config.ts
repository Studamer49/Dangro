import dotenv from "dotenv";
import path from "path";

/**
 * Environment loading order (first file wins, later files only fill gaps):
 *   1. server/.env  — local development override
 *   2. <repo>/.env  — repository root fallback
 *
 * In production (Render) neither file exists: every value comes from the
 * service environment. Never commit either file — only `.env.example`.
 */
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

// Test suites run DB-free: allow them to import the server and hit routes
// that never touch Prisma, even when no real credentials are configured.
if (isTest) {
  process.env.JWT_SECRET ??= "test-jwt-secret-that-is-definitely-long-enough-0123456789";
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/dangro-test";
}

function fail(message: string, hint: string): never {
  console.error(`\n[fatal] ${message}`);
  console.error(`        ${hint}\n`);
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

const databaseUrl = required(
  "DATABASE_URL",
  isProduction
    ? "Set DATABASE_URL in the Render service environment to your Neon connection string."
    : "Add DATABASE_URL to server/.env — see server/.env.example."
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
  databaseUrl,
  jwtSecret,
  jwtRefreshSecret: optional("JWT_REFRESH_SECRET", jwtSecret + "_refresh"),
  clientUrls,
  /** Absolute, CWD-independent directory where uploaded files are written. */
  uploadDir: path.resolve(__dirname, "../uploads"),
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
