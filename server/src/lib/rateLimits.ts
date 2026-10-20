import rateLimit from "express-rate-limit";
import { config } from "../config.js";

/**
 * Rate limits for the account endpoints.
 *
 * They live here rather than inline in `index.ts` so the route tests can mount
 * the very same limiter objects the server mounts, instead of a re-declared
 * copy that could drift.
 *
 * The three that matter are separated from the general `authLimiter` because
 * they have different abuse shapes:
 *
 *   - **signup** is already capped by the existing 30/15min auth limiter;
 *   - **verifying** is bounded per IP because a token is 256 bits, so there is
 *     nothing to guess — the cap exists to stop a script hammering the endpoint;
 *   - **resend / forgot-password** are the dangerous ones. They turn the server
 *     into a mail relay pointed at a third party's inbox, so they get the
 *     tightest budget of the three.
 */

const jsonResponse = (code: "RATE_LIMITED", message: string) =>
  ({ success: false, error: { code, message } }) as const;

/**
 * Reads the live budget for a limiter.
 *
 * `limit` is evaluated per request, so an operator can raise or lower it on a
 * live deployment by setting the environment variable and restarting — and the
 * test suite can exercise the real limiter with a budget of 3 instead of
 * firing hundreds of requests.
 */
function budget(variable: string, fallback: number): number {
  const raw = process.env[variable];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const common = {
  windowMs: 15 * 60 * 1000,
  standardHeaders: "draft-7" as const,
  legacyHeaders: false,
  /**
   * The suite skips the app's global limiter, and these follow it so a test
   * run cannot exhaust a budget meant for real traffic.
   *
   * The escape hatch is "set the limit explicitly": if an operator — or a
   * test — names a budget, the limiter runs even under NODE_ENV=test. That
   * keeps the tests honest (they exercise this exact object) without leaving a
   * switch that silently disables rate limiting in production.
   */
  skip: (name: string) => () => config.isTest && !process.env[name],
};

export const verifyEmailLimiter = rateLimit({
  ...common,
  limit: () => budget("EMAIL_VERIFY_RATE_LIMIT", config.emailVerification.verifyRateLimit),
  skip: common.skip("EMAIL_VERIFY_RATE_LIMIT"),
  handler: (_req, res) => {
    res.status(429).json(
      jsonResponse(
        "RATE_LIMITED",
        "Too many verification attempts. Wait a few minutes and try again, or request a fresh link."
      )
    );
  },
});

export const resendVerificationLimiter = rateLimit({
  ...common,
  limit: () => budget("EMAIL_RESEND_RATE_LIMIT", config.emailVerification.resendRateLimit),
  skip: common.skip("EMAIL_RESEND_RATE_LIMIT"),
  handler: (_req, res) => {
    res.status(429).json(
      jsonResponse("RATE_LIMITED", "Too many requests for a new link. Please wait before trying again.")
    );
  },
});