import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

/**
 * Regression tests for the DM list's unread counts.
 *
 * The bug this covers: the count was guarded by "is the newest message
 * unread?". Reply to a thread you have never opened and the newest message is
 * your own, so the guard reported 0 however many messages were still
 * waiting — the badge silently under-counted until the thread was opened.
 *
 * The count query itself ran once per conversation, which the client repeats
 * every 20 seconds; this now runs once for the whole list.
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
  user: MongoDelegate;
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

async function seedConversation(prisma: TestPrisma): Promise<string> {
  const conversation = (await prisma.conversation.create({
    data: { user1Id: ME, user2Id: THEM, lastMessageAt: new Date("2026-01-01T00:00:00Z") },
  })) as { id: string };

  // Three unread messages from them, then my reply.
  for (let i = 0; i < 3; i += 1) {
    await prisma.directMessage.create({
      data: {
        conversationId: conversation.id,
        senderId: THEM,
        content: `theirs ${i}`,
        createdAt: new Date(`2026-01-0${i + 1}T00:00:00Z`),
      },
    });
  }
  await prisma.directMessage.create({
    data: {
      conversationId: conversation.id,
      senderId: ME,
      content: "my reply",
      createdAt: new Date("2026-01-05T00:00:00Z"),
    },
  });

  return conversation.id;
}

async function listDms() {
  const token = jwt.sign({ userId: ME }, config.jwtSecret);
  const res = await request(app)
    .get("/api/dms")
    .set("Authorization", `Bearer ${token}`);

  expect(res.status).toBe(200);
  return res.body.data.conversations as Array<{ id: string; unreadCount: number }>;
}

describe("GET /api/dms unread counts", () => {
  it("counts older unread messages even when the newest one is mine", async () => {
    const prisma = prismaMock.current as TestPrisma;
    await seedConversation(prisma);

    const conversations = await listDms();

    expect(conversations).toHaveLength(1);
    expect(conversations[0].unreadCount).toBe(3);
  });

  it("reports 0 when everything has been read", async () => {
    const prisma = prismaMock.current as TestPrisma;
    const conversationId = await seedConversation(prisma);

    await prisma.directMessage.updateMany({
      where: { conversationId, senderId: { not: ME } },
      data: { readAt: new Date() },
    });

    const conversations = await listDms();
    expect(conversations[0].unreadCount).toBe(0);
  });

  it("does not count the viewer's own messages", async () => {
    const prisma = prismaMock.current as TestPrisma;
    await seedConversation(prisma);

    const conversations = await listDms();
    // 4 messages exist; the one from ME is excluded.
    expect(conversations[0].unreadCount).not.toBe(4);
  });

  it("reports 0 for a conversation with no messages at all", async () => {
    const prisma = prismaMock.current as TestPrisma;
    await prisma.conversation.create({
      data: { user1Id: ME, user2Id: THEM, lastMessageAt: new Date("2026-01-01T00:00:00Z") },
    });

    const conversations = await listDms();
    expect(conversations[0].unreadCount).toBe(0);
  });
});