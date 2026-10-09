import { Request, Response, Router } from "express";
import { AppError, asyncHandler } from "../lib/http.js";
import { getMediaStore, safeUploadName } from "../db/storage.js";
import { mongoClient } from "../prisma.js";

/**
 * Serves media that lives in the database.
 *
 * On the PostgreSQL backend, `/uploads` is handled by `express.static` and
 * this router is not mounted at all. On the MongoDB backend, files live in
 * GridFS and this route streams them out, so the public URLs are identical
 * on both backends.
 */
const router = Router();

router.get(
  "/:filename",
  asyncHandler(async (req: Request, res: Response) => {
    const name = safeUploadName(String(req.params.filename));
    if (!name) {
      throw AppError.of("BAD_REQUEST", "Invalid media name");
    }

    const media = await getMediaStore(mongoClient).read(name);
    if (!media) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Media not found" } });
      return;
    }

    res.setHeader("Content-Type", media.contentType);
    res.setHeader("Content-Length", String(media.size));
    res.setHeader("Cache-Control", "public, max-age=1d");

    media.stream.on("error", () => res.destroy());
    media.stream.pipe(res);
  })
);

export default router;