import {
  useCallback,
  useEffect,
  useMemo,
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
  const hoverEnabled = animation === "hover";

  // Swap the stored 2560px Cloudinary transform for the size actually drawn.
  // Non-Cloudinary sources are unaffected, so this is a no-op for videos and
  // GridFS files.
  const resolvedSrc = width ? withWidth(src, width) : src;

  /**
   * The URLs to try, in order: the size-optimised copy, the untouched original,
   * then the original again with a cache-busting query.
   *
   * A browser latches onto the first failure of a `src` and keeps painting the
   * broken result until the URL changes, so a single wrong candidate — an asset
   * stored before width transforms existed, a bad rewrite, a corrupted CDN
   * cache entry — must never be the last word while a perfectly good URL sits
   * behind it. The caller's `onError` (which hides the image, falls back to
   * initials, ...) only runs once every candidate has been tried.
   */
  const sources = useMemo(() => {
    const list = resolvedSrc === src ? [src] : [resolvedSrc, src];
    const last = list[list.length - 1];
    list.push(`${last}${last.includes("?") ? "&" : "?"}retry=1`);
    return list;
  }, [resolvedSrc, src]);

  const [attempt, setAttempt] = useState(0);

  // Restart the chain whenever the underlying source changes.
  useEffect(() => {
    setAttempt(0);
  }, [sources]);

  const currentSrc = sources[Math.min(attempt, sources.length - 1)];
  const advance = useCallback(() => {
    if (attempt < sources.length - 1) setAttempt(attempt + 1);
    else onError?.();
  }, [attempt, sources, onError]);

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
      <FrozenGif sources={sources} alt={alt} className={className} onError={onError} hoverRef={hoverRef} />
    );
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      draggable={false}
      loading="lazy"
      decoding="async"
      className={className}
      onError={advance}
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
      // `metadata` is enough for a frozen first frame, but media that is meant
      // to be playing (a profile avatar, a story) asks for its data up front so
      // the clip starts the moment the element mounts instead of after a second
      // round-trip for the body.
      preload={animate ? "auto" : "metadata"}
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
 *
 * The source chain is the same one the plain still uses, and the fallback
 * `<img>` — shown while the snapshot is still being taken and if it can never
 * be taken — is what advances it, so a GIF is just as incapable of ending up
 * permanently broken as any other picture.
 */
function FrozenGif({
  sources,
  alt,
  className,
  onError,
  hoverRef,
}: {
  sources: string[];
  alt: string;
  className: string;
  onError?: () => void;
  hoverRef: HoverRef;
}) {
  const [step, setStep] = useState(0);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const src = sources[Math.min(step, sources.length - 1)];

  const advance = useCallback(() => {
    if (step < sources.length - 1) setStep(step + 1);
    else onError?.();
  }, [step, sources, onError]);

  useEffect(() => {
    let cancelled = false;
    setSnapshot(null);
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
        // Tainted canvas (no CORS on this host): keep the live image below.
      }
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (snapshot) {
    return <img src={snapshot} alt={alt} draggable={false} className={className} ref={hoverRef} />;
  }
  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      loading="lazy"
      decoding="async"
      className={className}
      onError={advance}
      ref={hoverRef}
    />
  );
}
