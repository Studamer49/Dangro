/**
 * Small helpers for telling apart the kinds of media the app stores in the
 * same URL columns (avatars, covers, server icons/banners, attachments).
 *
 * We only ever have a URL string, so the file extension is the signal. The
 * uploader always writes an extension (`/uploads/<uuid>.mp4`, and Cloudinary
 * delivery URLs end in the asset extension), and query strings are ignored.
 */

function pathOf(url: string): string {
  return url.split(/[?#]/, 1)[0].toLowerCase();
}

const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|m4v|ogv|ogg|avi|mkv)$/;

export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return VIDEO_EXTENSIONS.test(pathOf(url));
}

export function isGifUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.gif$/.test(pathOf(url));
}

/** Whether a URL is something that animates on its own (GIF or video). */
export function isAnimatedUrl(url: string | null | undefined): boolean {
  return isGifUrl(url) || isVideoUrl(url);
}

/** The delivery path segment that separates a Cloudinary asset from its transform. */
const CLOUDINARY_UPLOAD = "/upload/";

/**
 * Ask Cloudinary for a smaller copy of an image.
 *
 * Uploads are stored one time at a generous size so banners and covers stay
 * sharp, but that same URL is also used for a 40px avatar — downloading the
 * full-size asset for every avatar is the single biggest cause of a laggy
 * list. The delivery URL normally already carries a `w_2560` transform, so the
 * cheapest fix is to swap that number for the size actually being rendered.
 * Non-Cloudinary URLs (GridFS `/uploads/...`, remote hosts) are returned as-is.
 *
 * Only the transformation component (the one segment between `/upload/` and
 * the asset path) is touched, so a folder or public id that happens to contain
 * `w_123` is left alone. When the stored URL has no width yet — an asset
 * uploaded before the transform existed — one is chained in front instead of
 * being appended to an existing list: `/upload/w_160,/…` (a trailing comma) is
 * a malformed transformation and Cloudinary answers 404, which is exactly how a
 * resized avatar used to turn into a broken image.
 */
export function withWidth(url: string, width: number): string {
  if (!width || !url.includes("res.cloudinary.com")) return url;

  const at = url.indexOf(CLOUDINARY_UPLOAD);
  if (at === -1) return url;

  const start = at + CLOUDINARY_UPLOAD.length;
  const nextSlash = url.indexOf("/", start);
  const end = nextSlash === -1 ? url.length : nextSlash;
  const segment = url.slice(start, end);

  if (/\bw_\d+\b/.test(segment)) {
    return url.slice(0, start) + segment.replace(/\bw_\d+\b/, `w_${width}`) + url.slice(end);
  }

  return url.slice(0, start) + `w_${width}/` + url.slice(start);
}
