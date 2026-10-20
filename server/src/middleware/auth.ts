import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { AppError } from "../lib/http.js";

export interface AuthRequest extends Request {
  userId?: string;
}

/**
 * The only JWT algorithm this API signs with.
 *
 * Pinned on both sign and verify. `jsonwebtoken` already refuses an RSA public
 * key being used as an HMAC secret, but an explicit allowlist is the actual
 * guarantee: without it, anything that reaches `verify` is offered to every
 * algorithm the library supports, and "we only ever sign HS256" is a property
 * of the signing code rather than of the verifier.
 */
export const JWT_ALGORITHM = "HS256" as const;

/** Claims both the access and the refresh token carry. */
export interface TokenClaims {
  userId?: unknown;
  /** Session version at issue time — see `bumpSessionVersion`. */
  sv?: unknown;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    return;
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret, {
      algorithms: [JWT_ALGORITHM],
    }) as TokenClaims;
    if (typeof decoded.userId !== "string" || !decoded.userId) {
      res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid token" } });
      return;
    }
    req.userId = decoded.userId;
    next();
  } catch {
    // Deliberately one message for "expired", "bad signature", "wrong
    // algorithm" and "malformed". Distinguishing them tells an attacker which
    // half of a forged token was wrong.
    res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid or expired token" } });
  }
}

/** Narrowing helper: `authenticate` guarantees `userId` is set. */
export function requireUser(req: AuthRequest): string {
  if (!req.userId) throw AppError.of("UNAUTHORIZED", "Authentication required");
  return req.userId;
}