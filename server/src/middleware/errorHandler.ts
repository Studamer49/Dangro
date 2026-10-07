import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { AppError, toErrorBody, STATUS_BY_CODE } from "../lib/http.js";

export { AppError } from "../lib/http.js";

/**
 * Terminal error handler. Registered LAST, after every route, the API 404
 * handler and the static/SPA handlers — never before them.
 */
export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  const body = toErrorBody(err);
  const status =
    err instanceof AppError ? err.statusCode : (STATUS_BY_CODE[body.error.code] ?? 500);

  if (body.error.code === "INTERNAL_ERROR") {
    console.error("[error] Unhandled error:", err);
  } else if (config.isTest) {
    // keep test output readable
  } else {
    console.error(`[error] ${body.error.code}: ${body.error.message}`);
  }

  res.status(status).json(body);
}
