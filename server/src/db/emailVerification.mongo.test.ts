import { describe, expect, it } from "vitest";
import { fakeDb } from "./fakeDb.js";
import { createMongoClient, type MongoDelegate } from "./mongoClient.js";

/**
 * The email-verification claim, run through the real MongoDB query engine.
 *
 * The route tests use a Prisma-shaped stub, so they prove the ROUTE is right but
 * say nothing about how `mongoWhere` and `updateMany` translate the filter. That
 * translation is the part most likely to be quietly wrong, and it is what
 * actually runs in production on this deployment — the two backends differ
 * exactly here:
 *
 *   - `{ emailVerificationUsedAt: null }` has to match a document where the
 *     field is null AND one written before the column existed (Mongo matches
 *     absent against `null`; Postgres matches via `IS NULL`);
 *   - `{ emailVerified: false }` has to match ONLY an explicit `false` and not
 *     an absent field, which is what keeps legacy accounts trusted;
 *   - `{ emailVerificationExpiresAt: { gt: now } }` has to reach the driver as
 *     `$gt` on a Date rather than a string comparison.
 *
 * A silent mistranslation in any of those either locks every legacy user out or
 * makes a verification link reusable.
 */

type TestPrisma = { user: MongoDelegate };

const now = new Date();

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

/** The exact filter `claimVerificationToken` uses. */
function claimFilter(hash: string) {
  return {
    emailVerificationTokenHash: hash,
    emailVerificationUsedAt: null,
    emailVerified: false,
    emailVerificationExpiresAt: { gt: new Date() },
  };
}

const claimData = {
  emailVerified: true,
  emailVerifiedAt: new Date(),
  emailVerificationUsedAt: new Date(),
};

async function seedUnverified(prisma: TestPrisma, overrides: Record<string, unknown> = {}) {
  return (await prisma.user.create({
    data: {
      username: "bob",
      email: "bob@example.com",
      password: "hash",
      emailVerified: false,
      emailVerificationTokenHash: "hash-1",
      emailVerificationExpiresAt: new Date(now.getTime() + 30 * 60_000),
      ...overrides,
    },
  })) as { id: string };
}

describe("claiming a verification token on MongoDB", () => {
  it("matches a pending token and marks the account verified", async () => {
    const { prisma } = client();
    const user = await seedUnverified(prisma);

    const result = await prisma.user.updateMany({ where: claimFilter("hash-1"), data: claimData });

    expect(result.count).toBe(1);
    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after?.emailVerified).toBe(true);
    expect(after?.emailVerifiedAt).toBeInstanceOf(Date);
    expect(after?.emailVerificationUsedAt).toBeInstanceOf(Date);
  });

  it("matches nothing on the second attempt — the link is single-use", async () => {
    const { prisma } = client();
    await seedUnverified(prisma);

    await prisma.user.updateMany({ where: claimFilter("hash-1"), data: claimData });
    const replay = await prisma.user.updateMany({ where: claimFilter("hash-1"), data: claimData });

    expect(replay.count).toBe(0);
  });

  it("refuses an expired token", async () => {
    const { prisma } = client();
    await seedUnverified(prisma, {
      emailVerificationExpiresAt: new Date(now.getTime() - 1000),
    });

    expect((await prisma.user.updateMany({ where: claimFilter("hash-1"), data: claimData })).count).toBe(0);
  });

  it("refuses a token that does not match", async () => {
    const { prisma } = client();
    await seedUnverified(prisma);

    expect((await prisma.user.updateMany({ where: claimFilter("wrong"), data: claimData })).count).toBe(0);
  });

  it("leaves an already-verified account alone", async () => {
    const { prisma } = client();
    await seedUnverified(prisma, { emailVerified: true });

    expect((await prisma.user.updateMany({ where: claimFilter("hash-1"), data: claimData })).count).toBe(0);
  });

  it("never claims a legacy account that has no emailVerified field", async () => {
    // This is the whole no-lockout guarantee, and it hinges on Mongo matching
    // an ABSENT field against `{ emailVerified: false }` returning nothing.
    const { prisma } = client();
    await prisma.user.create({
      data: { username: "legacy", email: "legacy@example.com", password: "hash" },
    });

    const result = await prisma.user.updateMany({ where: claimFilter("hash-1"), data: claimData });

    expect(result.count).toBe(0);

    // Read the same column the two ways the routes read it, because they get
    // different shapes and both have to mean "trusted":
    //   - with `select`, pickScalars renders an absent column as null;
    //   - without one, the column is simply missing from the document.
    const selected = await prisma.user.findFirst({
      where: { email: "legacy@example.com" },
      select: { emailVerified: true },
    });
    const whole = await prisma.user.findFirst({ where: { email: "legacy@example.com" } });

    expect(selected?.emailVerified).toBeNull();
    expect(whole?.emailVerified).toBeUndefined();
    // `isEmailVerified` in routes/auth.ts is `!== false`, so neither shape
    // reads as unverified.
    expect(whole?.emailVerified !== false).toBe(true);
  });

  it("treats a null used-marker as unused, so the first click works", async () => {
    const { prisma } = client();
    await seedUnverified(prisma, { emailVerificationUsedAt: null });

    expect((await prisma.user.updateMany({ where: claimFilter("hash-1"), data: claimData })).count).toBe(1);
  });

  it("refuses a token that has already been spent", async () => {
    const { prisma } = client();
    await seedUnverified(prisma, { emailVerificationUsedAt: new Date(now.getTime() - 60_000) });

    expect((await prisma.user.updateMany({ where: claimFilter("hash-1"), data: claimData })).count).toBe(0);
  });

  it("does not touch another user's row", async () => {
    const { prisma } = client();
    await seedUnverified(prisma);
    await prisma.user.create({
      data: {
        username: "eve",
        email: "eve@example.com",
        password: "hash",
        emailVerified: false,
        emailVerificationTokenHash: "eve-hash",
        emailVerificationExpiresAt: new Date(now.getTime() + 30 * 60_000),
      },
    });

    expect((await prisma.user.updateMany({ where: claimFilter("hash-1"), data: claimData })).count).toBe(1);

    const eve = await prisma.user.findFirst({ where: { email: "eve@example.com" } });
    expect(eve?.emailVerified).toBe(false);
  });
});

describe("locating a user by normalised email on MongoDB", () => {
  it("finds the account whatever case the login used", async () => {
    // The routes store a lower-cased address and query with Prisma's
    // `mode: "insensitive"`, which mongoWhere turns into an anchored regex.
    const { prisma } = client();
    await seedUnverified(prisma);

    for (const attempt of ["bob@example.com", "BOB@Example.com", " Bob@EXAMPLE.com "]) {
      const found = await prisma.user.findFirst({
        where: { email: { equals: attempt.trim().toLowerCase(), mode: "insensitive" } },
        select: { id: true },
      });
      expect(found).not.toBeNull();
    }
  });
});

describe("the password-reset claim on MongoDB", () => {
  it("uses the same single-use conditional write", async () => {
    const { prisma } = client();
    await prisma.user.create({
      data: {
        username: "bob",
        email: "bob@example.com",
        password: "hash",
        passwordResetTokenHash: "reset-1",
        passwordResetExpiresAt: new Date(now.getTime() + 30 * 60_000),
      },
    });

    const where = {
      id: "x",
      passwordResetTokenHash: "reset-1",
      passwordResetUsedAt: null,
      passwordResetExpiresAt: { gt: new Date() },
    };
    const candidate = await prisma.user.findFirst({
      where: { passwordResetTokenHash: "reset-1" },
      select: { id: true },
    });

    const first = await prisma.user.updateMany({
      where: { ...where, id: candidate!.id },
      data: { passwordResetUsedAt: new Date() },
    });
    const second = await prisma.user.updateMany({
      where: { ...where, id: candidate!.id },
      data: { passwordResetUsedAt: new Date() },
    });

    expect(first.count).toBe(1);
    expect(second.count).toBe(0);
  });
});