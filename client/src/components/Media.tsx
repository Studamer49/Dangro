import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { isGifUrl, isVideoUrl, withWidth } from "@/lib/media";
import { useSettingsStore } from "@/stores/settingsStore";

/**
 * How a piece of animated media is allowed to start playing.
 *
 * `hover` (the default) keeps a page full of avatars quiet until the pointer
 * is actually over the thing they belong to — a feed or member list no longer
 * runs a dozen decoders at once. `always` is for the places where the
 * animation *is* the content: the profile someone opened, and a story. `never`
 * freezes it.
 */
export type MediaAnimation = "hover" | "always" | "never";

/**
 * What counts as "the thing the avatar belongs to" for hover purposes.
 *
 * The pointer does not have to land exactly on a 40px avatar: entering the
 * message row, list item, card or button that contains it is enough. The
 * first matching ancestor wins, so the closest surrounding surface is the one
 * that lights it up; a lone avatar with no such ancestor falls back to itself.
 *
 * `[data-media-hover]` is checked first (see `setHoverRef`): a component can
 * mark the exact container that should light the media up — for instance a
 * whole chat message row — even when a closer ancestor (the avatar's own
 * profile <a>) would otherwise win.
 */
const HOVER_TARGET_SELECTOR = 'a, button, [role="button"], li, .group';

/** A ref callback shared with the rendered media element. */
type HoverRef = ((el: HTMLElement | null) => void) | undefined;

interface MediaProps {
  src: string;
  alt?: string;
  className?: string;
  animation?: MediaAnimation;
  loop?: boolean;
  fallback?: ReactNode;
  onError?: () => void;
  /**
   * Render at this CSS pixel width. Only used to request a right-sized copy
   * from Cloudinary; it does not set any layout style (callers keep sizing the
   * element through `className`).
   */
  width?: number;
}

/**
 * Renders an avatar/banner from whatever the user uploaded: a still image, an
 * animated GIF, or a short video.
 *
 * Videos and GIFs animate only in the contexts that ask for it (see
 * `MediaAnimation`) and only while the viewer's "animate avatars" setting is
 * on. `always` callers — the profile page and stories — animate outright;
 * everything else waits for the pointer to enter the surrounding row/card, not
 * just the media itself. The setting is the master switch: turning it off
 * freezes even those.
 */
export default function Media({
  src,
  alt = "",
  className = "",
  animation = "hover",
  loop = true,
  fallback = null,
  onError,
  width,
}: MediaProps) {
  const settingAnimate = useSettingsStore((s) => s.animateAvatars);
  const [hovered, setHovered] = useState(false);
  // A still image that fails once has almost always hit a transient network or
  // CDN blip, not a missing file; the browser then keeps showing the broken
  // result until the src changes. One retry with a cache-busting query param
  // is enough to recover and is what stops a banner "just disappearing".
  const [retry, setRetry] = useState(0);

  const hoverEnabled = animation === "hover";

  // Swap the stored 2560px Cloudinary transform for the size actually drawn.
  // Non-Cloudinary sources are unaffected, so this is a no-op for videos and
  // GridFS files.
  const resolvedSrc = width ? withWidth(src, width) : src;

  /**
   * Points the hover listeners at the nearest containing surface rather than
   * at the media element. A callback ref is used (not an effect) so the
   * listeners are re-bound whenever the rendered element changes — the GIF
   * snapshots swap their underlying node, and an effect keyed on `[enabled]`
   * alone would leave the leave-listener on a node that no longer exists.
   *
   * An explicit `[data-media-hover]` container wins over the generic patterns,
   * so a whole message row can light the avatar up even though the avatar sits
   * inside its own profile <a>.
   */
  const cleanupRef = useRef<(() => void) | null>(null);
  const setHoverRef = useCallback<NonNullable<HoverRef>>(
    (el) => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      if (!el || !hoverEnabled) return;

      const target =
        (el.closest("[data-media-hover]") as HTMLElement | null) ??
        (el.closest(HOVER_TARGET_SELECTOR) as HTMLElement | null) ??
        el;
      const enter = () => setHovered(true);
      const leave = () => setHovered(false);
      target.addEventListener("pointerenter", enter);
      target.addEventListener("pointerleave", leave);
      cleanupRef.current = () => {
        target.removeEventListener("pointerenter", enter);
        target.removeEventListener("pointerleave", leave);
      };
    },
    [hoverEnabled]
  );
  useEffect(() => () => cleanupRef.current?.(), []);

  const hoverRef: HoverRef = hoverEnabled ? setHoverRef : undefined;

  const animate = settingAnimate && (animation === "always" || (hoverEnabled && hovered));

  // Reset the retry counter whenever the underlying source changes.
  useEffect(() => {
    setRetry(0);
  }, [resolvedSrc]);

  if (isVideoUrl(src)) {
    return (
      <VideoMedia
        src={src}
        className={className}
        animate={animate}
        loop={loop}
        fallback={fallback}
        onError={onError}
        hoverRef={hoverRef}
      />
    );
  }

  // A GIF animates only once it is allowed to; otherwise the first frame is
  // drawn to a canvas and shown as a still, so the layout does not jump.
  if (isGifUrl(src) && !animate) {
    return (
      <FrozenGif src={resolvedSrc} alt={alt} className={className} onError={onError} hoverRef={hoverRef} />
    );
  }

  // Append a one-shot cache-buster on retry so the browser does not just
  // replay its cached failure.
  const retrySrc =
    retry > 0
      ? `${resolvedSrc}${resolvedSrc.includes("?") ? "&" : "?"}retry=${retry}`
      : resolvedSrc;

  return (
    <img
      src={retrySrc}
      alt={alt}
      draggable={false}
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => {
        if (retry < 1) setRetry(retry + 1);
        else onError?.();
      }}
      ref={hoverRef}
    />
  );
}

function VideoMedia({
  src,
  className,
  animate,
  loop,
  fallback,
  onError,
  hoverRef,
}: {
  src: string;
  className: string;
  animate: boolean;
  loop: boolean;
  fallback: ReactNode;
  onError?: () => void;
  hoverRef: HoverRef;
}) {
  const playRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  // The video needs its own ref for play/pause; the hover listeners live on the
  // surrounding container, so the two are merged into one callback ref.
  const setRef = useCallback(
    (el: HTMLVideoElement | null) => {
      playRef.current = el;
      hoverRef?.(el);
    },
    [hoverRef]
  );

  // Play/pause as the animation state flips, instead of remounting the element.
  useEffect(() => {
    const el = playRef.current;
    if (!el) return;
    if (animate) el.play().catch(() => undefined);
    else el.pause();
  }, [animate, src]);

  // A paused video paints its first frame only once metadata is in; nudge the
  // playhead off zero so it does not show a black rectangle.
  useEffect(() => {
    const el = playRef.current;
    if (!el || animate) return;
    const seek = () => {
      try {
        el.currentTime = 0.001;
      } catch {
        /* not seekable yet */
      }
    };
    if (el.readyState >= 1) seek();
    else el.addEventListener("loadedmetadata", seek, { once: true });
    return () => el.removeEventListener("loadedmetadata", seek);
  }, [animate, src]);

  if (failed) return <>{fallback}</>;

  return (
    <video
      ref={setRef}
      src={src}
      autoPlay={animate}
      loop={animate && loop}
      muted
      playsInline
      preload="metadata"
      className={className}
      onError={() => {
        setFailed(true);
        onError?.();
      }}
    />
  );
}

/**
 * A GIF rendered as a still. The browser hands us the current frame when it is
 * drawn to a canvas, which is the first one right after load. Cross-origin
 * images without CORS headers taint the canvas and throw; in that case we fall
 * back to the animated GIF rather than showing nothing.
 */
function FrozenGif({
  src,
  alt,
  className,
  onError,
  hoverRef,
}: {
  src: string;
  alt: string;
  className: string;
  onError?: () => void;
  hoverRef: HoverRef;
}) {
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || 1;
        canvas.height = img.naturalHeight || 1;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        ctx.drawImage(img, 0, 0);
        setSnapshot(canvas.toDataURL("image/png"));
      } catch {
        setFailed(true);
      }
    };
    img.onerror = () => {
      if (!cancelled) {
        setFailed(true);
        onError?.();
      }
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src, onError]);

  if (failed || !snapshot) {
    return (
      <img
        src={src}
        alt={alt}
        draggable={false}
        loading="lazy"
        decoding="async"
        className={className}
        onError={onError}
        ref={hoverRef}
      />
    );
  }
  return <img src={snapshot} alt={alt} draggable={false} className={className} ref={hoverRef} />;
}
