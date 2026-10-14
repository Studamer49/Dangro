import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createMongoClient, type MongoDelegate } from "../db/mongoClient.js";
import { fakeDb, rows } from "../db/fakeDb.js";

/**
 * The half of the Cloudinary integration that no mocked-SDK test could check:
 * what actually ends up in MongoDB.
 *
 * The upload route hands back a `secure_url`, and several routes accept a
 * client-supplied URL string in its place. This drives the real routes against
 * the real MongoDB query engine over an in-memory store, so it can assert the
 * document that is written rather than the HTTP response that describes it —
 * including the two failures that are invisible from the response alone:
 * a local spool path being stored as a permanent image URL, and a document
 * being written for an upload Cloudinary never accepted.
 */

const uploadMock = vi.hoisted(() => vi.fn());
const destroyMock = vi.hoisted(() => vi.fn());
const configMock = vi.hoisted(() => vi.fn());

vi.mock("cloudinary", () => ({
  default: {},
  v2: {
    config: configMock,
    api: { ping: vi.fn(async () => ({ status: "ok" })) },
    uploader: { upload: uploadMock, destroy: destroyMock },
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
const OTHER = "22222222-2222-4222-8222-222222222222";
const CLOUD = "dangro-test-cloud";

/** What Cloudinary answers with when it accepts an upload. */
const CLOUDINARY_RESULT = {
  public_id: "dangro/images/6d5ddb7f-3b49-4d10-add3-7c1fcef3e695",
  secure_url: `https://res.cloudinary.com/${CLOUD}/image/upload/c_limit,w_1920,f_auto,q_auto/dangro/images/6d5ddb7f-3b49-4d10-add3-7c1fcef3e695.png`,
  bytes: 68,
  format: "png",
  width: 1,
  height: 1,
};

type TestPrisma = {
  user: MongoDelegate;
  post: MongoDelegate;
  postMedia: MongoDelegate;
  story: MongoDelegate;
  directMessage: MongoDelegate;
  conversation: MongoDelegate;
};

let app: typeof import("../index.js").app;
let config: typeof import("../config.js").config;
let db: ReturnType<typeof fakeDb>;
let uploadDir: string;
/** Typed view of the hoisted mock holder, so the seeding helpers typecheck. */
let prisma: TestPrisma;

const auth = () => ({ Authorization: `Bearer ${jwt.sign({ userId: ME }, config.jwtSecret)}` });

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  ),
]);

/** Uploads a real PNG and returns the parsed response body. */
async function uploadImage() {
  const res = await request(app)
    .post("/api/uploads")
    .set(auth())
    .attach("file", PNG, { filename: "holiday.png", contentType: "image/png" });

  expect(res.status).toBe(201);
  return res.body.data as { url: string; publicId: string; width: number | null };
}

beforeEach(async () => {
  uploadMock.mockReset();
  destroyMock.mockReset();
  destroyMock.mockResolvedValue({ result: "ok" });
  configMock.mockReset();
  uploadMock.mockResolvedValue(CLOUDINARY_RESULT);

  vi.resetModules();
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "x".repeat(40);
  process.env.DATABASE_PROVIDER = "mongo";
  process.env.MONGODB_URI = "mongodb://127.0.0.1:27017";
  process.env.MONGODB_DB_NAME = "dangro-test";
  process.env.CLOUDINARY_CLOUD_NAME = CLOUD;
  process.env.CLOUDINARY_API_KEY = "123456789012345";
  process.env.CLOUDINARY_API_SECRET = "secret-value-for-tests-only";

  uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "dangro-media-"));
  process.env.UPLOAD_DIR = uploadDir;

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
});

const users = () => rows(db, "users") as Array<Record<string, unknown>>;
const posts = () => rows(db, "posts") as Array<Record<string, unknown>>;
const postMedia = () => rows(db, "post_media") as Array<Record<string, unknown>>;
const stories = () => rows(db, "stories") as Array<Record<string, unknown>>;

describe("the upload itself", () => {
  it("sends the verified bytes to Cloudinary and returns its delivery URL", async () => {
    const data = await uploadImage();

    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(data.url).toBe(CLOUDINARY_RESULT.secure_url);
    expect(data.publicId).toBe(CLOUDINARY_RESULT.public_id);
    expect(uploadMock.mock.calls[0]?.[0]).toMatch(/^[A-Za-z]:[\\/]|^\//); // a real path on disk
  });

  it("leaves nothing on the API host to serve or clean up", async () => {
    await uploadImage();

    expect(fs.readdirSync(uploadDir)).toEqual([]);
  });
});

describe("the delivery URL is what reaches MongoDB", () => {
  it("stores the Cloudinary secure_url as the post image", async () => {
    const uploaded = await uploadImage();

    const res = await request(app)
      .post("/api/posts")
      .set(auth())
      .send({ caption: "holiday", media: [{ url: uploaded.url, type: "image" }] });

    expect(res.status).toBe(201);
    expect(posts()).toHaveLength(1);

    const [media] = postMedia();
    expect(media?.url).toBe(CLOUDINARY_RESULT.secure_url);
    expect(media?.url).toMatch(/^https:\/\/res\.cloudinary\.com\//);
  });

  it("stores the Cloudinary secure_url as the profile picture", async () => {
    const uploaded = await uploadImage();

    const res = await request(app)
      .patch("/api/users/me")
      .set(auth())
      .send({ avatar: uploaded.url });

    expect(res.status).toBe(200);
    expect(users()[0]?.avatar).toBe(CLOUDINARY_RESULT.secure_url);
  });

  it("stores the Cloudinary secure_url as the story image", async () => {
    const uploaded = await uploadImage();

    const res = await request(app)
      .post("/api/stories")
      .set(auth())
      .send({ mediaUrl: uploaded.url, mediaType: "image" });

    expect(res.status).toBe(201);
    expect(stories()[0]?.mediaUrl).toBe(CLOUDINARY_RESULT.secure_url);
  });
});

describe("MongoDB never keeps a local path as an image URL", () => {
  it("rejects a Windows filesystem path as an avatar", async () => {
    // The spool file is deleted as soon as Cloudinary accepts the bytes, so a
    // document holding this URL would render a permanently broken image.
    const res = await request(app)
      .patch("/api/users/me")
      .set(auth())
      .send({ avatar: String.raw`C:\Users\me\AppData\Local\Temp\dangro\uploads\a.png` });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(users()[0]?.avatar ?? null).toBeNull();
  });

  it("rejects a data: URI, so bytes are not smuggled into a document", async () => {
    const res = await request(app)
      .post("/api/posts")
      .set(auth())
      .send({
        media: [{ url: `data:image/png;base64,${PNG.toString("base64")}`, type: "image" }],
      });

    expect(res.status).toBe(400);
    expect(posts()).toHaveLength(0);
  });

  it("rejects a javascript: URL", async () => {
    const res = await request(app)
      .patch("/api/users/me")
      .set(auth())
      .send({ avatar: "javascript:alert(1)" });

    expect(res.status).toBe(400);
    expect(JSON.stringify(users())).not.toContain("javascript:");
  });

  it("writes no document at all when Cloudinary refused the upload", async () => {
    // The image never existed as far as Cloudinary is concerned, so there is
    // nothing for the caller to store and nothing to point at later.
    uploadMock.mockRejectedValue({ error: { message: "Invalid credentials" } });

    const res = await request(app)
      .post("/api/uploads")
      .set(auth())
      .attach("file", PNG, { filename: "holiday.png", contentType: "image/png" });

    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: "UPSTREAM_ERROR" },
    });
    expect(res.body.data?.url).toBeUndefined();
    expect(posts()).toHaveLength(0);
  });

  it("does not hand back a URL when Cloudinary answers without one", async () => {
    uploadMock.mockResolvedValue({ public_id: CLOUDINARY_RESULT.public_id });

    const res = await request(app)
      .post("/api/uploads")
      .set(auth())
      .attach("file", PNG, { filename: "holiday.png", contentType: "image/png" });

    expect(res.status).toBe(502);
    expect(fs.readdirSync(uploadDir)).toEqual([]);
  });
});

describe("replaced and deleted images do not linger in the media library", () => {
  it("destroys the previous profile picture when it is replaced", async () => {
    const first = await uploadImage();
    await request(app).patch("/api/users/me").set(auth()).send({ avatar: first.url }).expect(200);
    expect(destroyMock).not.toHaveBeenCalled();

    uploadMock.mockResolvedValue({
      ...CLOUDINARY_RESULT,
      public_id: "dangro/images/second",
      secure_url: `https://res.cloudinary.com/${CLOUD}/image/upload/dangro/images/second.png`,
    });
    const second = await uploadImage();
    await request(app).patch("/api/users/me").set(auth()).send({ avatar: second.url }).expect(200);

    // The old asset is gone; the new one is what the document points at.
    expect(destroyMock).toHaveBeenCalledTimes(1);
    expect(destroyMock.mock.calls[0]?.[0]).toBe(CLOUDINARY_RESULT.public_id);
    expect(users()[0]?.avatar).toBe(second.url);
  });

  it("leaves an external avatar link alone when it is replaced", async () => {
    await request(app)
      .patch("/api/users/me")
      .set(auth())
      .send({ avatar: "https://example.com/me.png" })
      .expect(200);

    const uploaded = await uploadImage();
    await request(app).patch("/api/users/me").set(auth()).send({ avatar: uploaded.url }).expect(200);

    // Nothing on Cloudinary to remove.
    expect(destroyMock).not.toHaveBeenCalled();
  });

  it("destroys the images of a deleted post", async () => {
    const uploaded = await uploadImage();
    const created = await request(app)
      .post("/api/posts")
      .set(auth())
      .send({ media: [{ url: uploaded.url, type: "image" }] })
      .expect(201);
    const postId = created.body.data.post.id as string;

    await request(app).delete(`/api/posts/${postId}`).set(auth()).expect(200);

    expect(posts()).toHaveLength(0);
    expect(destroyMock).toHaveBeenCalledTimes(1);
    expect(destroyMock.mock.calls[0]?.[0]).toBe(CLOUDINARY_RESULT.public_id);
  });

  it("does not destroy another user's post image", async () => {
    const uploaded = await uploadImage();
    const created = await request(app)
      .post("/api/posts")
      .set(auth())
      .send({ media: [{ url: uploaded.url, type: "image" }] })
      .expect(201);
    const postId = created.body.data.post.id as string;

    const otherAuth = { Authorization: `Bearer ${jwt.sign({ userId: OTHER }, config.jwtSecret)}` };
    const res = await request(app).delete(`/api/posts/${postId}`).set(otherAuth);

    expect(res.status).toBe(403);
    expect(posts()).toHaveLength(1);
    expect(destroyMock).not.toHaveBeenCalled();
  });
});