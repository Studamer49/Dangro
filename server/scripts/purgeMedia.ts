/**
 * Deletes uploaded media (GridFS) from a Dangro database.
 *
 * Media is only removable today by deleting the message that references it.
 * Once images moved to Cloudinary the GridFS bucket is dead weight on Atlas,
 * where it competes for the free tier's 512 MB, and this empties it.
 *
 * IMPORTANT — why the database looks full of "many files":
 *
 * GridFS does not store one document per file. It stores one document in
 * `media.files` per upload, plus one document in `media.chunks` for every
 * 255 KB of that upload. A single 1.7 MB video is therefore 7 chunk
 * documents, and an 8 MB photo is 32. A handful of uploads fills
 * `media.chunks` with hundreds of near-identical documents, which in Atlas
 * Data Explorer looks like a lot of separate media. It is not — they are all
 * pieces of the same handful of files.
 *
 * This script counts and reports both, so that is visible before deleting.
 *
 * Safety, matching scripts/pruneServers.ts:
 *   - lists exactly what it would remove, and does nothing without --confirm
 *   - refuses --confirm against a local mongod, so a typo in MONGODB_URI
 *     cannot silently empty a real cluster
 *   - leaves the database usable: DM messages that referenced the removed
 *     files keep their row, they just stop rendering an image. Pass
 *     --clear-references to null the now-dangling URLs instead.
 *
 * Usage (with the production MONGODB_URI in the environment — copy it from
 * the Cloudflare dashboard's Worker secrets, or `wrangler secret list`; never
 * commit it):
 *
 *   npm --prefix server run purge:media
 *   npm --prefix server run purge:media -- --confirm
 *   npm --prefix server run purge:media -- --confirm --clear-references
 *
 * Every run prints the target first. Read it before passing --confirm.
 */

import { MongoClient, GridFSBucket } from "mongodb";

/**
 * The GridFS bucket name.
 *
 * Duplicated from `GRIDFS_BUCKET` in src/db/storage.ts on purpose. Importing
 * it would pull in config.ts, which runs dotenv and would quietly fill
 * MONGODB_URI from server/.env — so the script could target a different
 * database than the one whose URI was set in the shell. A destructive
 * maintenance script must read the environment and nothing else.
 *
 * If the bucket is ever renamed in storage.ts, change it here too.
 */
const GRIDFS_BUCKET = "media";

const args = process.argv.slice(2);
const confirmed = args.includes("--confirm");
const clearReferences = args.includes("--clear-references");

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function requireEnv(name: string): string {
  const value = env(name);
  if (!value) {
    console.error(`${name} is not set. Refusing to guess which database to touch.`);
    process.exit(1);
  }
  return value;
}

const uri = requireEnv("MONGODB_URI");
const dbName = env("MONGODB_DB_NAME") ?? "dangro";

const isLocal = /^mongodb:\/\/(127\.0\.0\.1|localhost)/.test(uri);
if (isLocal && confirmed) {
  console.error("Refusing to delete with --confirm against a local MongoDB. Set MONGODB_URI to the real cluster.");
  process.exit(1);
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function main(): Promise<void> {
  const driver = new MongoClient(uri);
  await driver.connect();
  const db = driver.db(dbName);

  const files = db.collection(`${GRIDFS_BUCKET}.files`);
  const chunks = db.collection(`${GRIDFS_BUCKET}.chunks`);

  const all = await files.find({}, { projection: { length: 1, uploadDate: 1, filename: 1 } }).toArray();
  const chunkCount = await chunks.countDocuments();
  const totalBytes = all.reduce((sum, f) => sum + (f.length ?? 0), 0);

  console.log(`\nDatabase: ${dbName} at ${uri.replace(/\/\/([^:]+):([^@]+)@/, "//$1:***@")}`);
  console.log(`\nGridFS bucket "${GRIDFS_BUCKET}":`);
  console.log(`  ${all.length} file document(s)  — one per uploaded file`);
  console.log(`  ${chunkCount} chunk document(s) — ~255 KB pieces of those files`);
  console.log(`  ${mb(totalBytes)} total\n`);

  if (all.length > 0) {
    console.log("  uploaded            size       stored as");
    for (const file of all.sort((a, b) => (a.uploadDate ?? 0).getTime() - (b.uploadDate ?? 0).getTime())) {
      const date = file.uploadDate ? file.uploadDate.toISOString().slice(0, 16).replace("T", " ") : "unknown";
      const pieceCount = Math.max(1, Math.ceil((file.length ?? 0) / (255 * 1024)));
      console.log(`  ${date}  ${mb(file.length ?? 0).padStart(9)}  ${pieceCount} chunk(s)  ${file.filename ?? ""}`);
    }
  }

  // Messages that will be left pointing at media that no longer exists.
  const names = all.map((f) => f.filename).filter((n): n is string => typeof n === "string");
  let affectedMessages = 0;
  if (names.length > 0) {
    affectedMessages = await db
      .collection("direct_messages")
      .countDocuments({ attachmentUrl: { $in: names.map((n) => `/uploads/${n}`) } });
  }

  console.log(`\n${affectedMessages} DM message(s) reference this media.`);

  if (all.length === 0) {
    console.log("\nNothing to delete.");
    await driver.close();
    process.exit(0);
  }

  if (!confirmed) {
    console.log(`\nDry run. Re-run with --confirm to delete ${all.length} file(s) and ${chunkCount} chunk(s).`);
    console.log("Messages keep their rows and will simply stop showing an image.");
    if (affectedMessages > 0) {
      console.log(`Add --clear-references to also set attachmentUrl to null on those ${affectedMessages} message(s).`);
    }
    await driver.close();
    process.exit(0);
  }

  const bucket = new GridFSBucket(db, { bucketName: GRIDFS_BUCKET });
  let removed = 0;
  for (const file of all) {
    await bucket.delete(file._id);
    removed += 1;
    console.log(`  deleted ${file.filename ?? file._id}`);
  }

  console.log(`\nRemoved ${removed} file(s).`);

  if (clearReferences && names.length > 0) {
    const result = await db
      .collection("direct_messages")
      .updateMany(
        { attachmentUrl: { $in: names.map((n) => `/uploads/${n}`) } },
        { $set: { attachmentUrl: null, attachmentType: null, attachmentPublicId: null } }
      );
    console.log(`Cleared the attachment URL on ${result.modifiedCount} message(s).`);
  } else if (affectedMessages > 0) {
    console.log(
      `\n${affectedMessages} message(s) now point at deleted media. Re-run with --clear-references to tidy them.`
    );
  }

  const left = await files.countDocuments();
  const leftChunks = await chunks.countDocuments();
  console.log(`\nRemaining: ${left} file(s), ${leftChunks} chunk(s).`);

  await driver.close();
}

void main();