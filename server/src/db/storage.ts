import fs from "fs";
import path from "path";
import { Readable } from "node:stream";
import { GridFSBucket, MongoClient, type GridFSFile } from "mongodb";
import { config } from "../config.js";
import { contentTypeForName, safeUploadName } from "./mediaNames.js";

/**
 * Media storage.
 *
 * Three interchangeable backends, chosen by `MEDIA_PROVIDER`:
 *
 *   disk    files land in `server/uploads`, served by express.static.
 *           Used with the PostgreSQL backend.
 *   gridfs  files are chunked into GridFS inside MongoDB.
 *   remote  files are held on a separate media host (see `media-service/`),
 *           and the API redirects to them.
 *
 * All three hand out the same `/uploads/<uuid>.<ext>` URL, so stored
 * `attachmentUrl` / `mediaUrl` / `icon` values keep their meaning and the
 * client needs no changes.
 *
 * Why remote exists: BSON caps documents at 16 MB and 50 MB videos do not
 * belong in a database that also holds your messages. With `remote` the
 * browser fetches bytes straight from the media host, so large files never
 * pass through the API.
 */

export const GRIDFS_BUCKET = "media";

export interface StoredMedia {
  /** Stable public URL, identical in shape on every backend. */
  url: string;
  filename: string;
  size: number;
}

export interface ResolvedMedia {
  /** Set when the bytes live elsewhere: the caller should redirect here. */
  redirect?: string;
  /** Set when this process can stream the bytes itself. */
  stream?: NodeJS.ReadableStream;
  contentType?: string;
  size?: number;
}

export interface MediaStore {
  /** Moves the validated temp file into permanent storage. */
  save(tempPath: string, filename: string, contentType: string): Promise<StoredMedia>;
  /** Locates a stored file, either to stream it or to redirect to it. */
  resolve(filename: string): Promise<ResolvedMedia | null>;
  /** True when callers must not stream bytes and should redirect instead. */
  readonly redirects: boolean;
}

export function diskMediaStore(): MediaStore {
  return {
    redirects: false,

    async save(tempPath: string, filename: string): Promise<StoredMedia> {
      // Multer spools the upload under a bare uuid with no extension; the
      // extension is only assigned once the magic bytes have been verified.
      // The file therefore has to be moved to its final name here — without
      // this the stored file keeps the spool name while the URL handed back
      // (and persisted as `avatar`/`mediaUrl`) carries the extension, so
      // express.static is asked for a path that does not exist and every
      // upload 404s into the SPA shell.
      const target = path.join(config.uploadDir, filename);
      const size = fs.statSync(tempPath).size;

      if (path.resolve(tempPath) !== path.resolve(target)) {
        try {
          await fs.promises.rename(tempPath, target);
        } catch (err) {
          // EXDEV: the spool landed on a different filesystem than the
          // upload directory. Copy, then drop the spool file.
          if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
          await fs.promises.copyFile(tempPath, target);
          await fs.promises.unlink(tempPath).catch(() => undefined);
        }
      }

      return { url: `/uploads/${filename}`, filename, size };
    },

    async resolve() {
      // express.static already serves disk uploads; nothing to do here.
      return null;
    },
  };
}

export class GridFSMediaStore implements MediaStore {
  readonly redirects = false;
  private readonly bucket: GridFSBucket;

  constructor(client: MongoClient, dbName: string) {
    this.bucket = new GridFSBucket(client.db(dbName), { bucketName: GRIDFS_BUCKET });
  }

  async save(
    tempPath: string,
    filename: string,
    contentType: string
  ): Promise<StoredMedia> {
    const size = fs.statSync(tempPath).size;

    await new Promise<void>((resolve, reject) => {
      const stream = this.bucket.openUploadStream(filename, {
        contentType,
        metadata: { uploadedAt: new Date() },
      });
      stream.on("error", reject);
      stream.on("finish", () => resolve());
      fs.createReadStream(tempPath).on("error", reject).pipe(stream);
    });

    // The temp file only spooled the upload for magic-byte validation.
    await fs.promises.unlink(tempPath).catch(() => undefined);

    return { url: `/uploads/${filename}`, filename, size };
  }

  async resolve(filename: string): Promise<ResolvedMedia | null> {
    if (!safeUploadName(filename)) return null;

    const found = await this.bucket.find({ filename }).toArray();
    const file = found[0] as GridFSFile | undefined;
    if (!file) return null;

    return {
      stream: this.bucket.openDownloadStream(file._id),
      contentType: (file.contentType as string | undefined) ?? contentTypeForName(filename),
      size: file.length,
    };
  }
}

/** Raised when the media host is unreachable or rejects an upload. */
export class MediaIngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaIngestError";
  }
}

export class RemoteMediaStore implements MediaStore {
  readonly redirects = true;
  private readonly ingestUrl: string;
  private readonly publicUrl: string;
  private readonly key: string;

  constructor(ingestUrl: string, publicUrl: string, key: string) {
    this.ingestUrl = ingestUrl.replace(/\/$/, "");
    this.publicUrl = publicUrl.replace(/\/$/, "");
    this.key = key;
  }

  async save(
    tempPath: string,
    filename: string,
    contentType: string
  ): Promise<StoredMedia> {
    if (!safeUploadName(filename)) {
      throw new MediaIngestError(`Refusing to store an unsafe media name: ${filename}`);
    }

    const size = fs.statSync(tempPath).size;

    // Streamed rather than buffered: a 50 MB video must not be held in
    // memory on a small API host.
    const body = Readable.toWeb(fs.createReadStream(tempPath)) as ReadableStream;

    let response: Response;
    try {
      response = await fetch(`${this.ingestUrl}/media/${filename}`, {
        method: "PUT",
        headers: {
          "content-type": contentType,
          "x-media-key": this.key,
          "content-length": String(size),
        },
        body,
        duplex: "half",
      } as RequestInit);
    } catch (err) {
      throw new MediaIngestError(
        `Media host unreachable at ${this.ingestUrl}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new MediaIngestError(
        `Media host rejected the upload with ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`
      );
    }

    // The spool file is this host's staging copy only. It is already on the
    // media host by now, so leaving it behind would leak a full copy of every
    // upload onto the API's disk — on Render that fills the free tier, and on
    // a persistent disk it doubles the storage for no reason.
    await fs.promises.unlink(tempPath).catch(() => undefined);

    return { url: `/uploads/${filename}`, filename, size };
  }

  async resolve(filename: string): Promise<ResolvedMedia | null> {
    if (!safeUploadName(filename)) return null;
    return { redirect: `${this.publicUrl}/media/${filename}` };
  }
}

let cached: MediaStore | null = null;

/** The active store, chosen once per process from the configured provider. */
export function getMediaStore(client: MongoClient | null): MediaStore {
  if (cached) return cached;

  switch (config.mediaProvider) {
    case "remote":
      cached = new RemoteMediaStore(config.mediaIngestUrl, config.mediaPublicUrl, config.mediaIngestKey);
      break;
    case "gridfs":
      if (!client) throw new Error("MEDIA_PROVIDER=gridfs requires a MongoDB connection");
      cached = new GridFSMediaStore(client, config.mongoDbName);
      break;
    default:
      cached = diskMediaStore();
  }

  return cached;
}

/** Exposed for tests: drop the memoised store. */
export function resetMediaStore(): void {
  cached = null;
}

export { safeUploadName, contentTypeForName };