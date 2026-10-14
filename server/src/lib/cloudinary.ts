import type { v2 as CloudinaryV2 } from "cloudinary";
import { config } from "../config.js";

/**
 * Cloudinary access. Server-side only.
 *
 * `CLOUDINARY_API_SECRET` is a write credential: it can create and delete
 * assets in the media library. It is read here and never leaves the process —
 * not in an API response, not in a log line, not in the client bundle. The
 * client receives only a delivery URL and a public ID, neither of which can
 * be used to modify anything.
 *
 * The SDK is loaded on first use rather than at import time. It is a sizeable
 * CommonJS package, and a process that never uploads an image — a health
 * check, a read-only worker, most of the test suite — should not pay to load
 * it. `secure: true` keeps every delivery URL on https.
 */

/** The SDK's own type, imported as a type so nothing is loaded eagerly. */
type CloudinaryApi = typeof CloudinaryV2;

let sdkPromise: Promise<CloudinaryApi> | null = null;

/** Raised for every Cloudinary-side failure, so the route can map it to a status. */
export class CloudinaryError extends Error {
  /** Cloudinary's own error payload, when it sent one. */
  public readonly detail: unknown;

  constructor(message: string, detail?: unknown) {
    super(message);
    this.name = "CloudinaryError";
    this.detail = detail;
  }
}

/** True when all three credential variables are present. */
export function isCloudinaryConfigured(): boolean {
  return config.cloudinary.configured;
}

/**
 * The configured SDK, or a clear error naming the variables that are missing.
 *
 * Throwing rather than falling back is deliberate. A silent fallback to local
 * disk or GridFS would store bytes somewhere the rest of the app cannot reach
 * and report success for an upload that did not go where the operator
 * configured.
 */
export async function requireCloudinary(): Promise<CloudinaryApi> {
  if (!isCloudinaryConfigured()) {
    throw new CloudinaryError(
      `Image storage is not configured: missing ${config.cloudinary.missingVars.join(", ")}.`,
      { missing: [...config.cloudinary.missingVars] }
    );
  }

  if (!sdkPromise) {
    sdkPromise = import("cloudinary").then((mod) => {
      const cld = mod.v2;
      cld.config({
        cloud_name: config.cloudinary.cloudName,
        api_key: config.cloudinary.apiKey,
        api_secret: config.cloudinary.apiSecret,
        secure: true, // delivery URLs are always https
      });
      return cld;
    });
  }

  return sdkPromise;
}

/**
 * Only names the variables that are absent. Safe to log — it cannot contain a
 * credential value.
 */
export function describeCloudinaryConfig(): string {
  if (isCloudinaryConfigured()) return `cloud "${config.cloudinary.cloudName}"`;
  return `not configured (missing ${config.cloudinary.missingVars.join(", ")})`;
}

/** True when the Cloudinary SDK's own error shape is present. */
function isSdkError(err: unknown): err is { error?: { message?: string }; message?: string } {
  return typeof err === "object" && err !== null;
}

/**
 * Normalises an SDK rejection into a CloudinaryError.
 *
 * The SDK puts its transport/API failure on `err.error.message`, and the
 * top-level `err.message` is frequently the same text — so the detail is
 * trimmed and the secret is never part of it.
 */
function toCloudinaryError(what: string, err: unknown): CloudinaryError {
  if (err instanceof CloudinaryError) return err;

  const detail = isSdkError(err) ? err.error ?? err : undefined;
  const raw =
    (isSdkError(err) && typeof err.message === "string" && err.message) ||
    (typeof detail === "object" && detail !== null && typeof (detail as { message?: unknown }).message === "string"
      ? String((detail as { message: string }).message)
      : "");

  return new CloudinaryError(
    raw ? `Cloudinary ${what} failed: ${raw.slice(0, 200)}` : `Cloudinary ${what} failed.`,
    detail
  );
}

export interface UploadedImage {
  /** Canonical identifier, used for every later delete or transform. */
  publicId: string;
  /** Optimised https delivery URL, safe to put in an <img src>. */
  url: string;
  /** Byte size as Cloudinary stored it. */
  bytes: number;
  /** Format Cloudinary actually stored, which may differ from what was sent. */
  format: string;
  width: number | null;
  height: number | null;
}

/**
 * Delivery transformation, baked into the stored URL so a given asset is
 * transformed once and then served from Cloudinary's cache.
 *
 *   c_limit,w_1920  fit inside a 1920px box WITHOUT cropping or upscaling,
 *                   so aspect ratio and small images are preserved
 *   f_auto          best format for the requesting browser (skipped for GIF)
 *   q_auto          automatic quality
 *
 * `f_auto` is deliberately omitted for GIF: transcoding an animated GIF to a
 * still format would drop the animation. GIFs keep their format and get
 * `q_auto` only.
 */
function deliveryTransformation(format: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    // c_limit scales down only — it never enlarges and never crops.
    crop: "limit",
    width: 1920,
    quality: "auto",
  };
  if (format !== "gif") base.fetch_format = "auto";
  return base;
}

/**
 * Uploads a verified image file to Cloudinary.
 *
 * `publicId` is supplied by the caller and is always a server-generated UUID:
 * a user-supplied filename is never used as a storage path, so it cannot
 * traverse, collide with, or overwrite an existing asset. `overwrite: false`
 * means a re-sent file becomes a separate asset instead of replacing one that
 * another message may already be pointing at.
 *
 * Resolves only once Cloudinary has confirmed the upload — there is no path
 * here that returns a URL for bytes it has not accepted.
 */
export async function uploadImage(opts: {
  filePath: string;
  publicId: string;
  format: string;
}): Promise<UploadedImage> {
  const cld = await requireCloudinary();

  try {
    const result = await cld.uploader.upload(opts.filePath, {
      public_id: opts.publicId,
      folder: config.cloudinary.folder,
      resource_type: "image",
      overwrite: false,
      // The public ID is ours; never let Cloudinary append its own suffix.
      unique_filename: false,
      use_filename: false,
      // GIF stays GIF so the animation survives.
      format: opts.format === "gif" ? "gif" : undefined,
      transformation: [deliveryTransformation(opts.format)],
      timeout: config.cloudinary.timeoutMs,
    });

    // The SDK resolves with a result object, but a truncated/errored response
    // can arrive without the fields the rest of the app relies on. Treat that
    // as a failure rather than storing an empty URL.
    if (!result?.secure_url || !result?.public_id) {
      throw new CloudinaryError("Cloudinary upload returned no delivery URL.");
    }

    return {
      publicId: result.public_id,
      url: result.secure_url,
      bytes: result.bytes ?? 0,
      format: result.format ?? opts.format,
      width: result.width ?? null,
      height: result.height ?? null,
    };
  } catch (err) {
    throw toCloudinaryError("upload", err);
  }
}

/**
 * Removes an asset by public ID.
 *
 * `invalidate: true` also drops the cached derived images, otherwise a
 * deleted-and-reused public ID can keep serving the old file.
 */
export async function destroyImage(publicId: string): Promise<void> {
  const cld = await requireCloudinary();

  try {
    // destroy() does not take a timeout option; the SDK applies its own.
    const result = await cld.uploader.destroy(publicId, {
      resource_type: "image",
      invalidate: true,
    });
    // Cloudinary answers 200 with result="not found" for an absent asset.
    // Deleting something already gone is the desired end state, so this is
    // not an error.
    if (result?.result && result.result !== "ok" && result.result !== "not found") {
      throw new CloudinaryError(`Cloudinary refused the delete: ${String(result.result).slice(0, 200)}`, result);
    }
  } catch (err) {
    throw toCloudinaryError("delete", err);
  }
}

/** Exposed for tests: forget the memoised SDK so the next call re-imports it. */
export function resetCloudinaryForTests(): void {
  sdkPromise = null;
}

/**
 * Derives the public ID from a delivery URL this app produced.
 *
 * Replaced and deleted rows only ever store the URL — the schema has no
 * public-id column for avatars, post media or stories — so this is what makes
 * it possible to remove the asset a row used to point at instead of leaving it
 * in the media library forever.
 *
 * Strictly a server-side tool. It returns a value only for a URL that
 * matches this deployment's own delivery host and cloud name, and it is never
 * fed a public ID from a request body, so it cannot be steered at an asset in
 * someone else's account.
 *
 * Shape it accepts:
 *   https://res.cloudinary.com/<cloud>/image/upload/<transformation>/<public_id>.<ext>
 *
 * with the transformation and the optional `v<version>` segment absent.
 */
export function publicIdFromUrl(url: string | null | undefined): string | null {
  const cloudName = config.cloudinary.cloudName;
  if (!cloudName) return null; // unconfigured: nothing to compare against

  let parsed: URL;
  try {
    parsed = new URL((url ?? "").trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") return null;
  if (parsed.host !== new URL(config.cloudinary.deliveryHost).host) return null;

  const segments = parsed.pathname.split("/").filter(Boolean);
  // <cloud>/<resource_type>/upload/<rest...>
  if (segments.length < 4) return null;
  if (segments[0] !== cloudName) return null;
  if (segments[1] !== "image" || segments[2] !== "upload") return null;

  const rest = segments.slice(3);

  // Transformation segments look like `c_limit,w_1920,f_auto,q_auto`; the
  // version segment looks like `v1234567890`. Neither is part of the public ID.
  while (rest.length > 1 && /^[a-z]+_[^/]+$/i.test(rest[0]!)) rest.shift();
  if (rest.length > 1 && /^v\d+$/.test(rest[0]!)) rest.shift();

  const publicId = rest.join("/").replace(/\.[^./]+$/, "");
  // Mirrors the shape the DM route accepts for an attachment public ID.
  if (!publicId || publicId.length > 255) return null;
  if (!/^[A-Za-z0-9_\-/]+$/.test(publicId)) return null;

  return publicId;
}

/**
 * Removes the asset behind a stored delivery URL, best effort.
 *
 * For "this row used to point at X and now points at Y" situations. Never
 * throws: by the time this runs the database write has already succeeded, so
 * failing the request would report a successful save as an error. An asset
 * that cannot be removed is logged and left in the library.
 */
export async function destroyImageForUrl(url: string | null | undefined, context: string): Promise<void> {
  try {
    if (!isCloudinaryConfigured()) return;

    const publicId = publicIdFromUrl(url);
    if (!publicId) return; // not one of ours: a /uploads path, or an external link

    await destroyImage(publicId);
  } catch (err) {
    console.error(
      `[media] Could not remove the Cloudinary asset replaced by ${context}:`,
      err instanceof Error ? err.message : String(err)
    );
  }
}

export interface CloudinaryCheck {
  configured: boolean;
  reachable: boolean;
  /** Safe to log: names the cloud and the failure, never a credential. */
  detail: string;
}

/**
 * Asks Cloudinary whether it will accept these credentials.
 *
 * The failure this exists for: a wrong cloud name or secret does not surface
 * until the first user tries to upload a photo, which can be weeks after the
 * deployment. `GET /v1_1/<cloud>/ping` is the cheapest authenticated call
 * Cloudinary offers, so a single boot-time check turns "images silently never
 * worked" into a line in the log.
 */
export async function checkCloudinaryConnection(): Promise<CloudinaryCheck> {
  if (!isCloudinaryConfigured()) {
    return {
      configured: false,
      reachable: false,
      detail: `not configured (missing ${config.cloudinary.missingVars.join(", ")})`,
    };
  }

  try {
    const cld = await requireCloudinary();
    const result = (await cld.api.ping()) as { status?: string } | undefined;
    if (result?.status && result.status !== "ok") {
      return {
        configured: true,
        reachable: false,
        detail: `cloud "${config.cloudinary.cloudName}" answered "${String(result.status).slice(0, 80)}"`,
      };
    }
    return { configured: true, reachable: true, detail: `cloud "${config.cloudinary.cloudName}"` };
  } catch (err) {
    // err.message is Cloudinary's own text ("Invalid credentials", DNS
    // failure, ...). toCloudinaryError trims it and never includes the secret.
    const failure = toCloudinaryError("ping", err);
    return {
      configured: true,
      reachable: false,
      detail: `cloud "${config.cloudinary.cloudName}": ${failure.message.slice(0, 200)}`,
    };
  }
}
