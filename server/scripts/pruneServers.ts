/**
 * Deletes servers from a Dangro database, cascading exactly like the API does.
 *
 * Servers can only be deleted through the API by their owner, which makes
 * cleaning up abandoned or test servers impossible without those credentials.
 * This runs the same `prisma.server.delete` the HTTP route runs, so the
 * MongoDB cascade (channels → messages, categories, invites, members) is
 * identical to a user-initiated delete.
 *
 * Safety: lists what it would delete and refuses to touch anything unless
 * `--confirm` is passed, and even then only the servers named on the command
 * line or matching `--match`.
 *
 * Usage (against production, with the production MONGODB_URI in the
 * environment — e.g. from a local shell with the Worker secret exported, or
 * from a one-off container):
 *
 *   npm --prefix server run prune:servers
 *   npm --prefix server run prune:servers -- <server-id> [<server-id> ...]
 *   npm --prefix server run prune:servers -- --match "QA Server"
 *   npm --prefix server run prune:servers -- --match "^QA" --confirm
 *
 * Every run prints the target first. Read it before passing --confirm.
 */

import { MongoClient } from "mongodb";
import { createMongoClient } from "../src/db/mongoClient.js";
import { MODELS } from "../src/db/mongoSchema.js";

const args = process.argv.slice(2);
const confirmed = args.includes("--confirm");
const matchIndex = args.indexOf("--match");
const matchPattern = matchIndex !== -1 ? args[matchIndex + 1] : undefined;
const ids = args.filter((arg) => !arg.startsWith("--") && arg !== matchPattern);

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

const uri = env("MONGODB_URI");
const dbName = env("MONGODB_DB_NAME") ?? "dangro";

if (!uri) {
  console.error("MONGODB_URI is not set. Refusing to guess which database to touch.");
  process.exit(1);
}

// Refuse to run against a local mongod by accident: a typo in the URI would
// otherwise silently "succeed" against the wrong (empty) database.
const isLocal = /^mongodb:\/\/(127\.0\.0\.1|localhost)/.test(uri);
if (isLocal && confirmed) {
  console.error("Refusing to delete with --confirm against a local MongoDB. Set MONGODB_URI to the real cluster.");
  process.exit(1);
}

async function main(): Promise<void> {
  const driver = new MongoClient(uri);
  await driver.connect();
  const db = driver.db(dbName);

  // No transactions in this script: it is a one-off maintenance run, and the
  // Atlas tier may refuse them anyway.
  const prisma = createMongoClient(db, {
    connect: async () => undefined,
    close: async () => undefined,
    startSession: () => {
      throw new Error("transactions are not used by this script");
    },
  });

  async function candidates() {
    if (ids.length > 0) {
      const found = [];
      for (const id of ids) {
        const server = await prisma.server.findUnique({ where: { id }, select: { id: true, name: true } });
        if (server) found.push(server);
        else console.warn(`  ! no server with id ${id}`);
      }
      return found;
    }

    const where = matchPattern ? { name: { contains: matchPattern, mode: "insensitive" as const } } : undefined;
    return (await prisma.server.findMany({
      where,
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    })) as Array<{ id: string; name: string }>;
  }

  const targets = await candidates();

  if (targets.length === 0) {
    console.log("Nothing matched. Nothing deleted.");
    await driver.close();
    process.exit(0);
  }

  console.log(`\nDatabase: ${dbName} at ${uri.replace(/\/\/([^:]+):([^@]+)@/, "//$1:***@")}`);
  console.log(`About to consider ${targets.length} server(s):\n`);
  for (const server of targets) {
    const [channels, members, invites, categories] = await Promise.all([
      db.collection("channels").countDocuments({ serverId: server.id }),
      db.collection("members").countDocuments({ serverId: server.id }),
      db.collection("invites").countDocuments({ serverId: server.id }),
      db.collection("categories").countDocuments({ serverId: server.id }),
    ]);
    console.log(`  ${server.id}  "${server.name}"  channels=${channels} members=${members} invites=${invites} categories=${categories}`);
  }

  if (!confirmed) {
    console.log("\nDry run. Re-run with --confirm to actually delete the servers listed above.");
    await driver.close();
    process.exit(0);
  }

  console.log("");
  for (const server of targets) {
    await prisma.server.delete({ where: { id: server.id } });
    console.log(`  deleted ${server.id} "${server.name}"`);
  }

  // Show what is left, so a surprising cascade is visible immediately.
  console.log("\nRemaining servers:");
  const remaining = await db.collection("servers").find({}, { projection: { name: 1, _id: 1 } }).toArray();
  if (remaining.length === 0) {
    console.log("  (none)");
  } else {
    for (const server of remaining) console.log(`  ${server._id}  "${server.name}"`);
  }

  // The relations the registry knows about, so an orphaned document is obvious.
  console.log("\nRow counts:");
  for (const model of Object.values(MODELS)) {
    const count = await db.collection(model.collection).countDocuments();
    if (count > 0) console.log(`  ${model.collection}: ${count}`);
  }

  await driver.close();

}

void main();
