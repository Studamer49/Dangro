import { describe, expect, it, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

/* eslint-disable @typescript-eslint/no-explicit-any -- in-memory prisma stub. */

/**
 * Regression tests for the friend request lifecycle.
 *
 * The bug: `reject` marked the row `status: "rejected"` and left it in place,
 * while `FriendRequest` is `@@unique([senderId, receiverId])` and the
 * duplicate check only looked for `status: "pending"`. So the sender's next
 * attempt found no pending request, fell through to the insert, and died on
 * the unique constraint with a 409 "That value is already taken." The two
 * people could never befriend each other again.
 */

const { prismaMock, store, uuid } = vi.hoisted(() => {
  const stores = {
    users: new Map<string, any>(),
    friends: new Map<string, any>(),
    requests: new Map<string, any>(),
  };
  let counter = 0;
  const uuid = () => {
    counter += 1;
    return `00000000-0000-4000-8000-${counter.toString(16).padStart(12, "0")}`;
  };
  return { prismaMock: { __placeholder: true } as any, store: stores, uuid };
});

prismaMock.user = {
  findUnique: async (args: any) => store.users.get(args?.where?.id) ?? null,
};

// The routes build their operations eagerly and hand the array over, so
// running them together is all the stub has to do.
prismaMock.$transaction = async (operations: any) => Promise.all(operations);

prismaMock.friend = {
  // The unique constraint the re-request collided with, reproduced faithfully
  // so the regression is actually caught rather than mocked away.
  create: async (args: any) => {
    const { userId, friendId } = args.data;
    for (const row of store.friends.values()) {
      if (row.userId === userId && row.friendId === friendId) {
        const err: any = new Error("Unique constraint failed on the fields: (`userId`,`friendId`)");
        err.code = "P2002";
        throw err;
      }
    }
    const row = { id: uuid(), userId, friendId, createdAt: new Date() };
    store.friends.set(row.id, row);
    return row;
  },
  findFirst: async (args: any) => {
    const or = args?.where?.OR ?? [];
    return (
      [...store.friends.values()].find((row) =>
        or.some(
          (clause: any) =>
            (clause.userId === row.userId && clause.friendId === row.friendId) ||
            (clause.userId === row.friendId && clause.friendId === row.userId)
        )
      ) ?? null
    );
  },
};

prismaMock.friendRequest = {
  create: async (args: any) => {
    const { senderId, receiverId } = args.data;
    for (const row of store.requests.values()) {
      if (row.senderId === senderId && row.receiverId === receiverId) {
        const err: any = new Error("Unique constraint failed on the fields: (`senderId`,`receiverId`)");
        err.code = "P2002";
        throw err;
      }
    }
    const row = {
      id: uuid(),
      senderId,
      receiverId,
      status: "pending",
      createdAt: new Date(),
      sender: store.users.get(senderId) ?? null,
    };
    store.requests.set(row.id, row);
    return { ...row };
  },
  findFirst: async (args: any) => {
    const or = args?.where?.OR ?? [];
    const status = args?.where?.status;
    return (
      [...store.requests.values()].find(
        (row) =>
          (!status || row.status === status) &&
          or.some(
            (clause: any) =>
              (clause.senderId === row.senderId && clause.receiverId === row.receiverId) ||
              (clause.senderId === row.receiverId && clause.receiverId === row.senderId)
          )
      ) ?? null
    );
  },
  findUnique: async (args: any) => store.requests.get(args?.where?.id) ?? null,
  update: async (args: any) => {
    const row = store.requests.get(args.where.id)!;
    Object.assign(row, args.data);
    return { ...row };
  },
  delete: async (args: any) => {
    store.requests.delete(args.where.id);
    return { id: args.where.id };
  },
};

vi.mock("../prisma.js", () => ({ prisma: prismaMock, mongoClient: null }));
vi.mock("../lib/notifications.js", () => ({ createNotification: async () => undefined }));
vi.mock("../middleware/auth.js", () => ({
  authenticate: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  requireUser: (req: express.Request) => (req as express.Request & { userId: string }).userId,
}));

import friendRoutes from "./friends.js";
import { errorHandler } from "../middleware/errorHandler.js";

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as express.Request & { userId: string }).userId = (req.headers["x-user"] as string) ?? "alice";
  next();
});
app.use("/api/friends", friendRoutes);
app.use(errorHandler);

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  store.users.clear();
  store.friends.clear();
  store.requests.clear();
  store.users.set(ALICE, { id: ALICE, username: "alice", avatar: null, status: "offline" });
  store.users.set(BOB, { id: BOB, username: "bob", avatar: null, status: "offline" });
});

describe("POST /api/friends/request", () => {
  it("refuses a request to yourself", async () => {
    const res = await request(app)
      .post("/api/friends/request")
      .set("x-user", ALICE)
      .send({ userId: ALICE });

    expect(res.status).toBe(400);
  });

  it("creates a pending request", async () => {
    const res = await request(app).post("/api/friends/request").send({ userId: BOB });

    expect(res.status).toBe(201);
    expect(store.requests.size).toBe(1);
  });

  it("refuses a second pending request between the same pair", async () => {
    await request(app).post("/api/friends/request").send({ userId: BOB });
    const res = await request(app).post("/api/friends/request").send({ userId: BOB });

    expect(res.status).toBe(409);
    expect(store.requests.size).toBe(1);
  });
});

describe("POST /api/friends/reject", () => {
  // Regression: rejecting kept the row, so the sender could never re-request.
  it("lets the sender request again after a rejection", async () => {
    const first = await request(app).post("/api/friends/request").send({ userId: BOB });
    const requestId = first.body.data.request.id;

    const rejected = await request(app)
      .post("/api/friends/reject")
      .set("x-user", BOB)
      .send({ requestId });
    expect(rejected.status).toBe(200);

    // The rejected row is gone rather than parked at status "rejected", so the
    // unique constraint no longer blocks the next attempt.
    expect(store.requests.has(requestId)).toBe(false);

    const again = await request(app).post("/api/friends/request").send({ userId: BOB });
    expect(again.status).toBe(201);
    expect(store.requests.size).toBe(1);
  });

  it("refuses a rejection from anyone but the receiver", async () => {
    const first = await request(app).post("/api/friends/request").send({ userId: BOB });
    const requestId = first.body.data.request.id;

    const res = await request(app)
      .post("/api/friends/reject")
      .set("x-user", "carol")
      .send({ requestId });

    expect(res.status).toBe(403);
  });
});

describe("POST /api/friends/accept", () => {
  it("creates both directed friendship rows", async () => {
    const first = await request(app).post("/api/friends/request").send({ userId: BOB });
    const requestId = first.body.data.request.id;

    const res = await request(app)
      .post("/api/friends/accept")
      .set("x-user", BOB)
      .send({ requestId });

    expect(res.status).toBe(200);
    expect(store.friends.size).toBe(2);
  });

  it("refuses to accept the same request twice", async () => {
    const first = await request(app).post("/api/friends/request").send({ userId: BOB });
    const requestId = first.body.data.request.id;

    await request(app).post("/api/friends/accept").set("x-user", BOB).send({ requestId });
    const again = await request(app)
      .post("/api/friends/accept")
      .set("x-user", BOB)
      .send({ requestId });

    expect(again.status).toBe(409);
  });
});