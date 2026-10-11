import { describe, expect, it, beforeAll, afterAll } from "vitest";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Regression tests for the /uploads mount order.
 *
 * The bug: mediaRoutes was mounted *before* express.static and answered a
 * missing file with a JSON 404 instead of calling next(). So the moment
 * MEDIA_PROVIDER changed (e.g. remote -> gridfs) every upload still sitting in
 * server/uploads became unreachable — the store router claimed the path, found
 * nothing, and 404'd before express.static was ever consulted. That is exactly
 * what "media doesn't load" looked like after switching provider.
 *
 * `remote` is used here because it is the one provider whose router is mounted
 * deterministically without needing a live MongoDB connection, and it is the
 * provider whose router otherwise hijacks every /uploads request.
 */

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ON_DISK = "aaaa1111-2222-3333-4444-555566667777.png";
const MEDIA_HOST = "https://media.example.ts.net";

let app: import("express").Express;
let uploadDir: string;

beforeAll(async () => {
  uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "dangro-uploads-"));
  fs.writeFileSync(path.join(uploadDir, ON_DISK), PNG);

  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "x".repeat(40);
  process.env.DATABASE_PROVIDER = "mongo";
  process.env.MONGODB_URI = "mongodb://127.0.0.1:27017";
  process.env.MONGODB_DB_NAME = "dangro";
  process.env.MEDIA_PROVIDER = "remote";
  process.env.MEDIA_PUBLIC_URL = MEDIA_HOST;
  process.env.MEDIA_INGEST_KEY = "k".repeat(40);
  process.env.UPLOAD_DIR = uploadDir;

  const mod = await import("../index.js");
  app = mod.app;
});

afterAll(() => {
  fs.rmSync(uploadDir, { recursive: true, force: true });
});

describe("/uploads mount order", () => {
  it("serves a file that exists on disk instead of handing it to the store router", async () => {
    const res = await request(app).get(`/uploads/${ON_DISK}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/image\/png/);
    expect(Buffer.from(res.body).equals(PNG)).toBe(true);
  });

  it("falls through to the store when the file is not on disk", async () => {
    // With mediaRoutes mounted first this would have been a 404 and the file
    // would never load. Now the router gets it and can stream/redirect.
    const res = await request(app).get("/uploads/99999999-9999-9999-9999-999999999999.png");

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${MEDIA_HOST}/media/99999999-9999-9999-9999-999999999999.png`);
  });

  it("never serves file contents for a traversal attempt", async () => {
    const res = await request(app).get("/uploads/..%2f..%2f.env");

    // It resolves to the SPA shell, not the .env file. What matters is that no
    // server file content comes back.
    expect(String(res.text ?? "")).not.toContain("JWT_SECRET");
    expect(String(res.text ?? "")).not.toContain("MONGODB_URI");
  });
});