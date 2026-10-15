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
