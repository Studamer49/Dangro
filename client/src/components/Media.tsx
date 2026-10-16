import { useEffect, useRef, useState, type PointerEventHandler, type ReactNode } from "react";
import { isGifUrl, isVideoUrl } from "@/lib/media";
import { useSettingsStore } from "@/stores/settingsStore";

/**
 * How a piece of animated media is allowed to start playing.
 *
 * `hover` (the default) keeps a page full of avatars quiet until the pointer
 * is actually over one — a feed or member list no longer runs a dozen decoders
 * at once. `always` is for the places where the animation *is* the content:
 * the profile someone opened, and a story. `never` freezes it.
 */
export type MediaAnimation = "hover" | "always" | "never";

interface MediaProps {
  src: string;
  alt?: string;
  className?: string;
  animation?: MediaAnimation;
  loop?: boolean;
  fallback?: ReactNode;
  onError?: () => void;
}

/**
 * Renders an avatar/banner from whatever the user uploaded: a still image, an
 * animated GIF, or a short video.
 *
 * Videos and GIFs animate only in the contexts that ask for it (see
 * `MediaAnimation`) and only while the viewer's "animate avatars" setting is
 * on. `always` callers — the profile page and stories — animate outright;
 * everything else waits for a hover. The setting is the master switch: turning
 * it off freezes even those.
 */
export default function Media({
  src,
  alt = "",
  className = "",
  animation = "hover",
  loop = true,
  fallback = null,
  onError,
}: MediaProps) {
  const settingAnimate = useSettingsStore((s) => s.animateAvatars);
  const [hovered, setHovered] = useState(false);

  const hoverEnabled = animation === "hover";
  const animate = settingAnimate && (animation === "always" || (hoverEnabled && hovered));

  const hoverHandlers: {
    onPointerEnter?: PointerEventHandler;
    onPointerLeave?: PointerEventHandler;
  } = hoverEnabled
    ? {
        onPointerEnter: () => setHovered(true),
        onPointerLeave: () => setHovered(false),
      }
    : {};

  if (isVideoUrl(src)) {
    return (
      <VideoMedia
        src={src}
        className={className}
        animate={animate}
        loop={loop}
        fallback={fallback}
        onError={onError}
        hoverHandlers={hoverHandlers}
      />
    );
  }

  // A GIF animates only once it is allowed to; otherwise the first frame is
  // drawn to a canvas and shown as a still, so the layout does not jump.
  if (isGifUrl(src) && !animate) {
    return (
      <FrozenGif
        src={src}
        alt={alt}
        className={className}
        onError={onError}
        hoverHandlers={hoverHandlers}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      className={className}
      onError={onError}
      {...hoverHandlers}
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
  hoverHandlers,
}: {
  src: string;
  className: string;
  animate: boolean;
  loop: boolean;
  fallback: ReactNode;
  onError?: () => void;
  hoverHandlers: {
    onPointerEnter?: PointerEventHandler;
    onPointerLeave?: PointerEventHandler;
  };
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  // Play/pause as the animation state flips, instead of remounting the element.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (animate) el.play().catch(() => undefined);
    else el.pause();
  }, [animate, src]);

  // A paused video paints its first frame only once metadata is in; nudge the
  // playhead off zero so it does not show a black rectangle.
  useEffect(() => {
    const el = ref.current;
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
      ref={ref}
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
      {...hoverHandlers}
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
  hoverHandlers,
}: {
  src: string;
  alt: string;
  className: string;
  onError?: () => void;
  hoverHandlers: {
    onPointerEnter?: PointerEventHandler;
    onPointerLeave?: PointerEventHandler;
  };
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
        className={className}
        onError={onError}
        {...hoverHandlers}
      />
    );
  }
  return <img src={snapshot} alt={alt} draggable={false} className={className} {...hoverHandlers} />;
}
