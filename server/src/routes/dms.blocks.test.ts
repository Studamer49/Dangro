import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

/**
 * A block is documented as a wall: "once it exists neither party may start or
 * continue a thread" (routes/dms.ts).
 *
 * Only the two write paths honoured that. `GET /api/dms/:conversationId` read
 * the whole history, the edit/delete/reaction routes operated on it, and the
 * conversation list carried the most recent message — so blocking someone hid
 * new messages while leaving everything already said, and the newest line of
 * it, readable. These run against the real Mongo query shim over an in-memory
 * fake, so the `block` lookup and the `OR` filter are exercised for real.
 */

const prismaMock = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("../prisma.js", () => ({
  get prisma() {
    return prismaMock.current;
  },
  get mongoClient() {
    return null;
  },
}));

import { createMongoClient, type MongoDelegate } from "../db/mongoClient.js";
import { fakeDb } from "../db/fakeDb.js";
import { config } from "../config.js";

type TestPrisma = {
  conversation: MongoDelegate;
  directMessage: MongoDelegate;
  directReaction: MongoDelegate;
  user: MongoDelegate;
  block: MongoDelegate;
};

const ME = "11111111-1111-4111-8111-111111111111";
const THEM = "22222222-2222-4222-8222-222222222222";

let app: typeof import("../index.js").app;

beforeEach(async () => {
  const fakedb = fakeDb();
  const driver = {
    connect: async () => undefined,
    close: async () => undefined,
    startSession: () => {
      throw new Error("no transactions in this fake");
    },
  };
  prismaMock.current = createMongoClient(fakedb.db as never, driver) as unknown as TestPrisma;

  vi.resetModules();
  const mod = await import("../index.js");
  app = mod.app;
});

async function seedConversation(prisma: TestPrisma): Promise<{ id: string; messageId: string }> {
  const conversation = (await prisma.conversation.create({
    data: { user1Id: ME, user2Id: THEM, lastMessageAt: new Date("2026-01-01T00:00:00Z") },
  })) as { id: string };

  const message = (await prisma.directMessage.create({
    data: {
      conversationId: conversation.id,
      senderId: THEM,
      content: "a private thing",
      createdAt: new Date("2026-01-02T00:00:00Z"),
    },
  })) as { id: string };

  return { id: conversation.id, messageId: message.id };
}

function auth(userId: string) {
  return `Bearer ${jwt.sign({ userId }, config.jwtSecret)}`;
}

describe("DM block wall", () => {
  it("serves the conversation while nobody is blocked", async () => {
    const prisma = prismaMock.current as TestPrisma;
    const { id } = await seedConversation(prisma);

    const res = await request(app).get(`/api/dms/${id}`).set("Authorization", auth(ME));

    expect(res.status).toBe(200);
    expect(res.body.data.messages).toHaveLength(1);
  });

  it("refuses to hand the history back once a block exists", async () => {
    const prisma = prismaMock.current as TestPrisma;
    const { id } = await seedConversation(prisma);
    await prisma.block.create({ data: { userId: THEM, blockedId: ME } });

    const res = await request(app).get(`/api/dms/${id}`).set("Authorization", auth(ME));

    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain("a private thing");
  });

  it("hides the thread from the blocker too, not only from the blocked", async () => {
    const prisma = prismaMock.current as TestPrisma;
    const { id } = await seedConversation(prisma);
    await prisma.block.create({ data: { userId: ME, blockedId: THEM } });

    const res = await request(app).get(`/api/dms/${id}`).set("Authorization", auth(ME));

    expect(res.status).toBe(403);
  });

  it("hides the thread from the conversation list, so the preview cannot leak it", async () => {
    const prisma = prismaMock.current as TestPrisma;
    await seedConversation(prisma);
    await prisma.block.create({ data: { userId: THEM, blockedId: ME } });

    const res = await request(app).get("/api/dms").set("Authorization", auth(ME));

    expect(res.status).toBe(200);
    expect(res.body.data.conversations).toHaveLength(0);
    expect(JSON.stringify(res.body)).not.toContain("a private thing");
  });

  it("still lists the thread once the block is lifted", async () => {
    const prisma = prismaMock.current as TestPrisma;
    const block = (await prisma.block.create({
      data: { userId: THEM, blockedId: ME },
    })) as { id: string };
    await seedConversation(prisma);

    const blocked = await request(app).get("/api/dms").set("Authorization", auth(ME));
    expect(blocked.body.data.conversations).toHaveLength(0);

    await prisma.block.delete({ where: { id: block.id } });

    const after = await request(app).get("/api/dms").set("Authorization", auth(ME));
    expect(after.body.data.conversations).toHaveLength(1);
  });

  it("refuses an edit of a message in a blocked conversation", async () => {
    const prisma = prismaMock.current as TestPrisma;
    const { id: conversationId } = await seedConversation(prisma);
    const mine = (await prisma.directMessage.create({
      data: {
        conversationId,
        senderId: ME,
        content: "mine",
        createdAt: new Date("2026-01-03T00:00:00Z"),
      },
    })) as { id: string };
    await prisma.block.create({ data: { userId: THEM, blockedId: ME } });

    const res = await request(app)
      .patch(`/api/dms/${mine.id}`)
      .set("Authorization", auth(ME))
      .send({ content: "edited" });

    expect(res.status).toBe(403);
  });
});