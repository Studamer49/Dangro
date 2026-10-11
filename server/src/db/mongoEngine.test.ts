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

describe("filters on the primary key", () => {
  it("excludes the caller from a findMany filtered on `id: { not }`", async () => {
    // Prisma exposes the primary key as `id`; the document stores it in `_id`.
    // Filtering on `id` matched nothing, and `id: { not: X }` matched
    // *everything* — because $ne also matches documents where the field is
    // absent. The route that depends on this is `GET /api/users/search`, which
    // returned the caller in their own results, and `PATCH /api/users/me`,
    // which answered 409 "Username already taken" for the caller's own
    // username.
    const { prisma } = client();
    await prisma.server.create({ data: { id: "s-mine", name: "Mine", ownerId: "u1", inviteCode: "aaaa1111" } });
    await prisma.server.create({ data: { id: "s-other", name: "Other", ownerId: "u2", inviteCode: "bbbb2222" } });

    const found = (await prisma.server.findMany({
      where: { id: { not: "s-mine" } },
      select: { id: true },
    })) as Array<{ id: string }>;

    expect(found.map((s) => s.id)).toEqual(["s-other"]);
  });

  it("matches a document when filtering on `id: { equals }`", async () => {
    const { prisma } = client();
    await prisma.server.create({ data: { id: "s-mine", name: "Mine", ownerId: "u1", inviteCode: "aaaa1111" } });
    await prisma.server.create({ data: { id: "s-other", name: "Other", ownerId: "u2", inviteCode: "bbbb2222" } });

    const found = (await prisma.server.findMany({
      where: { id: { equals: "s-other" } },
      select: { id: true },
    })) as Array<{ id: string }>;

    expect(found.map((s) => s.id)).toEqual(["s-other"]);
  });

  it("counts rows with an id filter rather than counting the whole collection", async () => {
    const { prisma } = client();
    await prisma.server.create({ data: { id: "s1", name: "One", ownerId: "u1", inviteCode: "aaaa1111" } });
    await prisma.server.create({ data: { id: "s2", name: "Two", ownerId: "u2", inviteCode: "bbbb2222" } });

    expect(await prisma.server.count({ where: { id: "s1" } })).toBe(1);
    expect(await prisma.server.count({ where: { id: { not: "s1" } } })).toBe(1);
  });

  it("combines an id filter with the rest of the where clause", async () => {
    const { prisma } = client();
    await prisma.server.create({ data: { name: "Alpha", ownerId: "u1", inviteCode: "aaaa1111" } });
    await prisma.server.create({ data: { name: "Alpha2", ownerId: "u2", inviteCode: "bbbb2222" } });

    const found = (await prisma.server.findMany({
      where: { name: { startsWith: "Alpha" }, id: { not: "s-mine" } },
      select: { name: true },
    })) as Array<{ name: string }>;

    expect(found).toHaveLength(2);
  });
});

describe("nested relation filters", () => {
  it("keeps the parent restriction when the nested where names the back key", async () => {
    // The has-many filter is `{ serverId: { $in: [...parents] } }` and
    // `buildFilter` returns a *top-level* fragment, so Object.assign replaced
    // the parent clause whenever the nested where named the same key — the
    // children of a server that is not even on the page came back.
    const { prisma } = client();
    await prisma.server.create({ data: { id: "s-mine", name: "Mine", ownerId: "u1", inviteCode: "aaaa1111" } });

    await prisma.member.create({ data: { userId: "u1", serverId: "s-mine", role: "owner" } });
    await prisma.member.create({ data: { userId: "u1", serverId: "s-other", role: "owner" } });

    const [shaped] = (await prisma.server.findMany({
      where: { id: "s-mine" },
      select: { id: true },
      include: { members: { where: { serverId: "s-other" }, select: { userId: true } } },
    })) as Array<{ id: string; members: Array<{ userId: string }> }>;

    expect(shaped.id).toBe("s-mine");
    // `s-other` matches the nested where but is not this server, so nothing
    // should come back.
    expect(shaped.members).toEqual([]);
  });

  it("still applies a nested where that names an unrelated field", async () => {
    const { prisma } = client();
    await prisma.server.create({ data: { id: "s1", name: "One", ownerId: "u1", inviteCode: "aaaa1111" } });
    await prisma.member.create({ data: { userId: "u1", serverId: "s1", role: "owner" } });
    await prisma.member.create({ data: { userId: "u2", serverId: "s1", role: "member" } });

    const [shaped] = (await prisma.server.findMany({
      where: { id: "s1" },
      select: { id: true },
      include: { members: { where: { role: "owner" }, select: { userId: true } } },
    })) as Array<{ members: Array<{ userId: string }> }>;

    expect(shaped.members).toEqual([{ userId: "u1" }]);
  });

  it("ANDs a multi-key nested where without dropping either clause", async () => {
    const { prisma } = client();
    await prisma.server.create({ data: { id: "s1", name: "One", ownerId: "u1", inviteCode: "aaaa1111" } });
    await prisma.member.create({ data: { userId: "u1", serverId: "s1", role: "owner" } });
    await prisma.member.create({ data: { userId: "u2", serverId: "s1", role: "owner" } });
    await prisma.member.create({ data: { userId: "u1", serverId: "s1", role: "member" } });

    const [shaped] = (await prisma.server.findMany({
      where: { id: "s1" },
      select: { id: true },
      include: { members: { where: { role: "owner", userId: "u1" }, select: { userId: true } } },
    })) as Array<{ members: Array<{ userId: string }> }>;

    expect(shaped.members).toEqual([{ userId: "u1" }]);
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