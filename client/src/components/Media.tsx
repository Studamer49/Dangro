import { useEffect, useRef, useState, type ReactNode } from "react";
import { isGifUrl, isVideoUrl } from "@/lib/media";
import { useSettingsStore } from "@/stores/settingsStore";

interface MediaProps {
  src: string;
  alt?: string;
  className?: string;
  /**
   * Whether this media is allowed to animate. Defaults to the viewer's
   * "animate avatars" setting, which is what lets one switch freeze every GIF
   * and video avatar at once.
   */
  animated?: boolean;
  loop?: boolean;
  fallback?: ReactNode;
  onError?: () => void;
}

/**
 * Renders an avatar/banner from whatever the user uploaded: a still image, an
 * animated GIF, or a short video. Videos and (optionally) GIFs are frozen when
 * animations are turned off in settings.
 */
export default function Media({
  src,
  alt = "",
  className = "",
  animated,
  loop = true,
  fallback = null,
  onError,
}: MediaProps) {
  const settingAnimate = useSettingsStore((s) => s.animateAvatars);
  const animate = animated ?? settingAnimate;

  if (isVideoUrl(src)) {
    return (
      <VideoMedia
        src={src}
        className={className}
        animate={animate}
        loop={loop}
        fallback={fallback}
        onError={onError}
      />
    );
  }
  if (isGifUrl(src) && !animate) {
    return <FrozenGif src={src} alt={alt} className={className} onError={onError} />;
  }
  return <img src={src} alt={alt} draggable={false} className={className} onError={onError} />;
}

function VideoMedia({
  src,
  className,
  animate,
  loop,
  fallback,
  onError,
}: {
  src: string;
  className: string;
  animate: boolean;
  loop: boolean;
  fallback: ReactNode;
  onError?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  // Play/pause as the setting flips, instead of remounting the element.
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
}: {
  src: string;
  alt: string;
  className: string;
  onError?: () => void;
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
    return <img src={src} alt={alt} draggable={false} className={className} onError={onError} />;
  }
  return <img src={snapshot} alt={alt} draggable={false} className={className} />;
}
