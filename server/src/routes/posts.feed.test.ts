import { describe, expect, it, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

/* eslint-disable @typescript-eslint/no-explicit-any -- in-memory prisma stub. */

/**
 * A private profile has to stay private everywhere, not only on the page that
 * happens to render it.
 *
 * `/user/:userId` has always filtered by `isPrivate`, but `/feed` carried no
 * filter at all and `/api/posts/:id` only checked that the post existed — so
 * "enforced as well as in the UI" held for one endpoint while every private
 * account's posts were served to any authenticated caller who asked for the
 * feed or guessed a post id.
 */

const { prismaMock, store } = vi.hoisted(() => {
  const stores = {
    users: new Map<string, any>(),
    posts: new Map<string, any>(),
    follows: [] as any[],
  };

  let counter = 0;
  const uuid = () => {
    counter += 1;
    return `00000000-0000-4000-8000-${counter.toString(16).padStart(12, "0")}`;
  };

  return { prismaMock: { __placeholder: true } as any, store: stores, uuid };
});

/**
 * Evaluates the subset of Prisma `where` grammar the post routes build:
 * `AND` / `OR` and the scalar forms `{ authorId }`, `{ in }`, `{ not: true }`
 * plus the nested relation form `{ author: { isPrivate: ... } }`.
 */
function matches(row: any, where: any): boolean {
  if (!where) return true;
  if (Array.isArray(where.AND) && !where.AND.every((w: any) => matches(row, w))) return false;
  if (Array.isArray(where.OR) && !where.OR.some((w: any) => matches(row, w))) return false;

  for (const [key, value] of Object.entries(where)) {
    if (key === "AND" || key === "OR") continue;

    if (key === "author") {
      const author = store.users.get(row.authorId) ?? {};
      const spec = (value ?? {}) as any;
      if (spec.isPrivate !== undefined) {
        if (spec.isPrivate?.not === true) {
          // `$ne: true` also matches a user document that predates the column.
          if (author.isPrivate === true) return false;
        } else if (author.isPrivate !== spec.isPrivate) {
          return false;
        }
      }
      continue;
    }

    const actual = row[key];
    if (Array.isArray(value)) {
      if (!value.includes(actual)) return false;
    } else if (value && typeof value === "object") {
      const spec = value as any;
      if ("in" in spec && !spec.in.includes(actual)) return false;
      if (spec.not === true && actual === spec.not) return false;
      if ("equals" in spec && actual !== spec.equals) return false;
    } else if (actual !== value) {
      return false;
    }
  }

  return true;
}

prismaMock.user = {
  findUnique: async (args: any) => {
    const user = store.users.get(args?.where?.id);
    return user ? { id: user.id, isPrivate: user.isPrivate } : null;
  },
};

prismaMock.follow = {
  findMany: async (args: any) =>
    store.follows
      .filter((f) => !args?.where?.followerId || f.followerId === args.where.followerId)
      .map((f) => ({ followingId: f.followingId })),
};

prismaMock.post = {
  findMany: async (args: any) => {
    const rows = [...store.posts.values()]
      .filter((p) => matches(p, args?.where))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return args?.take ? rows.slice(0, args.take) : rows;
  },
  findFirst: async (args: any) =>
    [...store.posts.values()].find((p) => matches(p, args?.where)) ?? null,
  findUnique: async (args: any) => store.posts.get(args?.where?.id) ?? null,
};

vi.mock("../prisma.js", () => ({ prisma: prismaMock, mongoClient: null }));
vi.mock("../middleware/auth.js", () => ({
  authenticate: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  requireUser: (req: express.Request) => (req as express.Request & { userId: string }).userId,
}));

import postRoutes from "./posts.js";
import { errorHandler } from "../middleware/errorHandler.js";

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as express.Request & { userId: string }).userId =
    (req.headers["x-user"] as string) ?? VIEWER;
  next();
});
app.use("/api/posts", postRoutes);
app.use(errorHandler);

const VIEWER = "aaaaaaaa-1111-4111-8111-111111111111";
const PUBLIC_AUTHOR = "bbbbbbbb-2222-4222-8222-222222222222";
const PRIVATE_AUTHOR = "cccccccc-3333-4333-8333-333333333333";
const FOLLOWED_PRIVATE_AUTHOR = "dddddddd-4444-4444-8444-444444444444";

let viewerPost: any;
let publicPost: any;
let privatePost: any;
let followedPrivatePost: any;

function seed(): void {
  store.users.clear();
  store.posts.clear();
  store.follows.length = 0;

  store.users.set(VIEWER, { id: VIEWER, isPrivate: false });
  store.users.set(PUBLIC_AUTHOR, { id: PUBLIC_AUTHOR, isPrivate: false });
  store.users.set(PRIVATE_AUTHOR, { id: PRIVATE_AUTHOR, isPrivate: true });
  store.users.set(FOLLOWED_PRIVATE_AUTHOR, { id: FOLLOWED_PRIVATE_AUTHOR, isPrivate: true });

  const post = (authorId: string) => {
    const row = { id: crypto.randomUUID(), authorId, caption: "hello", createdAt: new Date() };
    store.posts.set(row.id, row);
    return row;
  };

  viewerPost = post(VIEWER);
  publicPost = post(PUBLIC_AUTHOR);
  privatePost = post(PRIVATE_AUTHOR);
  followedPrivatePost = post(FOLLOWED_PRIVATE_AUTHOR);
}

const ids = (res: request.Response) => res.body.data.posts.map((p: any) => p.id);

beforeEach(seed);

describe("GET /api/posts/feed — private profiles", () => {
  it("includes your own posts and those of public accounts", async () => {
    const res = await request(app).get("/api/posts/feed").set("x-user", VIEWER);

    expect(res.status).toBe(200);
    expect(ids(res)).toContain(viewerPost.id);
    expect(ids(res)).toContain(publicPost.id);
  });

  it("omits the posts of a private account you do not follow", async () => {
    const res = await request(app).get("/api/posts/feed").set("x-user", VIEWER);

    expect(ids(res)).not.toContain(privatePost.id);
  });

  it("includes a private account once you follow it", async () => {
    store.follows.push({ followerId: VIEWER, followingId: FOLLOWED_PRIVATE_AUTHOR });

    const res = await request(app).get("/api/posts/feed").set("x-user", VIEWER);

    expect(ids(res)).toContain(followedPrivatePost.id);
  });

  it("does not leak a private account's posts to somebody who follows nobody", async () => {
    const stranger = "eeeeeeee-5555-4555-8555-555555555555";
    store.users.set(stranger, { id: stranger, isPrivate: false });

    const res = await request(app).get("/api/posts/feed").set("x-user", stranger);

    expect(ids(res)).not.toContain(privatePost.id);
    expect(ids(res)).not.toContain(followedPrivatePost.id);
  });
});

describe("GET /api/posts/:id — private profiles", () => {
  it("serves a public post", async () => {
    const res = await request(app).get(`/api/posts/${publicPost.id}`).set("x-user", VIEWER);

    expect(res.status).toBe(200);
    expect(res.body.data.post.id).toBe(publicPost.id);
  });

  it("404s a private post rather than leaking it by id", async () => {
    const res = await request(app).get(`/api/posts/${privatePost.id}`).set("x-user", VIEWER);

    expect(res.status).toBe(404);
  });

  it("still serves your own post when your own profile is private", async () => {
    store.users.set(VIEWER, { id: VIEWER, isPrivate: true });

    const res = await request(app).get(`/api/posts/${viewerPost.id}`).set("x-user", VIEWER);

    expect(res.status).toBe(200);
  });

  it("serves a followed private author's post", async () => {
    store.follows.push({ followerId: VIEWER, followingId: FOLLOWED_PRIVATE_AUTHOR });

    const res = await request(app)
      .get(`/api/posts/${followedPrivatePost.id}`)
      .set("x-user", VIEWER);

    expect(res.status).toBe(200);
  });

  it("404s an unknown post exactly as it does a hidden one", async () => {
    const res = await request(app)
      .get("/api/posts/99999999-9999-4999-8999-999999999999")
      .set("x-user", VIEWER);

    expect(res.status).toBe(404);
  });
});