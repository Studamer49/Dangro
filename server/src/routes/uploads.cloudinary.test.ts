import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import jwt from "jsonwebtoken";
import type { Express } from "express";

/**
 * End-to-end coverage for the authenticated upload endpoint with Cloudinary.
 *
 * The SDK is mocked at the module boundary so no network call is made. What is
 * exercised for real: authentication, the magic-byte check, the size limit,
 * the store dispatch, the response envelope and — critically — that the
 * browser is never told to load from anything but a public https origin.
 */

const uploadMock = vi.hoisted(() => vi.fn());
const destroyMock = vi.hoisted(() => vi.fn());
const configMock = vi.hoisted(() => vi.fn());

const CLOUD_NAME = "dangro-test-cloud";
const API_KEY = "123456789012345";
// A distinctive value so a leak anywhere is caught by a string search.
const API_SECRET = "SUPER-SECRET-VALUE-DO-NOT-LEAK-abcdef123456";

// The SDK package is mocked rather than lib/cloudinary.js: uploadImage calls
// the module-local requireCloudinary binding, so replacing the export would
// leave the real SDK running and try to stream a file from disk.
vi.mock("cloudinary", () => ({
  default: {},
  v2: {
    config: configMock,
    uploader: { upload: uploadMock, destroy: destroyMock },
  },
}));

const ME = "11111111-1111-4111-8111-111111111111";

let app: Express;
let config: typeof import("../config.js").config;

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 0x01),
]);
const GIF = Buffer.concat([Buffer.from("GIF89a", "latin1"), Buffer.alloc(64, 0x02)]);

const token = () => jwt.sign({ userId: ME }, config.jwtSecret);

async function loadApp() {
  vi.resetModules();
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "x".repeat(40);
  process.env.DATABASE_PROVIDER = "postgres";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/dangro-test";
  process.env.CLOUDINARY_CLOUD_NAME = CLOUD_NAME;
  process.env.CLOUDINARY_API_KEY = API_KEY;
  process.env.CLOUDINARY_API_SECRET = API_SECRET;
  process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "dangro-cld-"));
  const mod = await import("../index.js");
  app = mod.app;
  config = (await import("../config.js")).config;
}

beforeEach(async () => {
  uploadMock.mockReset();
  destroyMock.mockReset();
  configMock.mockReset();
  process.env.CLOUDINARY_CLOUD_NAME = CLOUD_NAME;
  process.env.CLOUDINARY_API_KEY = API_KEY;
  process.env.CLOUDINARY_API_SECRET = API_SECRET;
  uploadMock.mockResolvedValue({
    public_id: "dangro/11111111-2222-3333-4444-555555555555",
    secure_url: `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/c_limit,w_1920,f_auto,q_auto/dangro/11111111-2222-3333-4444-555555555555.png`,
    bytes: PNG.length,
    format: "png",
    width: 800,
    height: 600,
  });
  destroyMock.mockResolvedValue({ result: "ok" });
  await loadApp();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * superagent's .attach takes (field, buffer, { filename, contentType }).
 * Returning the pieces keeps the call sites readable.
 */
function filePart(bytes: Buffer, name: string, type: string) {
  return { bytes, name, type };
}

/** Applies the part to a supertest request under the "file" field. */
function attach(req: request.Test, part: ReturnType<typeof filePart>) {
  return req.attach("file", part.bytes, { filename: part.name, contentType: part.type });
}

const post = (part: ReturnType<typeof filePart>) =>
  attach(request(app).post("/api/uploads").set("Authorization", `Bearer ${token()}`), part);

describe("POST /api/uploads — authentication", () => {
  it("rejects an unauthenticated upload", async () => {
    const res = await attach(
      request(app).post("/api/uploads"),
      filePart(PNG, "a.png", "image/png")
    );

    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe("UNAUTHORIZED");
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed token", async () => {
    const res = await attach(
      request(app).post("/api/uploads").set("Authorization", "Bearer not-a-jwt"),
      filePart(PNG, "a.png", "image/png")
    );

    expect(res.status).toBe(401);
    expect(uploadMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/uploads — successful image upload", () => {
  it("stores the image on Cloudinary and returns a public delivery URL", async () => {
    const res = await post(filePart(PNG, "holiday.png", "image/png"));

    expect(res.status).toBe(201);
    expect(res.body?.data?.url).toMatch(/^https:\/\/res\.cloudinary\.com\//);
    expect(res.body?.data?.publicId).toBeTruthy();
    expect(res.body?.data?.type).toBe("image");
    expect(res.body?.data?.mimeType).toBe("image/png");
  });

  it("never returns a credential in the response", async () => {
    const res = await post(filePart(PNG, "holiday.png", "image/png"));
    const serialised = JSON.stringify(res.body);

    expect(serialised).not.toContain(API_SECRET);
    expect(serialised).not.toContain(API_KEY);
    expect(serialised.toLowerCase()).not.toContain("api_secret");
  });

  it("never derives the storage path from the user-supplied filename", async () => {
    await post(filePart(PNG, "../../etc/passwd.png", "image/png"));

    const opts = uploadMock.mock.calls[0]?.[1] as Record<string, unknown>;
    // The public id is the server-generated uuid, never "passwd" or a path.
    expect(opts.public_id).toMatch(/^[a-f0-9-]{36}$/);
    expect(String(opts.public_id)).not.toContain("passwd");
    expect(opts.use_filename).toBe(false);
  });

  it("passes the optimisation transformation but never upscales", async () => {
    await post(filePart(PNG, "a.png", "image/png"));

    const opts = uploadMock.mock.calls[0]?.[1] as Record<string, unknown>;
    const tf = (opts.transformation as Record<string, unknown>[])[0];

    expect(tf.crop).toBe("limit"); // limits without cropping or enlarging
    expect(tf.quality).toBe("auto");
    expect(tf.fetch_format).toBe("auto");
  });

  it("keeps GIF animated by not asking for an automatic format", async () => {
    const gifResult = { ...{} };
    uploadMock.mockResolvedValue({
      public_id: "dangro/abc",
      secure_url: "https://res.cloudinary.com/x/image/upload/c_limit,w_1920,q_auto/dangro/abc.gif",
      bytes: GIF.length,
      format: "gif",
      width: 10,
      height: 10,
    });

    const res = await post(filePart(GIF, "anim.gif", "image/gif"));

    expect(res.status).toBe(201);
    expect(gifResult).toBeTruthy();
    const opts = uploadMock.mock.calls[0]?.[1] as Record<string, unknown>;
    const tf = (opts.transformation as Record<string, unknown>[])[0];
    expect(tf.fetch_format).toBeUndefined();
    expect(opts.format).toBe("gif");
  });

  it("deletes the local spool file after a successful upload", async () => {
    const dir = config.uploadDir;
    const before = fs.readdirSync(dir).length;

    await post(filePart(PNG, "a.png", "image/png"));

    // The bytes are on Cloudinary; keeping a copy would fill the ephemeral disk.
    expect(fs.readdirSync(dir).length).toBe(before);
  });
});

describe("POST /api/uploads — rejected input", () => {
  it("rejects a file type outside the allowlist", async () => {
    const res = await post(filePart(Buffer.from("%PDF-1.7"), "doc.pdf", "text/html"));

    expect(res.status).toBe(400);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects a spoofed Content-Type: HTML bytes declared as a PNG", async () => {
    const res = await post(filePart(Buffer.from("<script>alert(1)</script>"), "evil.png", "image/png"));

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("contents do not match");
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects a renamed executable declared as a JPEG", async () => {
    const res = await post(filePart(Buffer.from("MZ\x90\x00"), "virus.jpg", "image/jpeg"));

    expect(res.status).toBe(400);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized image with 413 and does not call Cloudinary", async () => {
    // Over the 8 MB image ceiling, but under multer's 50 MB media ceiling.
    const big = Buffer.concat([PNG, Buffer.alloc(9 * 1024 * 1024, 0x03)]);

    const res = await post(filePart(big, "big.png", "image/png"));

    expect(res.status).toBe(413);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("does not leave the rejected file on disk", async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(9 * 1024 * 1024, 0x03)]);
    const dir = config.uploadDir;
    const before = fs.readdirSync(dir).length;

    await post(filePart(big, "big.png", "image/png"));

    expect(fs.readdirSync(dir).length).toBe(before);
  });
});

describe("POST /api/uploads — Cloudinary failures", () => {
  it("returns 502 when Cloudinary rejects the upload", async () => {
    uploadMock.mockRejectedValue({ error: { message: "Invalid credentials" } });

    const res = await post(filePart(PNG, "a.png", "image/png"));

    expect(res.status).toBe(502);
    expect(res.body?.success).toBe(false);
    // UPSTREAM_ERROR, not INTERNAL_ERROR: the API is healthy, Cloudinary is
    // not, and the client is told which by the code.
    expect(res.body?.error?.code).toBe("UPSTREAM_ERROR");
  });

  it("does not log a stack trace for an upstream refusal", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    uploadMock.mockRejectedValue({ error: { message: "Invalid credentials" } });

    await post(filePart(PNG, "a.png", "image/png"));

    // The terminal handler only dumps a trace for INTERNAL_ERROR. A rejected
    // image upload is routine, not a server fault.
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("never reports success when the upload did not complete", async () => {
    uploadMock.mockRejectedValue(new Error("socket hang up"));

    const res = await post(filePart(PNG, "a.png", "image/png"));

    expect(res.status).not.toBe(201);
    expect(res.body?.data?.url).toBeUndefined();
  });

  it("treats a result with no delivery URL as a failure", async () => {
    uploadMock.mockResolvedValue({ public_id: "dangro/x" });

    const res = await post(filePart(PNG, "a.png", "image/png"));

    expect(res.status).toBe(502);
  });

  it("cleans up the spool file when the upload fails", async () => {
    uploadMock.mockRejectedValue(new Error("boom"));
    const dir = config.uploadDir;
    const before = fs.readdirSync(dir).length;

    await post(filePart(PNG, "a.png", "image/png"));

    expect(fs.readdirSync(dir).length).toBe(before);
  });
});

describe("POST /api/uploads — no silent fallback when unconfigured", () => {
  it("fails with 503 instead of storing the image locally", async () => {
    vi.resetModules();
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;

    const mod = await import("../index.js");
    const unconfigured = mod.app;
    const cfg = (await import("../config.js")).config;

    const res = await attach(
      request(unconfigured)
        .post("/api/uploads")
        .set("Authorization", `Bearer ${jwt.sign({ userId: ME }, cfg.jwtSecret)}`),
      filePart(PNG, "a.png", "image/png")
    );

    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).toContain("Cloudinary");
    // The image must not have quietly landed on the disk store instead.
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("names the missing variable and uses SERVICE_UNAVAILABLE", async () => {
    vi.resetModules();
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;

    const mod = await import("../index.js");
    const unconfigured = mod.app;
    const cfg = (await import("../config.js")).config;

    const res = await attach(
      request(unconfigured)
        .post("/api/uploads")
        .set("Authorization", `Bearer ${jwt.sign({ userId: ME }, cfg.jwtSecret)}`),
      filePart(PNG, "a.png", "image/png")
    );

    expect(res.body?.error?.code).toBe("SERVICE_UNAVAILABLE");
    // An operator who cannot tell which variable is missing cannot fix it.
    expect(res.body?.error?.message).toContain("CLOUDINARY_API_SECRET");
  });

  it("reports the disabled image store on the health endpoint", async () => {
    vi.resetModules();
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;

    const unconfigured = (await import("../index.js")).app;

    const res = await request(unconfigured).get("/api/health");

    // The API itself is healthy: turning the whole site red would take every
    // other feature down with the one that is broken.
    expect(res.status).toBe(200);
    expect(res.body?.data?.imageStorage).toBe("unconfigured");
  });
});

describe("health endpoint", () => {
  it("reports that images go to Cloudinary when it is configured", async () => {
    const res = await request(app).get("/api/health");

    expect(res.body?.data?.imageStorage).toBe("cloudinary");
  });
});

describe("non-image media keeps using the configured store", () => {
  it("does not send an audio upload to Cloudinary", async () => {
    // Voice notes must stay off Cloudinary, which would reject or re-encode them.
    const wav = Buffer.concat([Buffer.from("RIFF", "latin1"), Buffer.alloc(4), Buffer.from("WAVE", "latin1"), Buffer.alloc(32, 0x04)]);

    const res = await post(filePart(wav, "note.wav", "audio/wav"));

    expect(res.status).toBe(201);
    expect(res.body?.data?.type).toBe("audio");
    // Served by the configured provider, not by Cloudinary.
    expect(res.body?.data?.url).toMatch(/^\/uploads\//);
    expect(uploadMock).not.toHaveBeenCalled();
    expect(res.body?.data?.publicId).toBeNull();
  });
});

describe("content security policy", () => {
  it("allows the Cloudinary delivery host, or every image is blocked", async () => {
    const res = await request(app).get("/api/health");
    const header = String(res.headers["content-security-policy"]);

    expect(header).toContain("https://res.cloudinary.com");
  });

  it("names the delivery host in img-src", async () => {
    const res = await request(app).get("/api/health");
    const imgSrc = String(res.headers["content-security-policy"])
      .split(";")
      .map((p) => p.trim())
      .find((p) => p.startsWith("img-src "));

    expect(imgSrc).toContain("https://res.cloudinary.com");
    // Still no wildcard: the policy is not opened up wholesale.
    expect(imgSrc).not.toContain("*");
  });
});