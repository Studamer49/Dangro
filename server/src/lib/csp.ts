import helmet from "helmet";

/** Whatever shape helmet's directive map uses for this version. */
type HelmetDirectives = ReturnType<typeof helmet.contentSecurityPolicy.getDefaultDirectives>;

/**
 * The scheme+host of the media host, or null when unset or unparseable.
 *
 * CSP source expressions are matched against scheme, host and port, so the
 * path in `MEDIA_PUBLIC_URL` must be stripped — `https://host/media` would
 * never match anything the browser requests.
 */
export function mediaOrigin(mediaPublicUrl: string): string | null {
  const trimmed = mediaPublicUrl.trim();
  if (!trimmed) return null;

  try {
    const { origin } = new URL(trimmed);
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}

/**
 * Content-Security-Policy for the SPA shell.
 *
 * helmet's defaults are `img-src 'self' data:` and no `media-src` at all,
 * so `<video>` and `<audio>` fall back to `default-src 'self'`. Both are
 * correct while media is served from this origin, and both are wrong the
 * moment media comes from somewhere else: the remote media host answers
 * `/uploads/:name` with a 302 to its own hostname, so every avatar, post
 * image and video is loaded cross-origin and the browser refuses it with a
 * CSP violation while the API reports 200.
 *
 * `blob:` is added alongside because optimistic upload previews and
 * in-progress voice notes render from object URLs rather than a stored path.
 */
export function buildCspDirectives(mediaPublicUrl: string): HelmetDirectives {
  const directives = helmet.contentSecurityPolicy.getDefaultDirectives();

  const asStrings = (values: Iterable<unknown> | undefined): string[] =>
    [...(values ?? ["'self'"])].map(String);

  const allowBlob = (values: Iterable<unknown> | undefined): string[] => {
    const list = asStrings(values);
    return list.includes("blob:") ? list : [...list, "blob:"];
  };

  const imgSrc = allowBlob(directives["img-src"]);
  // Absent from helmet's defaults, so this is a new directive rather than an
  // addition — it has to be listed for <video> and <audio> to load at all.
  const mediaSrc = allowBlob(directives["media-src"]);

  const origin = mediaOrigin(mediaPublicUrl);
  directives["img-src"] = origin ? [...imgSrc, origin] : imgSrc;
  directives["media-src"] = origin ? [...mediaSrc, origin] : mediaSrc;

  return directives;
}
