import { describe, expect, it } from "vitest";
import request from "supertest";
import express from "express";
import { app } from "./index.js";
import { ok, toErrorBody } from "./lib/http.js";

describe("API envelope contract", () => {
  it("GET /api/health returns the success envelope", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toMatchObject({
      success: true,
      data: { status: "ok" },
    });
    expect(typeof res.body.data.uptime).toBe("number");
  });

  it("unknown API routes return a JSON 404 with the failure envelope", async () => {
    const res = await request(app).get("/api/definitely-not-a-route");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: { code: "NOT_FOUND", message: expect.any(String) },
    });
  });

  it("unmatched methods on known routes return a JSON 404", async () => {
    const res = await request(app).post("/api/health");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("never returns the HTML SPA shell for unknown API routes", async () => {
    const res = await request(app)
      .get("/api/does-not-exist")
      .set("Accept", "text/html");
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.success).toBe(false);
  });
});

describe("authentication", () => {
  it("rejects unauthenticated requests with the failure envelope", async () => {
    const res = await request(app).get("/api/users/me");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      success: false,
      error: { code: "UNAUTHORIZED", message: expect.any(String) },
    });
  });

  it("rejects uploads without a token", async () => {
    const res = await request(app).post("/api/uploads");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});

describe("input validation", () => {
  it("returns VALIDATION_ERROR for malformed registration", async () => {
    const res = await request(app).post("/api/auth/register").send({
      email: "not-an-email",
      password: "short",
      username: "x",
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: "VALIDATION_ERROR", message: expect.any(String) },
    });
  });

  it("rejects JSON with a malformed body payload size over the limit", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "a@b.c", password: "x".repeat(3 * 1024 * 1024) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });
});

describe("media routing", () => {
  it("leaves /uploads to express.static on the disk provider", async () => {
    // The media router answers from GridFS or a redirect target. Mounted for
    // the disk provider it would return its JSON 404 for every real upload and
    // never let express.static serve the file, because it never calls next().
    const res = await request(app).get("/uploads/3f2a1b4c-1111-2222-3333-444455556666.png");

    expect(res.body).not.toMatchObject({ success: false });
  });
});

describe("envelope helpers", () => {
  it("ok() emits { success, data }", async () => {
    const probe = express();
    probe.use((_req, res) => ok(res, { hello: "world" }, 201));
    await request(probe)
      .get("/")
      .expect(201);
  });
});

describe("error mapping", () => {
  it("maps a Prisma unique-constraint failure to CONFLICT", () => {
    const err = Object.assign(new Error("unique"), {
      name: "PrismaClientKnownRequestError",
      code: "P2002",
    });
    expect(toErrorBody(err)).toEqual({
      success: false,
      error: { code: "CONFLICT", message: expect.any(String) },
    });
  });

  it("maps a MongoDB duplicate-key failure to CONFLICT, not INTERNAL_ERROR", () => {
    // The Mongo engine writes documents directly, so a unique-index
    // violation reaches the error handler as a driver error. Returning 500
    // here would turn an ordinary double-click race into a server error.
    const err = Object.assign(new Error("E11000 duplicate key error collection"), {
      name: "MongoServerError",
      code: 11000,
    });
    expect(toErrorBody(err)).toEqual({
      success: false,
      error: { code: "CONFLICT", message: expect.any(String) },
    });
  });

  it("still maps unrelated errors to INTERNAL_ERROR", () => {
    expect(toErrorBody(new Error("boom"))).toEqual({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
  });
});