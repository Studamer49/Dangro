import { Request, Response, Router } from "express";
import multer from "multer";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { authenticate } from "../middleware/auth.js";
import { config } from "../config.js";
import { AppError, asyncHandler, ok, toErrorBody } from "../lib/http.js";
import { getMediaStore, MediaIngestError } from "../db/storage.js";
import { mongoClient } from "../prisma.js";

const router = Router();

fs.mkdirSync(config.uploadDir, { recursive: true });

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
  "application/pdf",
]);

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/ogg": ".ogg",
  "audio/webm": ".weba",
  "application/pdf": ".pdf",
};

/**
 * Confirms the bytes on disk really are the declared media type.
 * The extension is derived from this check and never from the client's
 * filename, so an `evil.html` upload can never be served as HTML.
 */
function sniffMatches(buffer: Buffer, mime: string): boolean {
  if (buffer.length < 12) return false;
  const ascii = (offset: number, text: string) =>
    buffer.length >= offset + text.length && buffer.subarray(offset, offset + text.length).toString("latin1") === text;

  switch (mime) {
    case "image/jpeg":
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case "image/png":
      return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "image/gif":
      return ascii(0, "GIF8");
    case "image/webp":
      return ascii(0, "RIFF") && ascii(8, "WEBP");
    case "video/mp4":
      return ascii(4, "ftyp");
    case "video/quicktime":
      return ascii(4, "ftyp") || ascii(4, "moov");
    case "video/webm":
    case "audio/webm":
      return buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    case "audio/wav":
      return ascii(0, "RIFF") && ascii(8, "WAVE");
    case "audio/mpeg":
      return ascii(0, "ID3") || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
    case "audio/ogg":
      return ascii(0, "OggS");
    case "application/pdf":
      return ascii(0, "%PDF");
    default:
      return false;
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadDir),
  // No extension here: it is assigned after the magic bytes are verified.
  filename: (_req, _file, cb) => cb(null, uuidv4()),
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(AppError.of("BAD_REQUEST", `File type not allowed: ${file.mimetype}`));
    }
  },
});

function runUpload(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    upload.single("file")(req, res, (err?: unknown) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function safeDisplayName(name: string): string {
  const cleaned = Array.from(name, (ch) => {
    const code = ch.codePointAt(0) ?? 0;
    return code < 32 || code === 127 ? "" : ch;
  })
    .join("")
    .replace(/[/\\]/g, "_");
  return cleaned.slice(0, 200);
}

router.post(
  "/",
  authenticate,
  asyncHandler(async (req, res) => {
    try {
      await runUpload(req, res);
    } catch (err) {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        throw AppError.of("PAYLOAD_TOO_LARGE", "File too large. Maximum size is 50MB.");
      }
      const body = toErrorBody(err);
      res.status(body.error.code === "PAYLOAD_TOO_LARGE" ? 413 : 400).json(body);
      return;
    }

    const file = req.file;
    if (!file) {
      throw AppError.of("BAD_REQUEST", "No file uploaded");
    }

    const cleanup = () => {
      fs.promises.unlink(file.path).catch(() => undefined);
    };

    let header: Buffer;
    try {
      const handle = await fs.promises.open(file.path, "r");
      header = Buffer.alloc(32);
      const { bytesRead } = await handle.read(header, 0, 32, 0);
      header = header.subarray(0, bytesRead);
      await handle.close();
    } catch {
      await cleanup();
      throw AppError.of("BAD_REQUEST", "File could not be read");
    }

    if (!sniffMatches(header, file.mimetype)) {
      await cleanup();
      throw AppError.of("BAD_REQUEST", "File contents do not match the declared file type");
    }

    const finalName = `${file.filename}${MIME_TO_EXT[file.mimetype]}`;

    // Media lands on disk (PostgreSQL), in GridFS (MongoDB), or on a remote
    // media host. All three hand back the same `/uploads/<uuid>.<ext>` URL.
    const store = getMediaStore(mongoClient);

    let stored: Awaited<ReturnType<typeof store.save>>;
    try {
      stored = await store.save(file.path, finalName, file.mimetype);
    } catch (err) {
      // Disk and remote stores leave the spool file behind on failure.
      await cleanup();
      if (err instanceof MediaIngestError) {
        // 502: the API is fine, the media host is not.
        throw new AppError(
          `Media could not be stored: ${err.message}`,
          502,
          "INTERNAL_ERROR"
        );
      }
      throw err;
    }

    const mimeType = file.mimetype;
    let type = "file";
    if (mimeType.startsWith("image/")) type = "image";
    else if (mimeType.startsWith("video/")) type = "video";
    else if (mimeType.startsWith("audio/")) type = "audio";

    ok(
      res,
      {
        url: stored.url,
        filename: safeDisplayName(file.originalname),
        size: stored.size,
        mimeType,
        type,
      },
      201
    );
  })
);

export default router;
