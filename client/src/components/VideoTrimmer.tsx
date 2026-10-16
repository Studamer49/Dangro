import { useEffect, useRef, useState } from "react";
import Modal from "@/components/Modal";
import {
  canTrimVideo,
  loadVideoMetadata,
  MAX_TRIM_SECONDS,
  MIN_TRIM_MS,
  trimVideoFile,
} from "@/lib/videoTrim";

interface VideoTrimmerProps {
  file: File;
  /** What is being trimmed, for the dialog title ("Avatar" / "Banner"). */
  label: string;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}

const MIN_TRIM_SECONDS = MIN_TRIM_MS / 1000;
// A clip that is already short enough and keeps its whole length is uploaded
// untouched — re-encoding it would only lose quality for no gain.
const WHOLE_TOLERANCE = 0.05;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * A five-second window picker for video avatars and banners.
 *
 * Opens for any video the user picks. Short clips can be confirmed as-is; a
 * longer one must be cut down, and if the browser cannot re-encode, an
 * over-long clip is refused rather than silently accepted — the cap is the
 * point of the dialog.
 */
export default function VideoTrimmer({ file, label, onCancel, onConfirm }: VideoTrimmerProps) {
  const [previewUrl] = useState(() => URL.createObjectURL(file));
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [trimError, setTrimError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadVideoMetadata(previewUrl)
      .then((meta) => {
        if (cancelled) return;
        if (!Number.isFinite(meta.duration) || meta.duration <= 0) {
          setLoadError("Couldn't read this video's length. Try a different file.");
          return;
        }
        setDuration(meta.duration);
        setStart(0);
        setEnd(Math.min(meta.duration, MAX_TRIM_SECONDS));
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Couldn't open this video. Try a different file.");
      });
    return () => {
      cancelled = true;
    };
  }, [previewUrl]);

  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);

  // Keep the preview looping inside the selected window.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !ready) return;
    el.currentTime = start;
    el.play().catch(() => undefined);
  }, [start, ready]);

  const handleTimeUpdate = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.currentTime >= end) el.currentTime = start;
  };

  const onStartChange = (value: number) => {
    const s = clamp(value, 0, duration);
    let e = end;
    if (e - s > MAX_TRIM_SECONDS) e = s + MAX_TRIM_SECONDS;
    if (e - s < MIN_TRIM_SECONDS) e = s + MIN_TRIM_SECONDS;
    setStart(s);
    setEnd(clamp(e, 0, duration));
  };

  const onEndChange = (value: number) => {
    const e = clamp(value, 0, duration);
    let s = start;
    if (e - s > MAX_TRIM_SECONDS) s = e - MAX_TRIM_SECONDS;
    if (e - s < MIN_TRIM_SECONDS) s = e - MIN_TRIM_SECONDS;
    setStart(clamp(s, 0, duration));
    setEnd(e);
  };

  const spanSeconds = Math.max(0, end - start);
  const coversWhole = start <= WHOLE_TOLERANCE && end >= duration - WHOLE_TOLERANCE;
  const canUploadOriginal = ready && coversWhole && duration <= MAX_TRIM_SECONDS + WHOLE_TOLERANCE;
  const trimSupported = canTrimVideo();
  // A long clip with no way to cut it can't be accepted.
  const unsupported = ready && !canUploadOriginal && !trimSupported;

  const handleConfirm = async () => {
    if (!ready || unsupported || processing) return;
    setTrimError(null);
    if (canUploadOriginal) {
      onConfirm(file);
      return;
    }
    setProcessing(true);
    try {
      const trimmed = await trimVideoFile(file, start * 1000, end * 1000);
      onConfirm(trimmed);
    } catch (err) {
      setTrimError(err instanceof Error ? err.message : "Could not trim this video.");
      setProcessing(false);
    }
  };

  const format = (seconds: number) => `${seconds.toFixed(1)}s`;

  return (
    <Modal
      title={`Trim ${label.toLowerCase()}`}
      subtitle={`Pick up to ${MAX_TRIM_SECONDS} seconds.`}
      onClose={onCancel}
      maxWidth="max-w-lg"
      overlayClassName="layer-call"
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={processing}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleConfirm}
            disabled={!ready || unsupported || processing}
          >
            {processing ? "Trimming…" : canUploadOriginal ? "Use clip" : "Trim & use"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="relative overflow-hidden rounded-xl border border-gray-800/70 bg-black">
          <video
            ref={videoRef}
            src={previewUrl}
            muted
            playsInline
            loop
            onTimeUpdate={handleTimeUpdate}
            className="mx-auto max-h-64 w-full object-contain"
          />
        </div>

        {loadError && <p className="text-sm text-red-400">{loadError}</p>}

        {ready && (
          <>
            <div className="space-y-3">
              <label className="block">
                <span className="field-label">Start — {format(start)}</span>
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={0.1}
                  value={start}
                  onChange={(event) => onStartChange(Number(event.target.value))}
                  className="w-full accent-accent-500"
                />
              </label>
              <label className="block">
                <span className="field-label">End — {format(end)}</span>
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={0.1}
                  value={end}
                  onChange={(event) => onEndChange(Number(event.target.value))}
                  className="w-full accent-accent-500"
                />
              </label>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">
                Selected: <span className="tabular text-white">{format(spanSeconds)}</span>
              </span>
              <span className={spanSeconds > MAX_TRIM_SECONDS ? "text-red-400" : "text-gray-500"}>
                Max {MAX_TRIM_SECONDS}s
              </span>
            </div>
          </>
        )}

        {unsupported && (
          <p className="text-sm text-amber-400">
            Your browser can't trim video, and this clip is longer than {MAX_TRIM_SECONDS} seconds.
            Please choose a clip that is {MAX_TRIM_SECONDS} seconds or shorter.
          </p>
        )}
        {trimError && <p className="text-sm text-red-400">{trimError}</p>}
      </div>
    </Modal>
  );
}
