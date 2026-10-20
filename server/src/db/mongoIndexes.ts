import type { Db, Document } from "mongodb";
import { MODELS } from "./mongoSchema.js";
import {
  ADMIN_PERMISSIONS,
  EVERYONE_PERMISSIONS,
  MODERATOR_PERMISSIONS,
  legacyRoleNames,
} from "../lib/permissions.js";

// Duplicated here rather than imported: this module runs before the routes and
// must not pull the Prisma singleton in through permissions.ts.
const DEFAULT_EVERYONE = EVERYONE_PERMISSIONS;
const DEFAULT_MODERATOR = MODERATOR_PERMISSIONS;
const DEFAULT_ADMIN = ADMIN_PERMISSIONS;

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
    // The sidebar loads a server's channels and categories in order on every
    // channel switch.
    if (model.name === "channel") {
      await collection.createIndex({ serverId: 1, position: 1 }, { name: "server_order" });
    }
    if (model.name === "category") {
      await collection.createIndex({ serverId: 1, position: 1 }, { name: "server_order" });
    }
    if (model.name === "invite") {
      await collection.createIndex({ serverId: 1, createdAt: -1 }, { name: "server_invites" });
    }
    // Every link a user clicks resolves to exactly one row by token hash, and
    // without this the claim is a full collection scan — which turns "click
    // the link in my email" into a slow request on a large deployment.
    if (model.name === "user") {
      await collection.createIndex({ emailVerificationTokenHash: 1 }, { name: "email_verification_token" });
      await collection.createIndex({ passwordResetTokenHash: 1 }, { name: "password_reset_token" });
    }
    if (model.name === "role") {
      await collection.createIndex({ serverId: 1, position: -1 }, { name: "server_order" });
      // At most one @everyone per server; it is the baseline every member
      // resolves through, so two would double-count every permission.
      await collection.createIndex(
        { serverId: 1, isEveryone: 1 },
        { unique: true, name: "uniq_server_everyone", partialFilterExpression: { isEveryone: true } }
      );
    }
  }
}

/**
 * Gives servers created before categories existed a default folder and an
 * ordered channel list.
 *
 * The sidebar groups channels by `categoryId` and sorts by `position`.
 * Documents written before those fields existed have neither, so they would
 * all pile into the uncategorised group in arbitrary order. This backfills
 * them in place, once, and is a no-op on any document that already has a
 * `position`.
 *
 * Safe to run on every boot.
 */
export async function backfillServerLayout(db: Db): Promise<void> {
  // Ids in this app are UUID strings stored in `_id`, not ObjectIds — see the
  // note in mongoSchema.ts. The driver otherwise infers `Document<{ _id:
  // ObjectId }>` and rejects a string key. `FlexibleDoc` allows the extra
  // columns this backfill writes without forcing them onto every read.
  type FlexibleDoc = { _id: string; [key: string]: unknown };
  const servers = db.collection<FlexibleDoc>("servers");
  const categories = db.collection<FlexibleDoc>("categories");
  const channels = db.collection<FlexibleDoc>("channels");

  // Channels missing a position: written before the column existed.
  const unpositioned = await channels
    .find({ position: { $exists: false } })
    .project<{ _id: string; serverId?: string }>({ _id: 1, serverId: 1 })
    .toArray();

  if (unpositioned.length > 0) {
    // Grouped per server so each one gets 0,1,2… in a stable order.
    const byServer = new Map<string, string[]>();
    for (const channel of unpositioned) {
      const serverId = String(channel.serverId);
      const bucket = byServer.get(serverId);
      if (bucket) bucket.push(String(channel._id));
      else byServer.set(serverId, [String(channel._id)]);
    }

    for (const [serverId, ids] of byServer) {
      const operations = ids.map((_id, index) => ({
        updateOne: { filter: { _id }, update: { $set: { position: index } } },
      }));
      if (operations.length > 0) await channels.bulkWrite(operations);
      console.log(`[db] assigned channel positions for server ${serverId} (${ids.length} channels)`);
    }
  }

  // Servers whose channels are all uncategorised get a default folder, so a
  // pre-categories server does not show one bare "Text Channels" header with
  // nothing in it and every channel floating above it.
  const allServers = await servers.find({}).project<{ _id: string }>({ _id: 1 }).toArray();

  for (const server of allServers) {
    const serverId = String(server._id);
    const existing = await categories.countDocuments({ serverId });
    if (existing > 0) continue;

    const hasChannels = await channels.countDocuments({ serverId });
    if (hasChannels === 0) continue;

    const categoryId = crypto.randomUUID();
    await categories.insertOne({
      _id: categoryId,
      name: "Text Channels",
      serverId,
      position: 0,
      createdAt: new Date(),
    });
    // Only channels with no category at all; one that was explicitly
    // uncategorised (categoryId: null) stays out of the folder.
    await channels.updateMany({ serverId, categoryId: { $exists: false } }, { $set: { categoryId } });
    console.log(`[db] created a default category for server ${serverId}`);
  }
}

/**
 * Gives servers created before the roles table their starting roles, and maps
 * the legacy single-role column onto them.
 *
 * Without this a server that already existed would have no roles at all, so
 * every permission check would fail and its admins would be locked out of
 * their own server the moment the role system deployed.
 *
 * Safe to run on every boot: a server that already has roles is skipped.
 */
export async function backfillServerRoles(db: Db): Promise<void> {
  type FlexibleDoc = { _id: string; [key: string]: unknown };

  const servers = db.collection<FlexibleDoc>("servers");
  const roles = db.collection<FlexibleDoc>("roles");
  const members = db.collection<FlexibleDoc>("members");
  const memberRoles = db.collection<FlexibleDoc>("member_roles");

  const allServers = await servers.find({}).project<{ _id: string; ownerId: string }>({ _id: 1, ownerId: 1 }).toArray();

  const DEFAULTS = [
    { name: "@everyone", position: 0, color: null, permissions: DEFAULT_EVERYONE },
    { name: "Moderator", position: 10, color: "#3ba55d", permissions: DEFAULT_MODERATOR },
    { name: "Admin", position: 20, color: "#f23f43", permissions: DEFAULT_ADMIN },
  ];

  for (const server of allServers) {
    const serverId = String(server._id);
    if ((await roles.countDocuments({ serverId })) > 0) continue;

    const idByName = new Map<string, string>();
    for (const preset of DEFAULTS) {
      const id = crypto.randomUUID();
      idByName.set(preset.name, id);
      await roles.insertOne({
        _id: id,
        serverId,
        name: preset.name,
        color: preset.color,
        position: preset.position,
        permissions: preset.permissions,
        isEveryone: preset.name === "@everyone",
        hoist: preset.name !== "@everyone",
        createdAt: new Date(),
      });
    }

    // Map the legacy `role` string onto the matching seeded role, so nobody
    // loses the access they already had.
    const serverMembers = await members
      .find({ serverId })
      .project<{ _id: string; role?: string }>({ _id: 1, role: 1 })
      .toArray();

    const links: FlexibleDoc[] = [];
    for (const member of serverMembers) {
      const wanted = legacyRoleNames(member.role);
      for (const name of wanted) {
        const roleId = idByName.get(name);
        if (roleId) links.push({ _id: crypto.randomUUID(), memberId: member._id, roleId, createdAt: new Date() });
      }
    }
    if (links.length > 0) await memberRoles.insertMany(links);

    console.log(
      `[db] seeded default roles for server ${serverId} (${serverMembers.length} member(s), ${links.length} role link(s))`
    );
  }
}