import type { Db, Document } from "mongodb";
import { MODELS } from "./mongoSchema.js";

/**
 * Creates the indexes MongoDB needs to behave like the Postgres schema.
 *
 * Postgres enforces uniqueness and foreign-key lookups because the schema
 * declares them. MongoDB enforces nothing on its own, so the constraints
 * declared in `mongoSchema.ts` are applied here as indexes:
 *
 *   - unique indexes for every `uniques` entry, so duplicate usernames,
 *     emails, friend edges, follow rows and reactions are rejected by the
 *     database rather than only by the checks in each route.
 *   - plain indexes for every foreign key, because that is exactly how the
 *     query engine loads relations (`{ authorId: { $in: [...] } }`).
 *
 * Safe to run on every boot: creating an index that already exists is a
 * no-op.
 */
export async function ensureIndexes(db: Db): Promise<void> {
  for (const model of Object.values(MODELS)) {
    const collection = db.collection<Document>(model.collection);

    for (const [key, fields] of Object.entries(model.uniques)) {
      const spec = Object.fromEntries(fields.map((field) => [field, 1]));
      try {
        await collection.createIndex(spec, { unique: true, name: `uniq_${key}` });
      } catch (err) {
        // Existing duplicates would fail this. That is worth shouting about,
        // but not worth refusing to boot over.
        console.error(
          `[db] could not create unique index ${model.collection}.${key}:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    // Foreign keys, deduplicated so a model with two relations to the same
    // table does not get the same index twice.
    const foreignKeys = new Set<string>();
    for (const rel of model.relations) {
      if (rel.ownKey) foreignKeys.add(rel.ownKey);
      if (rel.backKey) foreignKeys.add(rel.backKey);
    }

    for (const field of foreignKeys) {
      await collection.createIndex({ [field]: 1 }, { name: `fk_${field}` });
    }

    // Stories are always queried by expiry; conversations by recency.
    if (model.name === "story") {
      await collection.createIndex({ expiresAt: 1 }, { name: "expiry" });
    }
    if (model.name === "conversation") {
      await collection.createIndex({ lastMessageAt: -1 }, { name: "recency" });
    }
    if (model.name === "message") {
      await collection.createIndex({ channelId: 1, createdAt: -1 }, { name: "channel_timeline" });
    }
  }
}