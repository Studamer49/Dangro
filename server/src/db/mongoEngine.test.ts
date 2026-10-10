import { describe, expect, it } from "vitest";
import { fakeDb, rows } from "./fakeDb.js";
import { createMongoClient, type MongoDelegate } from "./mongoClient.js";

/**
 * Tests for Prisma-shaped semantics the Mongo engine has to reproduce.
 *
 * These are all cases where the engine and Prisma agreed by accident rather
 * than by construction, so a change to one side would silently diverge.
 */

type TestPrisma = {
  member: MongoDelegate;
  server: MongoDelegate;
  notification: MongoDelegate;
};

function client() {
  const fakedb = fakeDb();
  const driver = {
    connect: async () => undefined,
    close: async () => undefined,
    startSession: () => {
      throw new Error("no transactions in this fake");
    },
  };
  const prisma = createMongoClient(fakedb.db as never, driver) as unknown as TestPrisma;
  return { prisma, fakedb };
}

const at = (iso: string) => new Date(iso);

async function member(prisma: TestPrisma, serverId: string, userId: string, joinedAt: string) {
  await prisma.member.create({ data: { userId, serverId, joinedAt } });
}

describe("default ordering", () => {
  it("uses the model's declared defaultOrder, not a hardcoded createdAt", async () => {
    const { prisma } = client();
    // Member is keyed on `joinedAt`, not `createdAt`, and declares
    // `{ joinedAt: "asc" }`.
    await member(prisma, "s1", "u-late", at("2026-03-01T00:00:00Z").toISOString());
    await member(prisma, "s1", "u-early", at("2026-01-01T00:00:00Z").toISOString());
    await member(prisma, "s1", "u-mid", at("2026-02-01T00:00:00Z").toISOString());

    const found = (await prisma.member.findMany()) as Array<{ userId: string }>;

    expect(found.map((m) => m.userId)).toEqual(["u-early", "u-mid", "u-late"]);
  });

  it("honours a descending defaultOrder", async () => {
    const { prisma } = client();
    await prisma.server.create({ data: { name: "old", ownerId: "u1", createdAt: at("2026-01-01T00:00:00Z") } });
    await prisma.server.create({ data: { name: "new", ownerId: "u1", createdAt: at("2026-06-01T00:00:00Z") } });

    // Server declares `{ createdAt: "desc" }`.
    const found = (await prisma.server.findMany()) as Array<{ name: string }>;

    expect(found.map((s) => s.name)).toEqual(["new", "old"]);
  });

  it("lets an explicit orderBy win", async () => {
    const { prisma } = client();
    await prisma.server.create({ data: { name: "old", ownerId: "u1", createdAt: at("2026-01-01T00:00:00Z") } });
    await prisma.server.create({ data: { name: "new", ownerId: "u1", createdAt: at("2026-06-01T00:00:00Z") } });

    const found = (await prisma.server.findMany({ orderBy: { createdAt: "asc" } })) as Array<{ name: string }>;

    expect(found.map((s) => s.name)).toEqual(["old", "new"]);
  });
});

describe("findUnique", () => {
  it("matches a single-field unique passed as a scalar", async () => {
    // Server.inviteCode is registered as a unique in mongoSchema, so the
    // compound branch used to claim it and index the string by field name,
    // producing `undefined`. Every lookup missed, which made
    // GET /api/servers/join/:inviteCode always 404 on MongoDB.
    const { prisma } = client();
    await prisma.server.create({ data: { name: "Joinable", ownerId: "u1", inviteCode: "abcd1234" } });

    const found = (await prisma.server.findUnique({ where: { inviteCode: "abcd1234" } })) as {
      name: string;
    } | null;

    expect(found?.name).toBe("Joinable");
  });

  it("returns null when the scalar unique does not match", async () => {
    const { prisma } = client();
    await prisma.server.create({ data: { name: "Joinable", ownerId: "u1", inviteCode: "abcd1234" } });

    expect(await prisma.server.findUnique({ where: { inviteCode: "nope" } })).toBeNull();
  });

  it("still resolves compound keys passed as an object", async () => {
    const { prisma } = client();
    await prisma.member.create({ data: { userId: "u1", serverId: "s1", role: "owner" } });

    const found = (await prisma.member.findUnique({
      where: { userId_serverId: { userId: "u1", serverId: "s1" } },
    })) as { role: string } | null;

    expect(found?.role).toBe("owner");
  });

  it("resolves an id lookup", async () => {
    const { prisma } = client();
    const created = (await prisma.server.create({
      data: { name: "By id", ownerId: "u1", inviteCode: "zzzz9999" },
    })) as { id: string };

    const found = (await prisma.server.findUnique({ where: { id: created.id } })) as { name: string } | null;

    expect(found?.name).toBe("By id");
  });

  it("still rejects a field that is not declared at all", async () => {
    // Guards against registry drift: an unknown key must fail loudly rather
    // than building a filter that can never match.
    const { prisma } = client();
    await expect(prisma.server.findUnique({ where: { nonsense: "x" } as never })).rejects.toThrow(
      /unique field/
    );
  });
});

describe("updateMany", () => {
  it("reports the number of matched rows, not the number changed", async () => {
    const { prisma } = client();
    await prisma.notification.create({ data: { userId: "u1", type: "friend_request", message: "a" } });
    await prisma.notification.create({ data: { userId: "u1", type: "friend_request", message: "b" } });

    const first = await prisma.notification.updateMany({
      where: { userId: "u1" },
      data: { readAt: at("2026-01-01T00:00:00Z") },
    });
    expect(first.count).toBe(2);

    // Writing the same value a row already holds modifies nothing, but Prisma
    // still counts it: `modifiedCount` would report 0 here.
    const second = await prisma.notification.updateMany({
      where: { userId: "u1" },
      data: { readAt: at("2026-01-01T00:00:00Z") },
    });
    expect(second.count).toBe(2);
  });

  it("counts nothing when the filter matches nothing", async () => {
    const { prisma } = client();
    const result = await prisma.notification.updateMany({
      where: { userId: "nobody" },
      data: { readAt: at("2026-01-01T00:00:00Z") },
    });
    expect(result.count).toBe(0);
  });
});

describe("upsert", () => {
  it("takes Prisma's separate create and update payloads", async () => {
    const { prisma, fakedb } = client();

    const created = (await prisma.server.upsert({
      where: { inviteCode: "abcd1234" },
      create: { name: "First", ownerId: "u1", inviteCode: "abcd1234" },
      update: { name: "Second" },
    })) as { id: string; name: string };

    expect(created.name).toBe("First");
    expect(rows(fakedb, "servers")).toHaveLength(1);

    const updated = (await prisma.server.upsert({
      where: { inviteCode: "abcd1234" },
      create: { name: "First", ownerId: "u1", inviteCode: "abcd1234" },
      update: { name: "Second" },
    })) as { id: string; name: string };

    expect(updated.name).toBe("Second");
    expect(updated.id).toBe(created.id);
    expect(rows(fakedb, "servers")).toHaveLength(1);
  });

  it("creates nested children on the insert path", async () => {
    const { prisma, fakedb } = client();

    await prisma.server.upsert({
      where: { inviteCode: "abcd1234" },
      create: {
        name: "With channel",
        ownerId: "u1",
        inviteCode: "abcd1234",
        channels: { create: [{ name: "general", type: "text" }] },
      },
      update: { name: "Renamed" },
    });

    expect(rows(fakedb, "channels")).toHaveLength(1);
  });
});