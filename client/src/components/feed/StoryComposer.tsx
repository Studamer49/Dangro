import { useCallback, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from "react";
import Modal from "@/components/Modal";
import api from "@/lib/api";
import { uploadErrorMessage, uploadMedia } from "@/lib/upload";
import { useToast } from "@/stores/toastStore";
import {
  STORY_BACKGROUNDS,
  STORY_FONTS,
  renderSketchStory,
  renderTextStory,
} from "@/lib/storyCanvas";
import type { Story } from "@/types";

type Mode = "photo" | "text" | "draw";

interface Props {
  /** Editing an existing story: the submission replaces it instead. */
  editing?: Story | null;
  onClose: () => void;
  onCreated: (story: Story | undefined) => void;
}

const BRUSH_COLORS = ["#111827", "#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#ffffff"];
const BRUSH_SIZES = [4, 10, 22, 40];

/** Square drawing surface; the export is centred on a 9:16 story canvas. */
const DRAW_SIZE = 720;

/**
 * Story composer: a photo, a text card, or a sketch.
 *
 * Text and sketch are drawn to a canvas and uploaded as an image, so the server
 * stores exactly one media URL per story and the existing upload pipeline is
 * used unchanged.
 */
export default function StoryComposer({ editing, onClose, onCreated }: Props) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>(editing ? "photo" : "text");
  const [busy, setBusy] = useState(false);

  // Text mode
  const [text, setText] = useState("");
  const [backgroundId, setBackgroundId] = useState(STORY_BACKGROUNDS[0].id);
  const [fontId, setFontId] = useState(STORY_FONTS[0].id);

  // Draw mode
  const drawRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [brushColor, setBrushColor] = useState(BRUSH_COLORS[0]);
  const [brushSize, setBrushSize] = useState(BRUSH_SIZES[1]);
  const [eraser, setEraser] = useState(false);
  const historyRef = useRef<ImageData[]>([]);

  // Repaints the saved strokes; the canvas keeps its own bitmap otherwise.
  const paintBackground = useCallback(() => {
    const canvas = drawRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  /**
   * A callback ref rather than an effect: the canvas is only mounted while the
   * Draw tab is open, so switching Text -> Draw -> Text -> Draw hands React a
   * brand new, fully transparent element. Filling it on attach is what stops a
   * re-entered Draw tab from looking blank and from sharing an empty story (the
   * blank check reads an unfilled canvas as "something was drawn").
   */
  const attachCanvas = useCallback((node: HTMLCanvasElement | null) => {
    drawRef.current = node;
    if (!node) return;
    const ctx = node.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, node.width, node.height);
  }, []);

  /** Snapshots the canvas so undo can restore it. */
  const snapshot = useCallback(() => {
    const canvas = drawRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const entry = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // Bounded: 40 undos is plenty and stops an unbounded array growing per stroke.
    historyRef.current = [...historyRef.current.slice(-39), entry];
  }, []);

  const undo = () => {
    const previous = historyRef.current.pop();
    const canvas = drawRef.current;
    const ctx = canvas?.getContext("2d");
    if (!previous || !canvas || !ctx) return;
    ctx.putImageData(previous, 0, 0);
  };

  const clear = () => {
    snapshot();
    paintBackground();
  };

  const pointFrom = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = drawRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const ctx = drawRef.current?.getContext("2d");
    if (!ctx) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    snapshot();
    drawingRef.current = true;
    lastPointRef.current = pointFrom(event);
    ctx.beginPath();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = brushSize;
    ctx.strokeStyle = eraser ? "#ffffff" : brushColor;
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.stroke();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = drawRef.current?.getContext("2d");
    const previous = lastPointRef.current;
    if (!ctx || !previous) return;
    const next = pointFrom(event);
    // Interpolated segments: without this a fast drag draws gaps between the
    // pointer events rather than a continuous line.
    const distance = Math.hypot(next.x - previous.x, next.y - previous.y);
    const steps = Math.max(1, Math.floor(distance / (brushSize / 2)));
    for (let step = 1; step <= steps; step += 1) {
      ctx.beginPath();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = brushSize;
      ctx.strokeStyle = eraser ? "#ffffff" : brushColor;
      ctx.moveTo(previous.x + ((next.x - previous.x) * step) / steps, previous.y + ((next.y - previous.y) * step) / steps);
      ctx.lineTo(next.x, next.y);
      ctx.stroke();
    }
    lastPointRef.current = next;
  };

  const stopDrawing = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  /** Uploads a blob through the existing media pipeline. */
  const publish = async (blob: Blob, filename: string) => {
    setBusy(true);
    try {
      const uploaded = await uploadMedia(blob, filename);

      if (editing) {
        const { data: edited } = await api.patch(`/stories/${editing.id}`, {
          mediaUrl: uploaded.url,
          mediaType: "image",
        });
        toast.success("Story updated");
        onCreated(edited.story as Story);
        return;
      }

      const { data: created } = await api.post("/stories", {
        mediaUrl: uploaded.url,
        mediaType: "image",
      });
      toast.success("Story added");
      onCreated(created.story as Story);
    } catch (err) {
      toast.error(uploadErrorMessage(err, "Could not share your story"));
    } finally {
      setBusy(false);
    }
  };

  const sharePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      toast.error("Only images and videos can be added to a story");
      return;
    }
    setBusy(true);
    try {
      const uploaded = await uploadMedia(file);
      if (uploaded.type !== "image" && uploaded.type !== "video") {
        throw new Error("That file type cannot be used as a story");
      }
      const mediaType = uploaded.type;

      if (editing) {
        const { data: edited } = await api.patch(`/stories/${editing.id}`, {
          mediaUrl: uploaded.url,
          mediaType,
        });
        toast.success("Story updated");
        onCreated(edited.story as Story);
        return;
      }

      const { data: created } = await api.post("/stories", {
        mediaUrl: uploaded.url,
        mediaType,
      });
      toast.success("Story added");
      onCreated(created.story as Story);
    } catch (err) {
      toast.error(uploadErrorMessage(err, "Could not share your story"));
    } finally {
      setBusy(false);
    }
  };

  const shareText = async () => {
    if (!text.trim()) {
      toast.error("Write something first");
      return;
    }
    const blob = await renderTextStory({ text, backgroundId, fontId });
    await publish(blob, "story-text.png");
  };

  const shareDrawing = async () => {
    const canvas = drawRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const pixels = ctx?.getImageData(0, 0, canvas.width, canvas.height).data;
    if (!pixels) return;

    let blank = true;
    for (let index = 0; index < pixels.length; index += 4) {
      // Alpha is always 255 on a filled canvas; a pixel differing from white
      // means something was drawn.
      if (pixels[index] < 250 || pixels[index + 1] < 250 || pixels[index + 2] < 250) {
        blank = false;
        break;
      }
    }
    if (blank) {
      toast.error("Draw something first");
      return;
    }

    const blob = await renderSketchStory(canvas);
    await publish(blob, "story-sketch.png");
  };

  return (
    <Modal
      title={editing ? "Edit story" : "New story"}
      onClose={onClose}
      maxWidth="max-w-md"
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
          >
            Cancel
          </button>
          {mode === "text" && (
            <button
              onClick={shareText}
              disabled={busy || !text.trim()}
              className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-50"
            >
              {busy ? "Sharing…" : "Share"}
            </button>
          )}
          {mode === "draw" && (
            <button
              onClick={shareDrawing}
              disabled={busy}
              className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-50"
            >
              {busy ? "Sharing…" : "Share"}
            </button>
          )}
          {mode === "photo" && (
            <label className="cursor-pointer rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500">
              {busy ? "Uploading…" : editing ? "Replace" : "Choose a file"}
              <input type="file" accept="image/*,video/*" className="hidden" onChange={(e) => void sharePhoto(e)} />
            </label>
          )}
        </>
      }
    >
      <div className="mb-4 flex gap-1 rounded-lg bg-gray-800 p-1">
        {(["text", "draw", "photo"] as Mode[]).map((value) => (
          <button
            key={value}
            onClick={() => setMode(value)}
            className={`flex-1 rounded px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
              mode === value ? "bg-accent-600 text-white" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {value === "photo" ? "Photo" : value}
          </button>
        ))}
      </div>

      {mode === "text" && (
        <div className="space-y-4">
          <div
            className="flex h-40 items-center justify-center rounded-lg px-4"
            style={{
              background: (STORY_BACKGROUNDS.find((b) => b.id === backgroundId) ?? STORY_BACKGROUNDS[0]).css,
            }}
          >
            <p
              className="max-h-full overflow-hidden text-center text-white"
              style={{ font: STORY_FONTS.find((f) => f.id === fontId)?.css ?? STORY_FONTS[0].css }}
            >
              {text || "Your text here"}
            </p>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 280))}
            rows={3}
            maxLength={280}
            placeholder="Type something..."
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-accent-500 focus:outline-none"
          />
          <p className="-mt-2 text-right text-xs text-gray-500">{text.length}/280</p>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase text-gray-500">Background</label>
            <div className="flex flex-wrap gap-2">
              {STORY_BACKGROUNDS.map((background) => (
                <button
                  key={background.id}
                  onClick={() => setBackgroundId(background.id)}
                  aria-label={background.id}
                  title={background.id}
                  className={`h-8 w-8 rounded-full ${backgroundId === background.id ? "ring-2 ring-white" : ""}`}
                  style={{ background: background.css }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase text-gray-500">Font</label>
            <div className="flex flex-wrap gap-2">
              {STORY_FONTS.map((font) => (
                <button
                  key={font.id}
                  onClick={() => setFontId(font.id)}
                  className={`rounded px-2.5 py-1 text-xs transition-colors ${
                    fontId === font.id ? "bg-accent-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {font.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {mode === "draw" && (
        <div className="space-y-3">
          <canvas
            ref={attachCanvas}
            width={DRAW_SIZE}
            height={DRAW_SIZE}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={stopDrawing}
            onPointerLeave={stopDrawing}
            onPointerCancel={stopDrawing}
            className="w-full cursor-crosshair touch-none rounded-lg border border-gray-700 bg-white"
            style={{ aspectRatio: "1 / 1" }}
          />

          <div className="flex flex-wrap items-center gap-2">
            {BRUSH_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => {
                  setBrushColor(color);
                  setEraser(false);
                }}
                aria-label={`Brush ${color}`}
                className={`h-6 w-6 rounded-full border border-gray-600 ${
                  !eraser && brushColor === color ? "ring-2 ring-accent-500" : ""
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {BRUSH_SIZES.map((size) => (
              <button
                key={size}
                onClick={() => setBrushSize(size)}
                aria-label={`Size ${size}`}
                className={`rounded px-2.5 py-1 text-xs transition-colors ${
                  brushSize === size ? "bg-accent-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                {size}
              </button>
            ))}
            <button
              onClick={() => setEraser((current) => !current)}
              className={`ml-auto rounded px-2.5 py-1 text-xs transition-colors ${
                eraser ? "bg-accent-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              Eraser
            </button>
            <button
              onClick={undo}
              className="rounded bg-gray-800 px-2.5 py-1 text-xs text-gray-400 hover:bg-gray-700"
            >
              Undo
            </button>
            <button
              onClick={clear}
              className="rounded bg-gray-800 px-2.5 py-1 text-xs text-gray-400 hover:bg-gray-700"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {mode === "photo" && (
        <p className="py-6 text-center text-sm text-gray-400">
          Choose a photo or video to share.{" "}
          {editing ? "This replaces the current story." : ""}
        </p>
      )}
    </Modal>
  );
}
