/**
 * Media filename rules, shared by the API and the media service.
 *
 * Kept in its own module so the media service — which runs on a different
 * machine and must not need the API's database or JWT secrets — can import
 * it without dragging in `config.ts`.
 *
 * The uploader only ever produces `<uuid>.<ext>`, so anything else is a
 * request trying to escape the media directory and is rejected.
 */

const MEDIA_NAME_RE = /^[a-f0-9-]+\.[a-z0-9]+$/i;

/** Returns the filename if it is safe to use, otherwise null. */
export function safeUploadName(name: string): string | null {
  // Reject anything containing a separator before testing the pattern, so a
  // traversal attempt cannot be normalised into something that looks valid.
  if (name.includes("/") || name.includes("\\") || name.includes("\0")) return null;
  return MEDIA_NAME_RE.test(name) ? name : null;
}

/** Maps a stored extension onto the Content-Type served to browsers. */
export function contentTypeForName(name: string): string {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "mp4":
      return "video/mp4";
    case "webm":
      // The uploader writes .webm for video/webm and .weba for audio/webm.
      return "video/webm";
    case "mov":
      return "video/quicktime";
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "ogg":
      return "audio/ogg";
    case "weba":
      return "audio/webm";
    case "pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}