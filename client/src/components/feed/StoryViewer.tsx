import { useCallback, useEffect, useRef, useState } from "react";
import Avatar from "@/components/Avatar";
import api from "@/lib/api";
import type { Story, StoryGroup } from "@/types";

interface Props {
  group: StoryGroup;
  startIndex?: number;
  /** Lets the viewer offer edit/delete on your own stories. */
  viewerId: string | null;
  onClose: () => void;
  onChanged: (story: Story | undefined) => void;
  onEdit: (story: Story) => void;
}

const DURATION_MS = 5000;
/** Stories longer than this are not advanced automatically. */
const MAX_AUTO_MS = 12_000;

function relativeTime(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

/**
 * Full-screen story viewer.
 *
 * One progress bar per story in the group, the active one filling over the
 * story's duration. Video advances on its own end event rather than the timer,
 * so a long clip is never cut off mid-playback.
 */
export default function StoryViewer({
  group,
  startIndex = 0,
  viewerId,
  onClose,
  onChanged,
  onEdit,
}: Props) {
  const stories = group.stories;
  const [index, setIndex] = useState(() => Math.min(startIndex, Math.max(0, stories.length - 1)));
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const startedAtRef = useRef<number>(0);
  const elapsedRef = useRef(0);

  const story = stories[index];
  const isOwn = Boolean(viewerId && group.author.id === viewerId);
  const isVideo = story?.mediaType === "video";
  const videoRef = useRef<HTMLVideoElement>(null);

  const duration = isVideo ? MAX_AUTO_MS : DURATION_MS;

  const goNext = useCallback(() => {
    setIndex((current) => {
      if (current + 1 < stories.length) {
        elapsedRef.current = 0;
        return current + 1;
      }
      onClose();
      return current;
    });
  }, [stories.length, onClose]);

  const goPrevious = useCallback(() => {
    setIndex((current) => {
      if (current > 0) {
        elapsedRef.current = 0;
        return current - 1;
      }
      return current;
    });
  }, []);

  useEffect(() => {
    setProgress(0);
    elapsedRef.current = 0;
    startedAtRef.current = performance.now();
  }, [index]);

  useEffect(() => {
    if (paused) return;
    let frame = 0;

    const tick = (now: number) => {
      const elapsed = elapsedRef.current + (now - startedAtRef.current);
      const ratio = Math.min(1, elapsed / duration);
      setProgress(ratio);
      if (ratio >= 1) {
        goNext();
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [index, duration, paused, goNext]);

  // Paused must not lose the time already served, or the bar jumps forward
  // on resume.
  useEffect(() => {
    if (!paused) {
      startedAtRef.current = performance.now();
      return;
    }
    return () => {
      elapsedRef.current += performance.now() - startedAtRef.current;
    };
  }, [paused]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") goNext();
      else if (event.key === "ArrowLeft") goPrevious();
      else if (event.key === " ") {
        event.preventDefault();
        setPaused((current) => !current);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [goNext, goPrevious, onClose]);

  const remove = async () => {
    if (!story) return;
    try {
      await api.delete(`/stories/${story.id}`);
      onChanged(undefined);
      // The group is refetched by the parent; closing avoids showing an index
      // that no longer exists.
      onClose();
    } catch {
      // The parent surfaces the failure.
    }
  };

  if (!story) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80 p-4 backdrop-blur-md animate-overlay-in"
      role="dialog"
      aria-modal="true"
      aria-label={`${group.author.username}'s story`}
      data-testid="story-viewer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md animate-pop-in">
        {/* Progress segments */}
        <div className="mb-2 flex gap-1 px-3">
          {stories.map((entry, entryIndex) => (
            <div key={entry.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white shadow-[0_0_8px_rgb(var(--accent-400-rgb)/0.65)] transition-[width] duration-75 ease-linear"
                style={{
                  width:
                    entryIndex < index ? "100%" : entryIndex > index ? "0%" : `${progress * 100}%`,
                }}
              />
            </div>
          ))}
        </div>

        <div className="glass-panel relative overflow-hidden rounded-2xl shadow-elev3">
          {/* Header */}
          <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-3">
            <Avatar user={group.author} className="h-8 w-8 text-sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold tracking-tight text-white">{group.author.username}</p>
              <p className="tabular text-xs text-white/60">{relativeTime(story.createdAt)}</p>
            </div>
            {isOwn && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onEdit(story)}
                  aria-label="Edit story"
                  title="Edit story"
                  className="rounded-lg p-2 text-white/85 transition-all duration-200 ease-out hover:bg-white/15 hover:text-white"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M4 20h4l10.5-10.5a2.12 2.12 0 00-3-3L5 17v3zm14.7-11.7a1 1 0 000-1.4l-2.6-2.6a1 1 0 00-1.4 0l-1.8 1.8 3 3 1.8-1.8z" />
                  </svg>
                </button>
                <button
                  onClick={remove}
                  aria-label="Delete story"
                  title="Delete story"
                  className="rounded-lg p-2 text-white/85 transition-all duration-200 ease-out hover:bg-red-500/40 hover:text-white"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 7h12l-1 13a1 1 0 01-1 1H8a1 1 0 01-1-1L6 7zm3-3h6l1 2h4v2H4V6h4l1-2z" />
                  </svg>
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              aria-label="Close story"
              className="rounded-lg p-2 text-white/85 transition-all duration-200 ease-out hover:bg-white/15 hover:text-white"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Media */}
          <div className="flex aspect-[9/16] max-h-[80vh] w-full items-center justify-center bg-black">
            {isVideo ? (
              <video
                ref={videoRef}
                key={story.id}
                src={story.mediaUrl}
                autoPlay
                muted
                playsInline
                onEnded={goNext}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <img src={story.mediaUrl} alt="" className="max-h-full max-w-full object-contain" />
            )}
          </div>

          {/* Tap zones */}
          <button
            onClick={goPrevious}
            aria-label="Previous story"
            className="absolute inset-y-0 left-0 w-1/3 cursor-pointer"
          />
          <button
            onClick={paused ? undefined : goNext}
            aria-label="Next story"
            className="absolute inset-y-0 right-0 w-1/3 cursor-pointer"
          />

          {/* Hold to pause */}
          <button
            onPointerDown={() => setPaused(true)}
            onPointerUp={() => setPaused(false)}
            onPointerLeave={() => setPaused(false)}
            aria-label={paused ? "Resume" : "Pause"}
            className="glass absolute bottom-3 right-3 rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-semibold text-white shadow-elev2 transition-all duration-200 ease-out hover:bg-white/20"
          >
            {paused ? "▶" : "❚❚"}
          </button>
        </div>
      </div>
    </div>
  );
}
