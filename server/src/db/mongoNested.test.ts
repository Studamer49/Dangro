import { describe, expect, it } from "vitest";
import { fakeDb, rows } from "./fakeDb.js";
import { createMongoClient, type MongoDelegate } from "./mongoClient.js";

/** The engine's client surface, narrowed to the delegates these tests use. */
type TestPrisma = {
  server: MongoDelegate;
  post: MongoDelegate;
  story: MongoDelegate;
};

/**
 * Regression tests for nested relation writes.
 *
 * The bug this covers: `create` wrote every key of `data` straight onto the
 * document, so Prisma's nested syntax — `members: { create: {...} }` — was
 * stored as a literal embedded object and no Member or Channel row was ever
 * created. The response still *looked* right, because the relation loader
 * strips `members`/`channels` from the doc and fills them from their own
 * collections, which came back empty.
 *
 * The visible effect on MongoDB: `POST /api/servers` returned 201, but the
 * server had no membership row, so `GET /api/servers` — which filters on
 * `members: { some: { userId } }` — did not list it to anyone, including the
 * creator. `POST /api/posts` returned a post with zero media.
 */

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

describe("nested create writes", () => {
  it("creates the owner membership row when a server is created", async () => {
    const { prisma, fakedb } = client();

    await prisma.server.create({
      data: {
        name: "Test Server",
        ownerId: "user-1",
        inviteCode: "abcd1234",
        members: { create: { userId: "user-1", role: "owner" } },
        channels: { create: [{ name: "general", type: "text" }] },
      },
    });

    expect(rows(fakedb, "members")).toHaveLength(1);
    expect(rows(fakedb, "members")[0]).toMatchObject({ userId: "user-1", role: "owner" });
  });

  it("creates the default channel when a server is created", async () => {
    const { prisma, fakedb } = client();

    await prisma.server.create({
      data: {
        name: "Test Server",
        ownerId: "user-1",
        inviteCode: "abcd1234",
        members: { create: { userId: "user-1", role: "owner" } },
        channels: { create: [{ name: "general", type: "text" }] },
      },
    });

    expect(rows(fakedb, "channels")).toHaveLength(1);
    expect(rows(fakedb, "channels")[0]).toMatchObject({ name: "general", type: "text" });
  });

  it("stamps the parent's id onto every child row", async () => {
    const { prisma, fakedb } = client();

    const server = await prisma.server.create({
      data: {
        name: "Test Server",
        ownerId: "user-1",
        inviteCode: "abcd1234",
        members: { create: { userId: "user-1", role: "owner" } },
        channels: { create: [{ name: "general", type: "text" }] },
      },
    });

    expect(rows(fakedb, "channels")[0].serverId).toBe(server.id);
    expect(rows(fakedb, "members")[0].serverId).toBe(server.id);
  });

  it("creates one row per item for an array nested create", async () => {
    const { prisma, fakedb } = client();

    await prisma.post.create({
      data: {
        authorId: "user-1",
        caption: "hello",
        media: {
          create: [
            { url: "/uploads/a.png", type: "image", order: 0 },
            { url: "/uploads/b.mp4", type: "video", order: 1 },
          ],
        },
      },
    });

    expect(rows(fakedb, "post_media")).toHaveLength(2);
    expect(rows(fakedb, "post_media").map((m) => m.url)).toEqual(["/uploads/a.png", "/uploads/b.mp4"]);
  });

  it("applies the child model's defaults", async () => {
    const { prisma, fakedb } = client();

    await prisma.server.create({
      data: {
        name: "Test Server",
        ownerId: "user-1",
        inviteCode: "abcd1234",
        channels: { create: [{ name: "general" }] },
      },
    });

    expect(rows(fakedb, "channels")[0].type).toBe("text");
    expect(rows(fakedb, "channels")[0].createdAt).toBeInstanceOf(Date);
  });

  it("never embeds the nested spec onto the parent document", async () => {
    const { prisma, fakedb } = client();

    await prisma.server.create({
      data: {
        name: "Test Server",
        ownerId: "user-1",
        inviteCode: "abcd1234",
        members: { create: { userId: "user-1", role: "owner" } },
        channels: { create: [{ name: "general", type: "text" }] },
      },
    });

    const stored = rows(fakedb, "servers")[0];
    expect(stored.members).toBeUndefined();
    expect(stored.channels).toBeUndefined();
  });

  it("returns the created children through include", async () => {
    const { prisma } = client();

    const server = (await prisma.server.create({
      data: {
        name: "Test Server",
        ownerId: "user-1",
        inviteCode: "abcd1234",
        channels: { create: [{ name: "general", type: "text" }] },
      },
      include: { channels: true },
    })) as { channels: Array<{ name: string }> };

    expect(server.channels).toHaveLength(1);
    expect(server.channels[0].name).toBe("general");
  });

  it("leaves a create without nested writes untouched", async () => {
    const { prisma, fakedb } = client();

    await prisma.story.create({
      data: { authorId: "user-1", mediaUrl: "/uploads/a.png", mediaType: "image" },
    });

    expect(rows(fakedb, "stories")).toHaveLength(1);
    expect(rows(fakedb, "members")).toHaveLength(0);
  });
});