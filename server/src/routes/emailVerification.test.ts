import { describe, expect, it, beforeEach, afterAll, beforeAll, vi } from "vitest";
import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";

/* eslint-disable @typescript-eslint/no-explicit-any -- in-memory Prisma stub */

/**
 * The signup → verify → login flow, end to end through Express.
 *
 * Two things are substituted: the database (an in-memory stub that implements
 * the exact operations these routes perform, including the conditional
 * `updateMany` that makes a token single-use) and the mail server (a recorder
 * that can be made to fail). Nothing else is bypassed — validation, hashing,
 * the JWT middleware and the error envelope all run for real, so a regression
 * in any of them fails here.
 */

// --- prisma stub ------------------------------------------------------------

const { users, prismaMock, mailer, store } = vi.hoisted(() => {
  const users = new Map<string, any>();

  /** Enough of the Prisma surface for these routes, faithfully. */
  function matchesClause(actual: unknown, condition: unknown): boolean {
    if (condition === null) return actual === null || actual === undefined;

    if (Array.isArray(condition)) return condition.some((c) => matchesClause(actual, c));

    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      const spec = condition as Record<string, unknown>;
      if ("equals" in spec) {
        // Prisma's case-insensitive mode, which the email lookups rely on.
        return String(actual ?? "").toLowerCase() === String(spec.equals).toLowerCase();
      }
      if ("gt" in spec) return (actual as Date) > (spec.gt as Date);
      if ("lt" in spec) return (actual as Date) < (spec.lt as Date);
      if ("not" in spec) return !matchesClause(actual, spec.not);
      return String(actual) === String(condition);
    }

    return actual === condition;
  }

  function matches(row: any, where: any): boolean {
    if (!where) return true;
    return Object.entries(where).every(([key, condition]) => {
      if (key === "OR") return (condition as any[]).some((clause) => matches(row, clause));
      if (key === "AND") return (condition as any[]).every((clause) => matches(row, clause));
      // Both engines store the primary key in `_id` and expose it as `id`.
      return matchesClause(key === "id" ? row._id : row[key], condition);
    });
  }

  /** Mirrors mongoPopulate's pickScalars: an absent column reads back as null. */
  function shape(row: any, select: any) {
    if (!select) return { ...row, id: row._id };
    const picked: any = {};
    for (const [field, enabled] of Object.entries(select)) {
      if (enabled !== true) continue;
      picked[field] = row[field === "id" ? "_id" : field] ?? null;
    }
    return picked;
  }

  const prismaMock: any = {
    user: {
      create: async ({ data, select }: any) => {
        const row: any = { _id: crypto.randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...data };
        users.set(row._id, row);
        return shape(row, select);
      },
      findFirst: async ({ where, select }: any) => {
        const row = [...users.values()].find((candidate) => matches(candidate, where));
        return row ? shape(row, select) : null;
      },
      findUnique: async ({ where, select }: any) => {
        const row = users.get(where.id);
        return row ? shape(row, select) : null;
      },
      update: async ({ where, data, select }: any) => {
        const row = users.get(where.id);
        if (!row) {
          const err = Object.assign(new Error("Record to update not found"), {
            name: "PrismaClientKnownRequestError",
            code: "P2025",
          });
          throw err;
        }
        Object.assign(row, data, { updatedAt: new Date() });
        return shape(row, select);
      },
      // The atomic claim. A filter that names the token hash, the unused
      // marker and a live expiry means exactly one concurrent caller can
      // match, which is what makes a link single-use.
      updateMany: async ({ where, data }: any) => {
        const hits = [...users.values()].filter((row) => matches(row, where));
        for (const row of hits) Object.assign(row, data, { updatedAt: new Date() });
        return { count: hits.length };
      },
      delete: async ({ where }: any) => {
        users.delete(where.id);
        return { id: where.id };
      },
    },
  };

  const store: any[] = [];
  const mailer = {
    failing: false,
    /** Flipped to simulate a provider outage in the health probe. */
    reachable: true,
    sent: store,
    async sendMail(mail: any) {
      if (mailer.failing) {
        const { MailDeliveryError } = await import("../lib/mailer.js");
        throw new MailDeliveryError("The verification email could not be sent", "the mail server refused the message");
      }
      store.push(mail);
      return { messageId: `test-${store.length}` };
    },
    async emailServerHealth() {
      // `configured` is read from the REAL config rather than hard-coded, so
      // the "mail is not set up" cases still exercise the production value.
      // Only `reachable` — which would need a live socket — is stubbed.
      const { config } = await import("../config.js");
      return {
        configured: config.email.configured,
        transport: config.email.transport,
        reachable: mailer.reachable,
        detail: mailer.reachable ? "stubbed" : "the mail server could not be reached",
      };
    },
  };

  return { users, prismaMock, mailer, store };
});

vi.mock("../prisma.js", () => ({ prisma: prismaMock, mongoClient: null }));

// Only the transport and the health probe are replaced. `assertEmailConfigured`
// stays real and reads the real config, so the "no mail server" cases exercise
// the production guard instead of a stub that agrees with them by construction.
vi.mock("../lib/mailer.js", async () => {
  const real = await vi.importActual<typeof import("../lib/mailer.js")>("../lib/mailer.js");
  return {
    ...real,
    sendMail: (mail: any) => mailer.sendMail(mail),
    emailServerHealth: () => mailer.emailServerHealth(),
  };
});

import { errorHandler } from "../middleware/errorHandler.js";
import authRoutes from "./auth.js";
import { verifyEmailLimiter } from "../lib/rateLimits.js";
import { config } from "../config.js";

const app = express();
app.use(express.json({ limit: "2mb" }));
// The refresh token lives in an httpOnly cookie, exactly as index.ts wires it.
app.use(cookieParser());
app.use("/api/auth", authRoutes);
app.use(errorHandler);

// A second app, carrying the real limiter, so the rate-limit case exercises
// the production object rather than a re-declared copy of it.
const limitedApp = express();
limitedApp.use(express.json());
limitedApp.use(cookieParser());
limitedApp.use("/api/auth", verifyEmailLimiter, authRoutes);
limitedApp.use(errorHandler);

/** Pulls the token out of the most recent message the stub recorded. */
function lastToken(): string {
  const mail = store.at(-1);
  const match = /[?&]token=([A-Za-z0-9_-]+)/.exec(mail?.html ?? "");
  if (!match) throw new Error(`no token in the last message: ${mail?.subject}`);
  return match[1];
}

function rowFor(email: string): any {
  const row = [...users.values()].find((u) => u.email === email);
  if (!row) throw new Error(`no user ${email}`);
  return row;
}

/**
 * Flips the server's own idea of "is email configured".
 *
 * `config` is declared `as const`, so this needs a cast — but the alternative
 * is stubbing `assertEmailConfigured`, which would mean the "no mail server"
 * tests pass because the stub agreed with them rather than because the guard
 * works.
 */
function setEmailConfigured(configured: boolean): void {
  const email = config.email as unknown as { configured: boolean; missingVars: string[] };
  email.configured = configured;
  email.missingVars = configured ? [] : ["SMTP_HOST", "EMAIL_FROM"];
}

async function signup(overrides: Record<string, unknown> = {}) {
  const email = (overrides.email as string) ?? `user${users.size}@example.com`;
  const res = await request(app)
    .post("/api/auth/register")
    .send({ username: `user${users.size}`, email, password: "password123", ...overrides });
  return { res, email };
}

async function verifyWith(token: string) {
  return request(app).post("/api/auth/verify-email").send({ token });
}

beforeEach(() => {
  users.clear();
  store.length = 0;
  mailer.failing = false;
  mailer.reachable = true;
  setEmailConfigured(true);
});

// --- signup -----------------------------------------------------------------

describe("POST /api/auth/register", () => {
  it("creates the account unverified", async () => {
    const { res, email } = await signup({ email: "newbie@example.com" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.emailVerified).toBe(false);
    expect(rowFor(email).emailVerified).toBe(false);
  });

  it("issues no session — there is nothing to sign in with yet", async () => {
    const { res } = await signup();

    expect(res.body.data.accessToken).toBeUndefined();
    expect(res.body.data.refreshToken).toBeUndefined();
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("tells the client to go and check the inbox", async () => {
    const { res } = await signup();
    expect(res.body.data.verificationRequired).toBe(true);
    expect(res.body.data.message).toMatch(/check your inbox/i);
    expect(res.body.data.email).toBe("us***@example.com");
  });

  it("normalises the address before storing it", async () => {
    const { res } = await signup({ email: "  MixedCase@Example.COM  " });
    expect(res.status).toBe(201);
    expect(rowFor("mixedcase@example.com")).toBeTruthy();
    expect(store.at(-1).to).toBe("mixedcase@example.com");
  });

  it("never stores the password in the clear", async () => {
    await signup();
    const row = [...users.values()][0];
    expect(row.password).not.toBe("password123");
    expect(row.password).toMatch(/^\$2[aby]\$/); // bcrypt
  });

  it("stores only a hash of the emailed token, never the token itself", async () => {
    await signup();
    const row = [...users.values()][0];
    const token = lastToken();

    expect(row.emailVerificationTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.emailVerificationTokenHash).not.toBe(token);
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it("puts an expiry on the token", async () => {
    await signup();
    const row = [...users.values()][0];
    const minutes = (row.emailVerificationExpiresAt.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(25);
    expect(minutes).toBeLessThan(35);
  });

  it("never puts a password or any secret in the link", async () => {
    await signup({ password: "password123" });
    const link = store.at(-1).html;

    expect(link).not.toContain("password123");
    expect(link).toMatch(/verify-email\?token=/);
  });

  it("mails a link built from the configured public origin", async () => {
    await signup();
    expect(store.at(-1).html).toContain(`${config.appBaseUrl}/verify-email?token=`);
  });

  it("ships both an HTML and a plain-text part", async () => {
    await signup();
    const mail = store.at(-1);
    expect(mail.html).toContain("Verify Email");
    expect(mail.text).toContain("/verify-email?token=");
  });

  it("rejects a duplicate address, whatever the case", async () => {
    await signup({ email: "taken@example.com" });
    const { res } = await signup({ email: "TAKEN@example.com", username: "different" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("rejects a duplicate username, whatever the case", async () => {
    await signup({ username: "taken" });
    const { res } = await signup({ username: "Taken", email: "other@example.com" });

    expect(res.status).toBe(409);
  });

  it("reports a unique-index race as a conflict, not a server error", async () => {
    await signup({ email: "race@example.com", username: "racer" });

    // Two requests that both passed the "does it exist?" check and collided
    // on the unique index — the outcome must still be 409.
    const real = prismaMock.user.create;
    prismaMock.user.create = async () => {
      const err = Object.assign(new Error("E11000 duplicate key error"), { code: 11000 });
      throw err;
    };

    try {
      const { res } = await signup({ email: "race2@example.com", username: "racer2" });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CONFLICT");
    } finally {
      prismaMock.user.create = real;
    }
  });

  it("refuses to create an account when no mail server is configured", async () => {
    setEmailConfigured(false);

    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "nolist", email: "nolist@example.com", password: "password123" });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("SERVICE_UNAVAILABLE");
    // Crucially: nothing was written. A user must not lose their address to a
    // configuration mistake on the server.
    expect(users.size).toBe(0);
  });

  it("rolls the account back when the provider refuses the message", async () => {
    mailer.failing = true;

    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "nomail", email: "nomail@example.com", password: "password123" });

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("UPSTREAM_ERROR");
    expect(res.body.error.message).toMatch(/could not be sent/i);
    // It must never say the email went out when it did not.
    expect(res.body.data).toBeUndefined();
    // And the address is not left burnt by a failed send.
    expect(users.size).toBe(0);
  });

  it("rejects malformed input before touching the database", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "x", email: "not-an-email", password: "short" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(users.size).toBe(0);
  });

  it("rejects an oversized body", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "big", email: "big@example.com", password: "x".repeat(3 * 1024 * 1024) });

    expect(res.status).toBe(413);
  });
});

// --- verification -----------------------------------------------------------

describe("POST /api/auth/verify-email", () => {
  it("verifies the account with a valid token", async () => {
    await signup();
    const token = lastToken();

    const res = await verifyWith(token);

    expect(res.status).toBe(200);
    expect(res.body.data.verified).toBe(true);
    expect(rowFor("user0@example.com").emailVerified).toBe(true);
  });

  it("records when it happened and marks the token spent", async () => {
    await signup();
    const token = lastToken();
    await verifyWith(token);

    const row = [...users.values()][0];
    expect(row.emailVerifiedAt).toBeInstanceOf(Date);
    expect(row.emailVerificationUsedAt).toBeInstanceOf(Date);
    // The hash stays behind so a replay can be answered honestly. It is the
    // hash of a spent 256-bit token, so it is not a credential.
    expect(row.emailVerificationTokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects a token that was never issued", async () => {
    await signup();
    const res = await verifyWith("A".repeat(43));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_TOKEN");
  });

  it("rejects a malformed token before hashing it", async () => {
    const res = await request(app).post("/api/auth/verify-email").send({ token: "../../etc/passwd" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a missing token", async () => {
    const res = await request(app).post("/api/auth/verify-email").send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("refuses an expired token", async () => {
    await signup();
    const token = lastToken();

    // Age the row out behind the route's back.
    const row = [...users.values()][0];
    row.emailVerificationExpiresAt = new Date(Date.now() - 1000);

    const res = await verifyWith(token);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("TOKEN_EXPIRED");
    expect(rowFor("user0@example.com").emailVerified).toBe(false);
  });

  it("refuses a second use of the same link", async () => {
    await signup();
    const token = lastToken();

    expect((await verifyWith(token)).status).toBe(200);
    const replay = await verifyWith(token);

    expect(replay.status).toBe(400);
    expect(replay.body.error.code).toBe("TOKEN_ALREADY_USED");
  });

  it("lets exactly one of two simultaneous clicks through", async () => {
    // A double-click, or a mail scanner that fetched the link once already.
    await signup();
    const token = lastToken();

    const [a, b] = await Promise.all([verifyWith(token), verifyWith(token)]);
    const statuses = [a.status, b.status].sort();

    expect(statuses).toEqual([200, 400]);
    expect([a, b].filter((r) => r.status === 200)).toHaveLength(1);
  });

  it("does not expose an internal error when the database fails", async () => {
    await signup();
    const token = lastToken();

    const real = prismaMock.user.updateMany;
    prismaMock.user.updateMany = async () => {
      throw new Error("connection to server closed");
    };

    try {
      const res = await verifyWith(token);
      expect(res.status).toBe(500);
      expect(res.body.error).toEqual({ code: "INTERNAL_ERROR", message: "Internal server error" });
      // Neither the driver's message nor anything else about the internals.
      expect(JSON.stringify(res.body)).not.toMatch(/connection to server/);
    } finally {
      prismaMock.user.updateMany = real;
    }
  });
});

// --- resend -----------------------------------------------------------------

describe("POST /api/auth/resend-verification", () => {
  it("issues a new link", async () => {
    await signup({ email: "again@example.com" });
    const first = lastToken();

    const res = await request(app).post("/api/auth/resend-verification").send({ email: "again@example.com" });

    expect(res.status).toBe(200);
    expect(lastToken()).not.toBe(first);
  });

  it("invalidates the link it replaced", async () => {
    await signup({ email: "again@example.com" });
    const first = lastToken();

    await request(app).post("/api/auth/resend-verification").send({ email: "again@example.com" });

    const res = await verifyWith(first);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_TOKEN");
  });

  it("keeps the newest link working", async () => {
    await signup({ email: "again@example.com" });
    await request(app).post("/api/auth/resend-verification").send({ email: "again@example.com" });

    const res = await verifyWith(lastToken());
    expect(res.status).toBe(200);
  });

  it("answers an unknown address exactly like a known one", async () => {
    await signup({ email: "known@example.com" });

    const known = await request(app).post("/api/auth/resend-verification").send({ email: "known@example.com" });
    const unknown = await request(app).post("/api/auth/resend-verification").send({ email: "nobody@example.com" });

    expect(known.status).toBe(unknown.status);
    // Byte-for-byte: anything that differs is an account-existence oracle.
    expect(unknown.body).toEqual(known.body);
  });

  it("does not mail a verified account", async () => {
    await signup({ email: "done@example.com" });
    await verifyWith(lastToken());
    const before = store.length;

    const res = await request(app).post("/api/auth/resend-verification").send({ email: "done@example.com" });

    expect(res.status).toBe(200);
    expect(store.length).toBe(before);
  });

  it("reports a refused message instead of claiming one was sent", async () => {
    await signup({ email: "flaky@example.com" });
    mailer.failing = true;

    const res = await request(app).post("/api/auth/resend-verification").send({ email: "flaky@example.com" });

    // The whole point of this endpoint's error handling: never tell someone to
    // check an inbox when nothing was put in it.
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("UPSTREAM_ERROR");
    expect(res.body.data).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/on its way/i);
  });

  it("clears the half-written token when the send fails, so a retry is clean", async () => {
    await signup({ email: "flaky@example.com" });
    mailer.failing = true;

    await request(app).post("/api/auth/resend-verification").send({ email: "flaky@example.com" });

    expect(rowFor("flaky@example.com").emailVerificationTokenHash).toBeNull();
  });

  it("tells every caller the same thing when the mail server is unreachable", async () => {
    await signup({ email: "known@example.com" });
    mailer.reachable = false;

    const known = await request(app).post("/api/auth/resend-verification").send({ email: "known@example.com" });
    const unknown = await request(app).post("/api/auth/resend-verification").send({ email: "ghost@example.com" });

    // The outage answer is produced BEFORE any address lookup, so it cannot
    // distinguish an account from a stranger.
    expect(known.status).toBe(503);
    expect(known.body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(unknown.body).toEqual(known.body);
    expect(known.body.error.message).toMatch(/no message was sent/i);
  });

  it("sends nothing at all while the mail server is unreachable", async () => {
    await signup({ email: "known@example.com" });
    const before = store.length;
    mailer.reachable = false;

    await request(app).post("/api/auth/resend-verification").send({ email: "known@example.com" });

    expect(store.length).toBe(before);
  });

  it("refuses everything with one account-independent 503 when mail is unconfigured", async () => {
    setEmailConfigured(false);

    const known = await request(app).post("/api/auth/resend-verification").send({ email: "known@example.com" });
    const unknown = await request(app).post("/api/auth/resend-verification").send({ email: "no@example.com" });

    expect(known.status).toBe(503);
    expect(unknown.body).toEqual(known.body);
  });

  it("rejects a malformed address", async () => {
    const res = await request(app).post("/api/auth/resend-verification").send({ email: "nope" });
    expect(res.status).toBe(400);
  });
});

// --- login ------------------------------------------------------------------

describe("POST /api/auth/login", () => {
  it("refuses an unverified account with EMAIL_NOT_VERIFIED", async () => {
    await signup({ email: "unverified@example.com" });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "unverified@example.com", password: "password123" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("EMAIL_NOT_VERIFIED");
    expect(res.body.data).toBeUndefined();
  });

  it("gives the same answer for a wrong password as for an unknown account", async () => {
    await signup({ email: "unverified@example.com" });

    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: "unverified@example.com", password: "not-the-password" });
    const unknownUser = await request(app)
      .post("/api/auth/login")
      .send({ email: "ghost@example.com", password: "password123" });

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.body).toEqual(wrongPassword.body);
  });

  it("never reveals through a bad password that an account is unverified", async () => {
    await signup({ email: "unverified@example.com" });

    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: "unverified@example.com", password: "nope-nope-nope" });

    expect(wrongPassword.status).toBe(401);
  });

  it("signs the user in once the address is verified", async () => {
    await signup({ email: "good@example.com" });
    await verifyWith(lastToken());

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "good@example.com", password: "password123" });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user.emailVerified).toBe(true);
    expect(res.body.data.user.password).toBeUndefined();
  });

  it("accepts the address in any case", async () => {
    await signup({ email: "case@example.com" });
    await verifyWith(lastToken());

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "  CASE@Example.com ", password: "password123" });

    expect(res.status).toBe(200);
  });

  it("leaves a pre-verification account signed in — no mass lockout", async () => {
    // A row with no `emailVerified` column at all predates the feature. Those
    // accounts must keep working; treating "absent" as "false" would sign
    // every existing user out on deploy.
    users.set("legacy-1", {
      _id: "legacy-1",
      username: "legacy",
      email: "legacy@example.com",
      password: "$2b$12$abcdefghijklmnopqrstuvwxyz0123456789012345678901234567890",
      authSessionVersion: 0,
    });
    const bcrypt = await import("bcrypt");
    users.get("legacy-1").password = await bcrypt.hash("password123", 4);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "legacy@example.com", password: "password123" });

    expect(res.status).toBe(200);
  });
});

// --- verification status ----------------------------------------------------

describe("GET /api/auth/verification-status", () => {
  it("requires a token", async () => {
    const res = await request(app).get("/api/auth/verification-status");
    expect(res.status).toBe(401);
  });

  it("reports a verified account", async () => {
    await signup({ email: "status@example.com" });
    await verifyWith(lastToken());

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "status@example.com", password: "password123" });

    const res = await request(app)
      .get("/api/auth/verification-status")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.emailVerified).toBe(true);
    expect(res.body.data.email).toBe("status@example.com");
  });
});

// --- sessions ---------------------------------------------------------------

describe("session handling", () => {
  it("refuses to refresh once an account becomes unverified again", async () => {
    await signup({ email: "moving@example.com" });
    await verifyWith(lastToken());

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "moving@example.com", password: "password123" });
    const cookie = login.headers["set-cookie"];

    // An address change drops the account back to unverified.
    rowFor("moving@example.com").emailVerified = false;

    const res = await request(app).post("/api/auth/refresh").set("Cookie", cookie!);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("refuses a refresh token minted before a credential change", async () => {
    await signup({ email: "stale@example.com" });
    await verifyWith(lastToken());

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "stale@example.com", password: "password123" });
    const cookie = login.headers["set-cookie"];

    rowFor("stale@example.com").authSessionVersion = 5;

    const res = await request(app).post("/api/auth/refresh").set("Cookie", cookie!);
    expect(res.status).toBe(401);
  });

  it("ignores a client-supplied emailVerified", async () => {
    await signup({ email: "liar@example.com" });

    const forged = jwt.sign({ userId: "anything", emailVerified: true }, config.jwtSecret, { expiresIn: "15m" });
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${forged}`);

    // The claim is not even read; the route resolves the real user by id.
    expect(res.status).toBe(404);
  });
});

// --- password reset ---------------------------------------------------------

describe("POST /api/auth/forgot-password", () => {
  it("mails a reset link", async () => {
    await signup({ email: "reset@example.com" });
    await verifyWith(lastToken());
    const before = store.length;

    const res = await request(app).post("/api/auth/forgot-password").send({ email: "reset@example.com" });

    expect(res.status).toBe(200);
    expect(store.length).toBe(before + 1);
    expect(store.at(-1).html).toContain("/reset-password?token=");
  });

  it("answers an unknown address exactly like a known one", async () => {
    await signup({ email: "reset@example.com" });
    await verifyWith(lastToken());

    const known = await request(app).post("/api/auth/forgot-password").send({ email: "reset@example.com" });
    const unknown = await request(app).post("/api/auth/forgot-password").send({ email: "ghost@example.com" });

    expect(unknown.body).toEqual(known.body);
    expect(known.status).toBe(200);
  });

  it("reports a refused reset instead of claiming one was sent", async () => {
    await signup({ email: "reset@example.com" });
    mailer.failing = true;

    const res = await request(app).post("/api/auth/forgot-password").send({ email: "reset@example.com" });

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("UPSTREAM_ERROR");
    expect(JSON.stringify(res.body)).not.toMatch(/on its way/i);
  });

  it("tells every caller the same thing when the mail server is unreachable", async () => {
    await signup({ email: "reset@example.com" });
    mailer.reachable = false;

    const known = await request(app).post("/api/auth/forgot-password").send({ email: "reset@example.com" });
    const unknown = await request(app).post("/api/auth/forgot-password").send({ email: "ghost@example.com" });

    expect(known.status).toBe(503);
    expect(unknown.body).toEqual(known.body);
  });
});

describe("POST /api/auth/reset-password", () => {
  it("sets the new password and signs the user in with it", async () => {
    await signup({ email: "reset@example.com" });
    await request(app).post("/api/auth/forgot-password").send({ email: "reset@example.com" });

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: lastToken(), password: "brand-new-pass" });

    expect(res.status).toBe(200);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "reset@example.com", password: "brand-new-pass" });
    expect(login.status).toBe(200);
  });

  it("refuses a replayed reset link", async () => {
    await signup({ email: "reset@example.com" });
    await request(app).post("/api/auth/forgot-password").send({ email: "reset@example.com" });
    const token = lastToken();

    expect(
      (await request(app).post("/api/auth/reset-password").send({ token, password: "brand-new-pass" })).status
    ).toBe(200);

    const replay = await request(app).post("/api/auth/reset-password").send({ token, password: "another-one" });
    expect(replay.status).toBe(400);
    expect(replay.body.error.code).toBe("TOKEN_ALREADY_USED");
  });

  it("refuses an expired reset link", async () => {
    await signup({ email: "reset@example.com" });
    await request(app).post("/api/auth/forgot-password").send({ email: "reset@example.com" });

    rowFor("reset@example.com").passwordResetExpiresAt = new Date(Date.now() - 1000);

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: lastToken(), password: "brand-new-pass" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("TOKEN_EXPIRED");
  });

  it("counts a completed reset as verification", async () => {
    // Reaching the mailbox and clicking the link is the same proof that
    // verification asks for, so the user is not made to do it twice.
    await signup({ email: "reset@example.com" });
    await request(app).post("/api/auth/forgot-password").send({ email: "reset@example.com" });

    await request(app).post("/api/auth/reset-password").send({ token: lastToken(), password: "brand-new-pass" });

    expect(rowFor("reset@example.com").emailVerified).toBe(true);
  });

  it("signs out anything that was authenticated with the old password", async () => {
    await signup({ email: "reset@example.com" });
    await verifyWith(lastToken());

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "reset@example.com", password: "password123" });
    const cookie = login.headers["set-cookie"];

    await request(app).post("/api/auth/forgot-password").send({ email: "reset@example.com" });
    await request(app).post("/api/auth/reset-password").send({ token: lastToken(), password: "brand-new-pass" });

    const res = await request(app).post("/api/auth/refresh").set("Cookie", cookie!);
    expect(res.status).toBe(401);
  });

  it("rejects a password that is too short", async () => {
    await signup({ email: "reset@example.com" });
    await request(app).post("/api/auth/forgot-password").send({ email: "reset@example.com" });

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: lastToken(), password: "short" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/auth/change-password", () => {
  it("requires authentication", async () => {
    const res = await request(app).post("/api/auth/change-password").send({
      currentPassword: "password123",
      newPassword: "another-pass",
    });
    expect(res.status).toBe(401);
  });

  it("refuses the wrong current password", async () => {
    await signup({ email: "chpw@example.com" });
    await verifyWith(lastToken());
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "chpw@example.com", password: "password123" });

    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`)
      .send({ currentPassword: "wrong", newPassword: "another-pass" });

    expect(res.status).toBe(401);
  });

  it("changes the password and keeps this device signed in", async () => {
    await signup({ email: "chpw@example.com" });
    await verifyWith(lastToken());
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "chpw@example.com", password: "password123" });

    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`)
      .send({ currentPassword: "password123", newPassword: "another-pass" });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));

    const login2 = await request(app)
      .post("/api/auth/login")
      .send({ email: "chpw@example.com", password: "another-pass" });
    expect(login2.status).toBe(200);
  });

  it("refuses to reuse the current password", async () => {
    await signup({ email: "chpw@example.com" });
    await verifyWith(lastToken());
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "chpw@example.com", password: "password123" });

    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`)
      .send({ currentPassword: "password123", newPassword: "password123" });

    expect(res.status).toBe(400);
  });
});

// --- rate limiting ----------------------------------------------------------

describe("rate limiting", () => {
  beforeAll(() => {
    process.env.EMAIL_VERIFY_RATE_LIMIT = "3";
  });

  afterAll(() => {
    delete process.env.EMAIL_VERIFY_RATE_LIMIT;
  });

  it("caps how fast a token can be submitted", async () => {
    const attempts = [];
    for (let i = 0; i < 5; i += 1) {
      attempts.push(await request(limitedApp).post("/api/auth/verify-email").send({ token: "A".repeat(43) }));
    }

    const limited = attempts.filter((r) => r.status === 429);
    expect(limited.length).toBeGreaterThan(0);
    expect(limited[0].body.error.code).toBe("RATE_LIMITED");
    // The budget of 3 means the 4th request onwards is refused.
    expect(attempts[0].status).toBe(400);
    expect(attempts.slice(3).every((r) => r.status === 429)).toBe(true);
  });
});