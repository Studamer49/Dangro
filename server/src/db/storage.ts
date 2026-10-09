import fs from "fs";
import path from "path";
import { GridFSBucket, MongoClient, type GridFSFile } from "mongodb";
import { config } from "../config.js";

/**
 * Media storage.
 *
 * Two interchangeable backends:
 *   - DiskMediaStore      files land in `server/uploads`, served by express.static.
 *   - GridFSMediaStore    files are chunked into GridFS inside MongoDB.
 *
 * Why GridFS and not a plain document field: BSON documents are capped at
 * 16 MB, and video uploads are allowed up to 50 MB. GridFS is MongoDB's
 * purpose-built answer — it splits a file into 255 KB chunks across two
 * collections and reassembles it on read.
 *
 * Both stores are addressed by the same `/uploads/<uuid>.<ext>` URL, so the
 * client and every stored `attachmentUrl` / `mediaUrl` / `icon` value are
 * identical no matter which backend is running.
 */

export const GRIDFS_BUCKET = "media";

export interface StoredMedia {
  /** Stable public URL, identical in shape on both backends. */
  url: string;
  filename: string;
  size: number;
}

export interface DownloadableMedia {
  stream: NodeJS.ReadableStream;
  contentType: string;
  size: number;
}

export interface MediaStore {
  /** Moves the validated temp file into permanent storage. */
  save(tempPath: string, filename: string, contentType: string): Promise<StoredMedia>;
  /** Opens a stored file for streaming, or null when it does not exist. */
  read(filename: string): Promise<DownloadableMedia | null>;
  /** True when files live in the database rather than on disk. */
  readonly inDatabase: boolean;
}

export function diskMediaStore(): MediaStore {
  return {
    inDatabase: false,

async save(
    tempPath: string,
    filename: string,
    contentType: string
  ): Promise<StoredMedia> {
    void contentType;
      const size = fs.statSync(tempPath).size;
      return { url: `/uploads/${filename}`, filename, size };
    },

    async read() {
      // express.static already serves disk uploads; nothing to do here.
      return null;
    },
  };
}

export class GridFSMediaStore implements MediaStore {
  readonly inDatabase = true;
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

  async read(filename: string): Promise<DownloadableMedia | null> {
    // Filenames come from the URL, so refuse anything that is not a bare
    // uuid + extension before it reaches the bucket.
    if (!/^[a-f0-9-]+\.[a-z0-9]+$/i.test(filename)) return null;

    const found = await this.bucket.find({ filename }).toArray();
    const file = found[0] as GridFSFile | undefined;
    if (!file) return null;

    return {
      stream: this.bucket.openDownloadStream(file._id),
      contentType: (file.contentType as string | undefined) ?? "application/octet-stream",
      size: file.length,
    };
  }
}

/** Sanitises the stored filename component of a `/uploads/...` path. */
export function safeUploadName(name: string): string | null {
  const base = path.basename(name);
  if (!/^[a-f0-9-]+\.[a-z0-9]+$/i.test(base)) return null;
  return base;
}

let cached: MediaStore | null = null;

/** The active store, chosen once per process from the configured provider. */
export function getMediaStore(client: MongoClient | null): MediaStore {
  if (cached) return cached;
  if (!client) {
    cached = diskMediaStore();
    return cached;
  }
  cached = new GridFSMediaStore(client, config.mongoDbName);
  return cached;
}

/** Exposed for tests: drop the memoised store. */
export function resetMediaStore(): void {
  cached = null;
}