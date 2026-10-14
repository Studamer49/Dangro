import { useState, useRef, useCallback, useEffect } from "react";

interface Props {
  onRecordingComplete: (blob: Blob) => void;
  disabled?: boolean;
}

/**
 * The shape of the level meter, and the delay at which each bar starts its
 * shimmer. The staggered offsets make the shimmer travel outward from the
 * centre instead of pulsing the whole row in lockstep.
 */
const METER_BARS = [
  { height: "h-2", delay: "0ms" },
  { height: "h-3.5", delay: "150ms" },
  { height: "h-5", delay: "300ms" },
  { height: "h-3.5", delay: "150ms" },
  { height: "h-2", delay: "0ms" },
] as const;

export default function VoiceRecorder({ onRecordingComplete, disabled }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  /** False once the component has unmounted, checked after every await. */
  const aliveRef = useRef(true);

  // Navigating away mid-recording used to leave the microphone open and the
  // duration timer running: the browser's recording indicator stayed on and
  // setInterval kept firing against a component that no longer exists.
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        // Drop the handler first so cancelling does not upload a note the
        // user never finished recording.
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.stream.getTracks().forEach((track) => track.stop());
        recorder.stop();
      }
      mediaRecorderRef.current = null;
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // The permission prompt can outlive the component: unmounting while it is
      // open leaves this ref null, so the cleanup above had no recorder to stop.
      // Drop the freshly-granted mic instead of starting a recorder (and a
      // setInterval) that nothing will ever tear down.
      if (!aliveRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        onRecordingComplete(blob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch {
      // silent - mic permission denied
    }
  }, [onRecordingComplete]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  }, [isRecording]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
      setDuration(0);
      chunksRef.current = [];
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  }, [isRecording]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (isRecording) {
    return (
      // Inset rather than a second `glass-panel`: this strip expands *inside*
      // the composer, which is itself a glass panel. A panel with its own
      // border and drop shadow inside another one reads as a panel floating
      // inside a panel, so it drops the chrome and sits recessed instead.
      <div className="glass animate-pop-in flex items-center gap-3 rounded-2xl px-3 py-2 shadow-[inset_0_1px_0_0_rgb(var(--ui-glass-rgb)/0.06)]">
        <button
          onClick={cancelRecording}
          className="icon-btn"
          title="Cancel recording"
          aria-label="Cancel recording"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Recording indicator + elapsed time. `tabular` keeps the digits from
            jittering as the seconds tick over. */}
        <div className="flex items-center gap-2 rounded-lg border border-gray-700/60 bg-gray-950/45 px-2.5 py-1.5 shadow-[inset_0_1px_2px_rgb(0_0_0/0.25)]">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500 shadow-[0_0_8px_0_rgb(239_68_68/0.9)]" />
          <span className="tabular text-xs font-semibold text-red-300">{formatDuration(duration)}</span>
        </div>

        {/* Level meter: a fixed silhouette with a staggered shimmer, since the
            recorder reads no analyser data. Decorative only. */}
        <div className="flex h-5 items-end gap-[3px]" aria-hidden>
          {METER_BARS.map((bar, i) => (
            <span
              key={i}
              style={{ animationDelay: bar.delay }}
              className={`w-[3px] animate-pulse rounded-full bg-accent-400 shadow-[0_0_6px_-1px_rgb(var(--accent-400-rgb)/0.8)] ${bar.height}`}
            />
          ))}
        </div>

        <button
          onClick={stopRecording}
          className="btn-primary h-9 w-9 shrink-0 rounded-full p-0"
          title="Send recording"
          aria-label="Send recording"
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={startRecording}
      disabled={disabled}
      className="icon-btn disabled:cursor-not-allowed disabled:opacity-50"
      title="Record voice message"
      aria-label="Record voice message"
    >
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
      </svg>
    </button>
  );
}
