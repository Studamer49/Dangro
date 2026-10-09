import { PrismaClient } from "@prisma/client";
import { MongoClient } from "mongodb";
import { config } from "./config.js";
import { createMongoClient } from "./db/mongoClient.js";

/**
 * The application's single database client.
 *
 * Both backends expose the same Prisma-shaped surface:
 *   DATABASE_PROVIDER=postgres -> @prisma/client against Neon/Postgres
 *   DATABASE_PROVIDER=mongo    -> src/db against MongoDB (media via GridFS)
 *
 * Routes import `prisma` from here and are unaware of which one is running.
 * The MongoDB client is exported as `mongoClient` so the media store can
 * reach the same connection for GridFS.
 */

const globalForDb = globalThis as unknown as {
  prisma: PrismaClient;
  mongoClient?: MongoClient;
};

export const mongoClient: MongoClient | null = config.usesMongo
  ? (globalForDb.mongoClient ?? new MongoClient(config.mongoUri))
  : null;

let prisma: PrismaClient;

if (config.usesMongo) {
  const client = mongoClient as MongoClient;
  // The driver connects lazily on first use; this surfaces an unreachable
  // MongoDB immediately instead of on the first request.
  void client.connect().catch((err) => {
    console.error("[db] could not connect to MongoDB:", err instanceof Error ? err.message : err);
  });
  prisma = createMongoClient(client.db(config.mongoDbName), {
    connect: async () => {
      await client.connect();
    },
    close: async () => {
      await client.close();
    },
  }) as unknown as PrismaClient;
} else {
  prisma = globalForDb.prisma || new PrismaClient();
}

export { prisma };

if (process.env.NODE_ENV !== "production") {
  globalForDb.prisma = prisma;
  if (mongoClient) globalForDb.mongoClient = mongoClient;
}