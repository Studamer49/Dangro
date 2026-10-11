import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createMongoClient, type MongoDelegate } from "../db/mongoClient.js";
import { fakeDb, rows } from "../db/fakeDb.js";

/**
 * DM attachment metadata persistence and asset deletion.
 *
 * Covers the parts of the Cloudinary integration that live on the message
 * side: the public ID survives a round trip, messages without attachments are
 * untouched, and deletion removes the asset only after the existing
 * authorisation checks have passed.
 */

const destroyMock = vi.hoisted(() => vi.fn());
const configMock = vi.hoisted(() => vi.fn());

vi.mock("cloudinary", () => ({
  default: {},
  v2: {
    config: configMock,
    uploader: { upload: vi.fn(), destroy: destroyMock },
  },
}));

const prismaMock = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("../prisma.js", () => ({
  get prisma() {
    return prismaMock.current;
  },
  get mongoClient() {
    return null;
  },
}));

const ME = "11111111-1111-4111-8111-111111111111";
const THEM = "22222222-2222-4222-8222-222222222222";
const CONV = "33333333-3333-4333-8333-333333333333";
const PUBLIC_ID = "dangro/44444444-4444-4444-4444-444444444444";

type TestPrisma = {
  user: MongoDelegate;
  conversation: MongoDelegate;
  directMessage: MongoDelegate;
};

let app: typeof import("../index.js").app;
let config: typeof import("../config.js").config;
let db: ReturnType<typeof fakeDb>;
/** Typed view of the hoisted mock holder, so the seeding helpers typecheck. */
let prisma: TestPrisma;

const auth = () => ({ Authorization: `Bearer ${jwt.sign({ userId: ME }, config.jwtSecret)}` });

beforeEach(async () => {
  destroyMock.mockReset();
  destroyMock.mockResolvedValue({ result: "ok" });

  vi.resetModules();
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "x".repeat(40);
  process.env.DATABASE_PROVIDER = "mongo";
  process.env.MONGODB_URI = "mongodb://127.0.0.1:27017";
  process.env.MONGODB_DB_NAME = "dangro-test";
  process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
  process.env.CLOUDINARY_API_KEY = "123456789012345";
  process.env.CLOUDINARY_API_SECRET = "secret-value-for-tests-only";

  db = fakeDb();
  const driver = {
    connect: async () => undefined,
    close: async () => undefined,
    startSession: () => {
      throw new Error("no transactions in this fake");
    },
  };
  prismaMock.current = prisma = createMongoClient(db.db as never, driver) as unknown as TestPrisma;

  const mod = await import("../index.js");
  app = mod.app;
  config = (await import("../config.js")).config;

  await prisma.user.create({
    data: { id: ME, username: "me", email: "me@example.com", passwordHash: "x" },
  });
  await prisma.user.create({
    data: { id: THEM, username: "them", email: "them@example.com", passwordHash: "x" },
  });
  await prisma.conversation.create({
    data: { id: CONV, user1Id: ME, user2Id: THEM, status: "active" },
  });
});

const dmDocs = () => rows(db, "direct_messages") as Array<Record<string, unknown>>;

describe("storing attachment metadata", () => {
  it("persists the public id alongside the delivery URL", async () => {
    const res = await request(app)
      .post(`/api/dms/${CONV}`)
      .set(auth())
      .send({
        content: "a photo",
        attachmentUrl: `https://res.cloudinary.com/test-cloud/image/upload/dangro/abc.png`,
        attachmentType: "image",
        attachmentPublicId: PUBLIC_ID,
      });

    expect(res.status).toBe(201);

    const stored = dmDocs().at(-1)!;
    expect(stored.attachmentPublicId).toBe(PUBLIC_ID);
    expect(stored.attachmentUrl).toContain("res.cloudinary.com");
  });

  it("stores no image bytes or base64 in the database", async () => {
    await request(app)
      .post(`/api/dms/${CONV}`)
      .set(auth())
      .send({
        content: "a photo",
        attachmentUrl: "https://res.cloudinary.com/test-cloud/image/upload/dangro/abc.png",
        attachmentType: "image",
        attachmentPublicId: PUBLIC_ID,
      });

    const serialised = JSON.stringify(dmDocs());
    expect(serialised).not.toContain("base64");
    expect(serialised).not.toContain("data:image");
    expect(serialised.length).toBeLessThan(2000); // metadata only
  });

  it("rejects a malformed public id", async () => {
    const res = await request(app)
      .post(`/api/dms/${CONV}`)
      .set(auth())
      .send({
        content: "x",
        attachmentUrl: "https://res.cloudinary.com/test-cloud/image/upload/dangro/abc.png",
        attachmentPublicId: "../../etc/passwd",
      });

    expect(res.status).toBe(400);
  });

  it("keeps messages with no attachment working exactly as before", async () => {
    const res = await request(app)
      .post(`/api/dms/${CONV}`)
      .set(auth())
      .send({ content: "plain text" });

    expect(res.status).toBe(201);
    const stored = dmDocs().at(-1)!;
    expect(stored.content).toBe("plain text");
    expect(stored.attachmentUrl ?? null).toBeNull();
    expect(stored.attachmentPublicId ?? null).toBeNull();
  });
});

describe("deleting a message removes its Cloudinary asset", () => {
  async function seedImageMessage(senderId: string) {
    await prisma.directMessage.create({
      data: {
        id: "55555555-5555-4555-8555-555555555555",
        content: "a photo",
        senderId,
        conversationId: CONV,
        attachmentUrl: "https://res.cloudinary.com/test-cloud/image/upload/dangro/abc.png",
        attachmentType: "image",
        attachmentPublicId: PUBLIC_ID,
      },
    });
    return "55555555-5555-4555-8555-555555555555";
  }

  it("destroys the asset by public id after the message is deleted", async () => {
    const id = await seedImageMessage(ME);

    const res = await request(app).delete(`/api/dms/${id}`).set(auth());

    expect(res.status).toBe(200);
    expect(destroyMock).toHaveBeenCalledTimes(1);
    expect(destroyMock.mock.calls[0][0]).toBe(PUBLIC_ID);
    // Invalidate drops the cached derived images too.
    expect(destroyMock.mock.calls[0][1]).toMatchObject({ invalidate: true, resource_type: "image" });
  });

  it("refuses to delete a message belonging to someone else", async () => {
    const id = await seedImageMessage(THEM);

    const res = await request(app).delete(`/api/dms/${id}`).set(auth());

    expect(res.status).toBe(403);
    // Authorisation runs before any external side effect.
    expect(destroyMock).not.toHaveBeenCalled();
    expect(dmDocs()).toHaveLength(1);
  });

  it("refuses an unauthenticated delete", async () => {
    const id = await seedImageMessage(ME);

    const res = await request(app).delete(`/api/dms/${id}`);

    expect(res.status).toBe(401);
    expect(destroyMock).not.toHaveBeenCalled();
  });

  it("does not destroy an asset another message still references", async () => {
    const id = await seedImageMessage(ME);
    await prisma.directMessage.create({
      data: {
        id: "66666666-6666-4666-8666-666666666666",
        content: "same asset",
        senderId: THEM,
        conversationId: CONV,
        attachmentUrl: "https://res.cloudinary.com/test-cloud/image/upload/dangro/abc.png",
        attachmentPublicId: PUBLIC_ID,
      },
    });

    const res = await request(app).delete(`/api/dms/${id}`).set(auth());

    expect(res.status).toBe(200);
    expect(destroyMock).not.toHaveBeenCalled();
  });

  it("still reports success when Cloudinary fails, and logs instead", async () => {
    const id = await seedImageMessage(ME);
    destroyMock.mockRejectedValue(new Error("cloudinary unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await request(app).delete(`/api/dms/${id}`).set(auth());

    // The row is already gone; failing the request would claim otherwise.
    expect(res.status).toBe(200);
    expect(dmDocs()).toHaveLength(0);
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it("never puts a credential in the log line", async () => {
    const id = await seedImageMessage(ME);
    destroyMock.mockRejectedValue(new Error("upstream rejected the api_secret"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await request(app).delete(`/api/dms/${id}`).set(auth());

    for (const call of consoleError.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(config.cloudinary.apiSecret);
    }
    consoleError.mockRestore();
  });

  it("leaves a message without an attachment alone", async () => {
    await prisma.directMessage.create({
      data: {
        id: "77777777-7777-4777-8777-777777777777",
        content: "text only",
        senderId: ME,
        conversationId: CONV,
      },
    });

    const res = await request(app).delete("/api/dms/77777777-7777-4777-8777-777777777777").set(auth());

    expect(res.status).toBe(200);
    expect(destroyMock).not.toHaveBeenCalled();
  });
});