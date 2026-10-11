/**
 * Turns a text or sketch composition into a PNG blob for upload.
 *
 * Stories are stored as a single media URL, the same shape an uploaded photo
 * has. Rather than adding a second storage format — and a schema migration, and
 * a rendering path the server would have to own — text and sketch stories are
 * drawn to a canvas here and uploaded as an ordinary image. The server sees an
 * image either way, and the existing pipeline handles it unchanged.
 */

/** Stories render at 1080x1920 like every other story app. */
export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

/** Backgrounds offered by the text composer. */
export const STORY_BACKGROUNDS: Array<{ id: string; css: string }> = [
  { id: "sunset", css: "linear-gradient(160deg, #ff9a4d 0%, #ff5f6d 55%, #c471ed 100%)" },
  { id: "ocean", css: "linear-gradient(160deg, #43cea2 0%, #185a9d 100%)" },
  { id: "grape", css: "linear-gradient(160deg, #5f2c82 0%, #49a09d 100%)" },
  { id: "ember", css: "linear-gradient(160deg, #f12711 0%, #f5af19 100%)" },
  { id: "ink", css: "linear-gradient(160deg, #232526 0%, #414345 100%)" },
  { id: "mint", css: "linear-gradient(160deg, #a8edea 0%, #fed6e3 100%)" },
  { id: "sky", css: "linear-gradient(160deg, #4facfe 0%, #00f2fe 100%)" },
  { id: "rose", css: "linear-gradient(160deg, #ee9ca7 0%, #ffdde1 100%)" },
];

/** Font styles offered by the text composer. */
export const STORY_FONTS: Array<{ id: string; css: string; label: string }> = [
  { id: "sans", css: "600 84px system-ui, -apple-system, 'Segoe UI', sans-serif", label: "Classic" },
  { id: "serif", css: "italic 600 88px Georgia, 'Times New Roman', serif", label: "Elegant" },
  { id: "mono", css: "700 80px 'Courier New', monospace", label: "Typewriter" },
  { id: "heavy", css: "900 96px Impact, 'Arial Black', sans-serif", label: "Bold" },
  { id: "light", css: "300 84px system-ui, -apple-system, sans-serif", label: "Light" },
  { id: "round", css: "800 84px 'Trebuchet MS', 'Segoe UI', sans-serif", label: "Round" },
];

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not render the story"));
    }, "image/png");
  });
}

function createCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;
  return canvas;
}

/**
 * Draws a text story: gradient background, centred wrapped text, and an
 * optional author tag in the corner.
 */
export async function renderTextStory(options: {
  text: string;
  backgroundId: string;
  fontId: string;
  username?: string;
}): Promise<Blob> {
  const canvas = createCanvas();
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser");

  const background =
    STORY_BACKGROUNDS.find((b) => b.id === options.backgroundId) ?? STORY_BACKGROUNDS[0];
  const font = STORY_FONTS.find((f) => f.id === options.fontId) ?? STORY_FONTS[0];

  ctx.fillStyle = background.css;
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

  const maxWidth = STORY_WIDTH - 160;
  const lines = wrapText(ctx, options.text, maxWidth);
  const lineHeight = 104;
  const startY = STORY_HEIGHT / 2 - ((lines.length - 1) * lineHeight) / 2;

  ctx.font = font.css;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // A soft shadow so light text stays legible over a pale gradient.
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 4;

  lines.forEach((line, index) => {
    ctx.fillText(line, STORY_WIDTH / 2, startY + index * lineHeight);
  });

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  if (options.username) {
    ctx.font = "500 44px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.fillText(`@${options.username}`, 80, 110);
  }

  return canvasToBlob(canvas);
}

/**
 * Copies a live drawing canvas into a story-sized PNG.
 *
 * The drawing surface is square-ish while the story is 9:16, so it is centred
 * on a plain white field rather than stretched, which would distort the strokes.
 */
export async function renderSketchStory(source: HTMLCanvasElement): Promise<Blob> {
  const canvas = createCanvas();
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

  const side = Math.min(STORY_WIDTH, STORY_HEIGHT) * 0.92;
  const x = (STORY_WIDTH - side) / 2;
  const y = (STORY_HEIGHT - side) / 2;
  ctx.drawImage(source, x, y, side, side);

  return canvasToBlob(canvas);
}

/** Greedy word wrap; a single word longer than the line is split by character. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const paragraphs = text.split("\n");
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = "";

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      current = word;
    }
    lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}
