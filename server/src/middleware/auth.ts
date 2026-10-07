import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { AppError } from "../lib/http.js";

export interface AuthRequest extends Request {
  userId?: string;
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
    const decoded = jwt.verify(token, config.jwtSecret) as { userId?: unknown };
    if (typeof decoded.userId !== "string" || !decoded.userId) {
      res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid token" } });
      return;
    }
    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid or expired token" } });
  }
}

/** Narrowing helper: `authenticate` guarantees `userId` is set. */
export function requireUser(req: AuthRequest): string {
  if (!req.userId) throw AppError.of("UNAUTHORIZED", "Authentication required");
  return req.userId;
}
