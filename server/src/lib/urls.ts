import { z } from "zod";

/**
 * Validation for user-supplied URLs (avatars, post/story media, DM
 * attachments, server icons).
 *
 * These fields are stored verbatim and rendered by the client as `src` /
 * `href`, so any scheme the client will happily navigate or embed has to be
 * rejected at the boundary. `z.string().url()` is not enough: it only proves
 * the string parses as a URL, and `new URL("javascript:alert(1)")` parses
 * fine. Every media-bearing field was length-checked only, so a user could
 * store `javascript:` in their avatar and have it served to everyone who saw
 * their profile.
 *
 * Two shapes are accepted, which is what the app actually produces:
 *   - a root-relative path, e.g. `/uploads/<uuid>.png` (the uploader output)
 *   - an absolute http(s) URL (the remote media host, or an external link)
 */

/**
 * C0 and C1 control characters, used to smuggle a scheme past a naive check
 * (`java&#9;script:`). Built from char codes so the literal bytes never
 * appear in this source file.
 */
const CONTROL_CHARS = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}-${String.fromCharCode(159)}]`
);

/** The only schemes a media URL may use. */
const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

export function isSafeMediaUrl(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  if (CONTROL_CHARS.test(trimmed)) return false;

  // Protocol-relative `//evil.example` inherits the page scheme and is never
  // something a user means to type here.
  if (trimmed.startsWith("//")) return false;

  // A root-relative path is the uploader output and cannot carry a scheme, so
  // it is safe by construction.
  if (trimmed.startsWith("/")) return true;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }

  return SAFE_PROTOCOLS.has(parsed.protocol);
}

/**
 * A media URL as stored by the app: a `/uploads/...` path or an http(s) URL.
 * `nullish` keeps it usable for the fields that clear a value by sending null.
 */
export function mediaUrl(max = 500) {
  return z
    .string()
    .trim()
    .max(max)
    .refine(isSafeMediaUrl, { message: "Must be an /uploads path or an http(s) URL" });
}

export const nullableMediaUrl = (max = 500) => mediaUrl(max).nullish();