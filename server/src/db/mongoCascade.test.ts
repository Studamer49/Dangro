import { describe, expect, it } from "vitest";
import { fakeDb, rows } from "./fakeDb.js";
import { createMongoClient, type MongoDelegate } from "./mongoClient.js";

/**
 * Regression tests for cascade deletes.
 *
 * The bug this covers: `delete` and `deleteMany` removed exactly one
 * document. `schema.prisma` declares `onDelete: Cascade` on 32 relations,
 * and MongoDB enforces nothing on its own, so deleting a server left its
 * members and channels behind, deleting a message left its reactions and
 * attachments, and deleting a post left its media, likes and comments.
 *
 * The orphans were unreachable by any query — but a document with the same
 * id coming back would resurface them.
 */

type TestPrisma = {
  server: MongoDelegate;
  channel: MongoDelegate;
  message: MongoDelegate;
  reaction: MongoDelegate;
  post: MongoDelegate;
  postMedia: MongoDelegate;
  postLike: MongoDelegate;
  postComment: MongoDelegate;
  member: MongoDelegate;
  friendRequest: MongoDelegate;
  friend: MongoDelegate;
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

async function seedServer(prisma: TestPrisma): Promise<{ serverId: string; channelId: string }> {
  const server = (await prisma.server.create({
    data: {
      name: "Test Server",
      ownerId: "user-1",
      inviteCode: "abcd1234",
      members: { create: [{ userId: "user-1", role: "owner" }] },
      channels: { create: [{ name: "general", type: "text" }] },
    },
  })) as { id: string };

  const created = (await prisma.channel.findMany({ where: { serverId: server.id } })) as Array<{ id: string }>;

  return { serverId: server.id, channelId: created[0].id };
}

describe("cascade delete", () => {
  it("removes a deleted server's members and channels", async () => {
    const { prisma, fakedb } = client();
    const { serverId } = await seedServer(prisma);

    await prisma.server.delete({ where: { id: serverId } });

    expect(rows(fakedb, "servers")).toHaveLength(0);
    expect(rows(fakedb, "members")).toHaveLength(0);
    expect(rows(fakedb, "channels")).toHaveLength(0);
  });

  it("follows the chain: server -> channel -> message -> reaction", async () => {
    const { prisma, fakedb } = client();
    const { serverId, channelId } = await seedServer(prisma);

    const message = (await prisma.message.create({
      data: { content: "hello", authorId: "user-1", channelId },
    })) as { id: string };

    await prisma.reaction.create({
      data: { emoji: "👍", userId: "user-1", messageId: message.id },
    });

    await prisma.server.delete({ where: { id: serverId } });

    expect(rows(fakedb, "messages")).toHaveLength(0);
    expect(rows(fakedb, "reactions")).toHaveLength(0);
  });

  it("removes a deleted post's media, likes and comments", async () => {
    const { prisma, fakedb } = client();

    await prisma.post.create({
      data: {
        authorId: "user-1",
        caption: "hi",
        media: { create: [{ url: "/uploads/a.png", type: "image", order: 0 }] },
      },
    });

    expect(rows(fakedb, "post_media")).toHaveLength(1);

    const post = rows(fakedb, "posts")[0];
    await prisma.postLike.create({ data: { postId: post._id, userId: "user-2" } });
    await prisma.postComment.create({ data: { postId: post._id, authorId: "user-2", content: "nice" } });

    await prisma.post.delete({ where: { id: post._id } });

    expect(rows(fakedb, "posts")).toHaveLength(0);
    expect(rows(fakedb, "post_media")).toHaveLength(0);
    expect(rows(fakedb, "post_likes")).toHaveLength(0);
    expect(rows(fakedb, "post_comments")).toHaveLength(0);
  });

  it("leaves unrelated rows alone", async () => {
    const { prisma, fakedb } = client();
    const { serverId } = await seedServer(prisma);
    await prisma.friend.create({ data: { userId: "user-1", friendId: "user-9" } });

    await prisma.server.delete({ where: { id: serverId } });

    expect(rows(fakedb, "friends")).toHaveLength(1);
    expect(rows(fakedb, "follows")).toHaveLength(0);
  });

  it("cascades through deleteMany as well", async () => {
    const { prisma, fakedb } = client();
    await seedServer(prisma);
    await prisma.friendRequest.create({ data: { senderId: "user-1", receiverId: "user-2" } });

    await prisma.server.deleteMany({});

    expect(rows(fakedb, "members")).toHaveLength(0);
    expect(rows(fakedb, "channels")).toHaveLength(0);
    expect(rows(fakedb, "friend_requests")).toHaveLength(1);
  });

  it("does not cascade when nothing matched", async () => {
    const { prisma, fakedb } = client();
    await seedServer(prisma);

    const result = await prisma.server.deleteMany({ where: { inviteCode: "nomatch" } });

    expect(result.count).toBe(0);
    expect(rows(fakedb, "members")).toHaveLength(1);
  });
});