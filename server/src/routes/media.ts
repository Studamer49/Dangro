import { Request, Response, Router } from "express";
import { AppError, asyncHandler } from "../lib/http.js";
import { getMediaStore, safeUploadName } from "../db/storage.js";
import { mongoClient } from "../prisma.js";

/**
 * Serves media that is not on this machine's disk.
 *
 * - GridFS (MongoDB): streams the file out of the database.
 * - Remote media host: replies 302 so the browser fetches the bytes straight
 *   from that host. This keeps large videos from transiting the API.
 *
 * On the PostgreSQL + disk setup this router is not mounted at all, because
 * `express.static` handles `/uploads` directly.
 */
const router = Router();

router.get(
  "/:filename",
  asyncHandler(async (req: Request, res: Response) => {
    const name = safeUploadName(String(req.params.filename));
    if (!name) {
      throw AppError.of("BAD_REQUEST", "Invalid media name");
    }

    const media = await getMediaStore(mongoClient).resolve(name);
    if (!media) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Media not found" } });
      return;
    }

    if (media.redirect) {
      // 302 rather than 307/308 so the location is re-resolved each time;
      // the media host URL can change without stranding stored values.
      res.setHeader("Cache-Control", "public, max-age=1d");
      res.redirect(302, media.redirect);
      return;
    }

    res.setHeader("Content-Type", media.contentType ?? "application/octet-stream");
    if (media.size !== undefined) res.setHeader("Content-Length", String(media.size));
    res.setHeader("Cache-Control", "public, max-age=1d");

    media.stream?.on("error", () => res.destroy());
    media.stream?.pipe(res);
  })
);

export default router;