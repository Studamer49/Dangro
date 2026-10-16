/**
 * Client-side video trimming.
 *
 * Avatars and banners may be a video, but only a short loop reads as an avatar
 * rather than a clip: the cap here is five seconds. There is no server-side
 * transcoder, so the trim happens in the browser by playing the chosen window
 * and re-recording it through `MediaRecorder` — a re-encode, but a
 * dependency-free one that every Chromium/Firefox build supports.
 *
 * When a browser cannot do it (`captureStream`/`MediaRecorder` absent), the
 * caller must refuse an over-long clip rather than upload something longer
 * than the cap. `canTrimVideo()` is how it finds out.
 */

/** The most a banner/avatar video is allowed to last. */
export const MAX_TRIM_SECONDS = 5;
export const MAX_TRIM_MS = MAX_TRIM_SECONDS * 1000;

/** The shortest clip worth producing, to avoid an empty/1-frame video. */
export const MIN_TRIM_MS = 500;

export interface VideoMetadata {
  /** Duration in seconds, as reported by the media element. */
  duration: number;
  width: number;
  height: number;
}

export function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/");
}

/**
 * Fetches a stored media URL back into a File, so an already-uploaded clip can
 * be re-opened in the trimmer.
 *
 * Avatars and banners keep only a URL, and re-trimming needs the bytes. Uploaded
 * clips are served same-origin (GridFS or `/uploads`), so no CORS dance is
 * needed. A remote URL a user pasted still works when its host allows a plain
 * cross-origin read; the default same-origin credentials mode keeps the request
 * from being rejected by a `*` CORS policy the way an `include` would.
 */
export async function fileFromUrl(url: string): Promise<File> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load the current video (HTTP ${response.status})`);
  }
  const blob = await response.blob();
  const clean = url.split(/[?#]/, 1)[0];
  const ext = clean.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "mp4";
  const name = clean.split("/").pop() || `clip.${ext}`;
  const type = blob.type || `video/${ext === "mov" ? "quicktime" : ext}`;
  return new File([blob], name, { type });
}

function once(target: EventTarget, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(event, onEvent);
      target.removeEventListener("error", onError);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`Video ${event} failed`));
    };
    target.addEventListener(event, onEvent, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

/** Reads a video's duration and dimensions from a URL (usually a blob URL). */
export function loadVideoMetadata(url: string): Promise<VideoMetadata> {
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  return once(video, "loadedmetadata").then(() => {
    const meta: VideoMetadata = {
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      width: video.videoWidth,
      height: video.videoHeight,
    };
    video.removeAttribute("src");
    video.load();
    return meta;
  });
}

/** `captureStream` is not in every browser's media element, or TS's DOM lib. */
type CaptureVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

function captureStreamOf(video: HTMLVideoElement): MediaStream | null {
  const el = video as CaptureVideo;
  try {
    if (typeof el.captureStream === "function") return el.captureStream();
    if (typeof el.mozCaptureStream === "function") return el.mozCaptureStream();
  } catch {
    return null;
  }
  return null;
}

/** Whether in-browser trimming is possible at all here. */
export function canTrimVideo(): boolean {
  if (typeof MediaRecorder === "undefined") return false;
  return captureStreamOf(document.createElement("video")) !== null;
}

/**
 * The best container the browser will record.
 *
 * WebM with VP9 is preferred for size/quality; the list is ordered so the first
 * supported choice wins, and an empty result lets the browser pick.
 */
const CANDIDATE_MIME_TYPES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4",
];

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const mime of CANDIDATE_MIME_TYPES) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      // Some engines throw for unknown strings instead of returning false.
    }
  }
  return undefined;
}

/**
 * Cuts `startMs`–`endMs` from `file` and returns a new, self-contained file.
 *
 * The window is clamped to `MAX_TRIM_MS`, so the result can never exceed the
 * cap regardless of what the caller passes. The output is video-only (no audio
 * track): avatars and banners play muted, so carrying audio would only waste
 * bytes.
 */
export async function trimVideoFile(file: File, startMs: number, endMs: number): Promise<File> {
  const span = Math.min(MAX_TRIM_MS, Math.max(MIN_TRIM_MS, endMs - startMs));
  const url = URL.createObjectURL(file);

  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  let stream: MediaStream | null = null;
  try {
    await once(video, "loadedmetadata");

    stream = captureStreamOf(video);
    if (!stream || typeof MediaRecorder === "undefined") {
      throw new Error("This browser cannot trim video.");
    }

    const mimeType = pickRecorderMime();
    // Video-only: drop any audio track the source carried.
    const recordStream = new MediaStream(stream.getVideoTracks());
    const recorder = new MediaRecorder(recordStream, {
      ...(mimeType ? { mimeType } : {}),
      // A high bitrate keeps the re-encode close to the source, which matters
      // because a banner/avatar is looked at closely.
      videoBitsPerSecond: 8_000_000,
    });

    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });

    // Seek to the clip start before recording begins.
    const safeStart = Math.max(0, Math.min(startMs, Math.max(0, video.duration * 1000 - MIN_TRIM_MS)));
    video.currentTime = safeStart / 1000;
    if (video.seeking) await once(video, "seeked");

    recorder.start();
    await video.play();
    // Record exactly the window, then stop. Recording the wall-clock duration
    // is what bounds the output; the encode keeps whatever resolution the
    // source had.
    await new Promise((resolve) => window.setTimeout(resolve, span));
    video.pause();
    recorder.stop();
    await stopped;

    const type = recorder.mimeType || mimeType || "video/webm";
    const blob = new Blob(chunks, { type });
    if (blob.size === 0) throw new Error("The trimmed clip came back empty.");

    const ext = type.includes("mp4") ? "mp4" : "webm";
    const base = file.name.replace(/\.[^.]+$/, "") || "clip";
    return new File([blob], `${base}-trim.${ext}`, { type });
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    stream?.getTracks().forEach((track) => track.stop());
    URL.revokeObjectURL(url);
  }
}
