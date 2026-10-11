import { describe, expect, it } from "vitest";
import { fakeDb, rows } from "./fakeDb.js";
import { createMongoClient, type MongoDelegate } from "./mongoClient.js";

/**
 * The MongoDB registry has to describe the new server models, because the
 * deployed service runs on MongoDB and a route that reaches for `prisma.invite`
 * or `prisma.category` gets `undefined` if the model is missing — a crash at
 * runtime that TypeScript cannot see.
 */

type TestPrisma = {
  invite: MongoDelegate;
  category: MongoDelegate;
  channel: MongoDelegate;
  member: MongoDelegate;
  server: MongoDelegate;
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
  return { prisma: createMongoClient(fakedb.db as never, driver) as unknown as TestPrisma, fakedb };
}

describe("invite model", () => {
  it("round-trips an invite with its optional fields", async () => {
    const { prisma } = client();

    await prisma.server.create({ data: { id: "s1", name: "Server", ownerId: "u1", inviteCode: "abc" } });

    const invite = (await prisma.invite.create({
      data: { code: "xyz789", serverId: "s1", inviterId: "u1", maxUses: 5, expiresAt: new Date("2027-01-01") },
      select: { id: true, code: true, maxUses: true, uses: true, channelId: true },
    })) as { code: string; maxUses: number; uses: number; channelId: string | null };

    expect(invite.code).toBe("xyz789");
    expect(invite.maxUses).toBe(5);
    // Defaults applied: a brand new invite has been used zero times.
    expect(invite.uses).toBe(0);
    expect(invite.channelId).toBeNull();
  });

  it("looks an invite up by its unique code", async () => {
    const { prisma } = client();
    await prisma.server.create({ data: { id: "s1", name: "Server", ownerId: "u1", inviteCode: "abc" } });
    await prisma.invite.create({ data: { code: "joinme", serverId: "s1", inviterId: "u1" } });

    const found = (await prisma.invite.findUnique({
      where: { code: "joinme" },
      select: { serverId: true },
    })) as { serverId: string } | null;

    expect(found?.serverId).toBe("s1");
  });

  it("increments the use counter", async () => {
    const { prisma, fakedb } = client();
    await prisma.server.create({ data: { id: "s1", name: "Server", ownerId: "u1", inviteCode: "abc" } });
    await prisma.invite.create({ data: { id: "i1", code: "joinme", serverId: "s1", inviterId: "u1" } });

    await prisma.invite.update({ where: { id: "i1" }, data: { uses: 1 } });

    expect(rows(fakedb, "invites")[0].uses).toBe(1);
  });

  it("lists a server's invites newest first", async () => {
    const { prisma } = client();
    await prisma.server.create({ data: { id: "s1", name: "Server", ownerId: "u1", inviteCode: "abc" } });
    await prisma.invite.create({
      data: { code: "old", serverId: "s1", inviterId: "u1", createdAt: new Date("2026-01-01") },
    });
    await prisma.invite.create({
      data: { code: "new", serverId: "s1", inviterId: "u1", createdAt: new Date("2026-06-01") },
    });
    await prisma.invite.create({
      data: { code: "other", serverId: "s2", inviterId: "u1", createdAt: new Date("2026-07-01") },
    });

    const invites = (await prisma.invite.findMany({
      where: { serverId: "s1" },
      select: { code: true },
    })) as Array<{ code: string }>;

    expect(invites.map((i) => i.code)).toEqual(["new", "old"]);
  });

  it("cascades invites when their server is deleted", async () => {
    const { prisma, fakedb } = client();
    await prisma.server.create({ data: { id: "s1", name: "Server", ownerId: "u1", inviteCode: "abc" } });
    await prisma.invite.create({ data: { code: "joinme", serverId: "s1", inviterId: "u1" } });

    await prisma.server.delete({ where: { id: "s1" } });

    expect(rows(fakedb, "invites")).toHaveLength(0);
  });

  it("cascades invites when their channel is deleted", async () => {
    const { prisma, fakedb } = client();
    await prisma.server.create({ data: { id: "s1", name: "Server", ownerId: "u1", inviteCode: "abc" } });
    await prisma.channel.create({ data: { id: "c1", name: "general", serverId: "s1" } });
    await prisma.invite.create({ data: { code: "joinme", serverId: "s1", channelId: "c1", inviterId: "u1" } });

    await prisma.channel.delete({ where: { id: "c1" } });

    expect(rows(fakedb, "invites")).toHaveLength(0);
  });
});

describe("category model", () => {
  it("round-trips a category with its default position", async () => {
    const { prisma } = client();
    await prisma.server.create({ data: { id: "s1", name: "Server", ownerId: "u1", inviteCode: "abc" } });

    const category = (await prisma.category.create({
      data: { name: "Text Channels", serverId: "s1" },
      select: { name: true, position: true },
    })) as { name: string; position: number };

    expect(category.name).toBe("Text Channels");
    expect(category.position).toBe(0);
  });

  it("lists categories in position order", async () => {
    const { prisma } = client();
    await prisma.server.create({ data: { id: "s1", name: "Server", ownerId: "u1", inviteCode: "abc" } });
    await prisma.category.create({ data: { name: "Second", serverId: "s1", position: 1 } });
    await prisma.category.create({ data: { name: "First", serverId: "s1", position: 0 } });

    const categories = (await prisma.category.findMany({
      where: { serverId: "s1" },
      select: { name: true },
    })) as Array<{ name: string }>;

    expect(categories.map((c) => c.name)).toEqual(["First", "Second"]);
  });

  it("deleting a category keeps its channels and only clears the link", async () => {
    // schema.prisma declares Category.channels onDelete: SetNull, so a deleted
    // folder must not take its channels with it.
    const { prisma, fakedb } = client();
    await prisma.server.create({ data: { id: "s1", name: "Server", ownerId: "u1", inviteCode: "abc" } });
    const category = (await prisma.category.create({
      data: { id: "cat1", name: "Text", serverId: "s1" },
      select: { id: true },
    })) as { id: string };
    await prisma.channel.create({ data: { id: "c1", name: "general", serverId: "s1", categoryId: category.id } });

    await prisma.category.delete({ where: { id: category.id } });

    expect(rows(fakedb, "categories")).toHaveLength(0);
    expect(rows(fakedb, "channels")).toHaveLength(1);
    expect(rows(fakedb, "channels")[0].categoryId).toBeNull();
  });

  it("cascades categories when their server is deleted", async () => {
    const { prisma, fakedb } = client();
    await prisma.server.create({ data: { id: "s1", name: "Server", ownerId: "u1", inviteCode: "abc" } });
    await prisma.category.create({ data: { name: "Text", serverId: "s1" } });

    await prisma.server.delete({ where: { id: "s1" } });

    expect(rows(fakedb, "categories")).toHaveLength(0);
  });
});

describe("channel ordering and topic", () => {
  it("stores a topic and a position, and orders by position", async () => {
    const { prisma } = client();
    await prisma.server.create({ data: { id: "s1", name: "Server", ownerId: "u1", inviteCode: "abc" } });
    await prisma.channel.create({
      data: { name: "random", serverId: "s1", position: 1, topic: "Anything goes" },
    });
    await prisma.channel.create({ data: { name: "general", serverId: "s1", position: 0 } });

    const channels = (await prisma.channel.findMany({
      where: { serverId: "s1" },
      select: { name: true, topic: true },
    })) as Array<{ name: string; topic: string | null }>;

    expect(channels.map((c) => c.name)).toEqual(["general", "random"]);
    expect(channels[1].topic).toBe("Anything goes");
  });

  it("moves a channel into a category", async () => {
    const { prisma, fakedb } = client();
    await prisma.server.create({ data: { id: "s1", name: "Server", ownerId: "u1", inviteCode: "abc" } });
    const category = (await prisma.category.create({
      data: { name: "Voice", serverId: "s1" },
      select: { id: true },
    })) as { id: string };
    const channel = (await prisma.channel.create({
      data: { id: "c1", name: "Lounge", type: "voice", serverId: "s1" },
      select: { id: true },
    })) as { id: string };

    await prisma.channel.update({ where: { id: channel.id }, data: { categoryId: category.id } });

    expect(rows(fakedb, "channels")[0].categoryId).toBe(category.id);
  });

  it("resolves a channel's category through the relation", async () => {
    const { prisma } = client();
    await prisma.server.create({ data: { id: "s1", name: "Server", ownerId: "u1", inviteCode: "abc" } });
    const category = (await prisma.category.create({
      data: { id: "cat1", name: "Text Channels", serverId: "s1" },
      select: { id: true },
    })) as { id: string };
    await prisma.channel.create({ data: { id: "c1", name: "general", serverId: "s1", categoryId: category.id } });

    const [channel] = (await prisma.channel.findMany({
      where: { serverId: "s1" },
      include: { category: { select: { id: true, name: true } } },
    })) as Array<{ id: string; category: { name: string } | null }>;

    expect(channel.category?.name).toBe("Text Channels");
  });
});

describe("member nickname", () => {
  it("stores a per-server nickname", async () => {
    const { prisma } = client();
    const member = (await prisma.member.create({
      data: { userId: "u1", serverId: "s1", nickname: "Ada" },
      select: { nickname: true, role: true },
    })) as { nickname: string | null; role: string };

    expect(member.nickname).toBe("Ada");
    expect(member.role).toBe("member");
  });
});
