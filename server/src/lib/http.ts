import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodError, ZodType } from "zod";

export type ErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export { STATUS_BY_CODE };

export interface ApiErrorBody {
  success: false;
  error: { code: ErrorCode; message: string };
}

export interface ApiSuccessBody<T> {
  success: true;
  data: T;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: unknown;

  constructor(message: string, statusCode: number, code: ErrorCode, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static of(code: ErrorCode, message: string, details?: unknown): AppError {
    return new AppError(message, STATUS_BY_CODE[code], code, details);
  }
}

/** Standard success envelope: `{ success: true, data }`. */
export function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data });
}

/** Standard error envelope: `{ success: false, error: { code, message } }`. */
export function fail(res: Response, status: number, code: ErrorCode, message: string): void {
  res.status(status).json({ success: false, error: { code, message } });
}

export function notFound(res: Response, message = "Resource not found"): void {
  fail(res, 404, "NOT_FOUND", message);
}

/** Wraps an async route handler so rejected promises reach the error handler. */
export function asyncHandler<T extends Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req as T, res, next)).catch(next);
  };
}

/** Validates `value` against `schema`, throwing a VALIDATION_ERROR AppError. */
export function parseOrThrow<S extends ZodType>(schema: S, value: unknown): S["_output"] {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    const first = issues[0];
    const message = first ? `${first.path ? first.path + ": " : ""}${first.message}` : "Invalid request";
    throw AppError.of("VALIDATION_ERROR", message, issues);
  }
  return result.data;
}

function zodMessage(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid request";
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

interface PrismaKnownError {
  code?: string;
  meta?: Record<string, unknown>;
}

function prismaKnownError(err: unknown): PrismaKnownError | null {
  if (typeof err !== "object" || err === null) return null;
  const maybe = err as { name?: unknown; code?: unknown; meta?: unknown };
  if (maybe.name !== "PrismaClientKnownRequestError") return null;
  return err as PrismaKnownError;
}

/**
 * MongoDB's duplicate-key failure.
 *
 * The Mongo engine inserts documents directly, so a unique-index violation
 * arrives as a driver error rather than Prisma's P2002. Without this mapping
 * the same double-click that returns 409 on PostgreSQL returns 500 on
 * MongoDB — a 500 for what is a conflict the caller can act on.
 */
function isDuplicateKeyError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const maybe = err as { name?: unknown; code?: unknown; message?: unknown };
  if (maybe.code === 11000) return true;
  return typeof maybe.message === "string" && maybe.message.includes("E11000");
}

/**
 * Maps any thrown value onto the API error envelope.
 * Express detects 4-arity functions as error handlers, so this must
 * always keep its four parameters.
 */
export function toErrorBody(err: unknown): ApiErrorBody {
  if (err instanceof AppError) {
    return { success: false, error: { code: err.code, message: err.message } };
  }

  if (err instanceof Error && "issues" in err && Array.isArray((err as ZodError).issues)) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: zodMessage(err as ZodError) } };
  }

  const prismaError = prismaKnownError(err);
  if (prismaError?.code === "P2002") {
    return { success: false, error: { code: "CONFLICT", message: "That value is already taken." } };
  }
  if (prismaError?.code === "P2025") {
    return { success: false, error: { code: "NOT_FOUND", message: "The requested resource does not exist." } };
  }

  if (isDuplicateKeyError(err)) {
    return { success: false, error: { code: "CONFLICT", message: "That value is already taken." } };
  }

  const anyErr = err as { type?: string; status?: number; statusCode?: number; message?: string } | null;

  // body-parser / raw-body errors
  if (anyErr?.type === "entity.parse.failed") {
    return { success: false, error: { code: "BAD_REQUEST", message: "Malformed JSON body." } };
  }
  if (anyErr?.type === "entity.too.large") {
    return { success: false, error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large." } };
  }
  if (anyErr?.type === "encoding.unsupported" || anyErr?.type === "charset.unsupported") {
    return { success: false, error: { code: "BAD_REQUEST", message: "Unsupported content encoding." } };
  }

  const status = anyErr?.status ?? anyErr?.statusCode;
  if (status === 404) return { success: false, error: { code: "NOT_FOUND", message: "Resource not found" } };
  if (status === 401) return { success: false, error: { code: "UNAUTHORIZED", message: "Invalid token" } };
  if (status === 403) return { success: false, error: { code: "FORBIDDEN", message: "Forbidden" } };
  if (status === 429) return { success: false, error: { code: "RATE_LIMITED", message: "Too many requests" } };

  return { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } };
}
