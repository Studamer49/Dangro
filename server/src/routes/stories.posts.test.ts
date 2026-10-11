import { describe, expect, it, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

/* eslint-disable @typescript-eslint/no-explicit-any -- in-memory prisma stub. */

/**
 * Story editing and post/comment mutation.
 *
 * The rule worth most of these tests is ownership: a story, a post and a
 * comment may only be changed by the person who wrote it. Everything else is
 * ordinary validation.
 */

const { prismaMock, store, uuid } = vi.hoisted(() => {
  const stores = {
    stories: new Map<string, any>(),
    posts: new Map<string, any>(),
    comments: new Map<string, any>(),
    users: new Map<string, any>(),
  };
  let counter = 0;
  const uuid = () => {
    counter += 1;
    return `00000000-0000-4000-8000-${counter.toString(16).padStart(12, "0")}`;
  };
  return { prismaMock: { __placeholder: true } as any, store: stores, uuid };
});

const AUTHOR = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

prismaMock.story = {
  create: async (args: any) => {
    const row = {
      id: uuid(),
      authorId: args.data.authorId,
      mediaUrl: args.data.mediaUrl,
      mediaType: args.data.mediaType,
      expiresAt: args.data.expiresAt ?? new Date(Date.now() + 86_400_000),
      createdAt: new Date(),
      author: { id: args.data.authorId, username: "author", avatar: null },
    };
    store.stories.set(row.id, row);
    return { ...row };
  },
  findUnique: async (args: any) => store.stories.get(args?.where?.id) ?? null,
  update: async (args: any) => {
    const row = store.stories.get(args.where.id)!;
    Object.assign(row, args.data);
    return { ...row };
  },
  delete: async (args: any) => {
    store.stories.delete(args.where.id);
    return { id: args.where.id };
  },
  findMany: async () => [],
  deleteMany: async () => ({ count: 0 }),
};

prismaMock.post = {
  findUnique: async (args: any) => store.posts.get(args?.where?.id) ?? null,
  update: async (args: any) => {
    const row = store.posts.get(args.where.id)!;
    Object.assign(row, args.data);
    return { ...row };
  },
  delete: async (args: any) => {
    store.posts.delete(args.where.id);
    return { id: args.where.id };
  },
  count: async () => 0,
};

prismaMock.postComment = {
  findMany: async () => [],
  findUnique: async (args: any) => store.comments.get(args?.where?.id) ?? null,
  create: async (args: any) => {
    const row = {
      id: uuid(),
      postId: args.data.postId,
      authorId: args.data.authorId,
      content: args.data.content,
      createdAt: new Date(),
      author: { id: args.data.authorId, username: "author", avatar: null },
    };
    store.comments.set(row.id, row);
    return row;
  },
  update: async (args: any) => {
    const row = store.comments.get(args.where.id)!;
    Object.assign(row, args.data);
    return { ...row, author: { id: row.authorId, username: "author", avatar: null } };
  },
  delete: async (args: any) => {
    store.comments.delete(args.where.id);
    return { id: args.where.id };
  },
};

vi.mock("../prisma.js", () => ({ prisma: prismaMock, mongoClient: null }));
vi.mock("../middleware/auth.js", () => ({
  authenticate: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  requireUser: (req: express.Request) => (req as express.Request & { userId: string }).userId,
}));

import storyRoutes from "./stories.js";
import postRoutes from "./posts.js";
import { errorHandler } from "../middleware/errorHandler.js";

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as express.Request & { userId: string }).userId = (req.headers["x-user"] as string) ?? AUTHOR;
  next();
});
app.use("/api/stories", storyRoutes);
app.use("/api/posts", postRoutes);
app.use(errorHandler);

let storyId: string;
let postId: string;
let commentId: string;

beforeEach(async () => {
  store.stories.clear();
  store.posts.clear();
  store.comments.clear();

  const story = await prismaMock.story.create({
    data: { authorId: AUTHOR, mediaUrl: "/uploads/a.png", mediaType: "image" },
  });
  storyId = story.id;

  store.posts.set(uuid(), { id: "placeholder", authorId: AUTHOR, caption: "original" });
  const post = { id: uuid(), authorId: AUTHOR, caption: "original", createdAt: new Date() };
  store.posts.set(post.id, post);
  postId = post.id;

  const comment = await prismaMock.postComment.create({
    data: { postId, authorId: AUTHOR, content: "first" },
  });
  commentId = comment.id;
});

describe("PATCH /api/stories/:id", () => {
  it("replaces the media on a story you own", async () => {
    const res = await request(app)
      .patch(`/api/stories/${storyId}`)
      .send({ mediaUrl: "/uploads/replaced.png", mediaType: "image" });

    expect(res.status).toBe(200);
    expect(res.body.data.story.mediaUrl).toBe("/uploads/replaced.png");
  });

  it("refuses to edit someone else's story", async () => {
    const res = await request(app)
      .patch(`/api/stories/${storyId}`)
      .set("x-user", OTHER)
      .send({ mediaUrl: "/uploads/hijack.png", mediaType: "image" });

    // Deliberately the same 404 as a missing story, so the endpoint cannot be
    // used to discover which story ids exist.
    expect(res.status).toBe(404);
  });

  it("refuses to revive an expired story", async () => {
    store.stories.get(storyId)!.expiresAt = new Date(Date.now() - 1000);

    const res = await request(app)
      .patch(`/api/stories/${storyId}`)
      .send({ mediaUrl: "/uploads/new.png", mediaType: "image" });

    expect(res.status).toBe(409);
  });

  it("still rejects an unsafe media url", async () => {
    const res = await request(app)
      .patch(`/api/stories/${storyId}`)
      .send({ mediaUrl: "javascript:alert(1)", mediaType: "image" });

    expect(res.status).toBe(400);
  });

  it("requires both fields", async () => {
    const res = await request(app).patch(`/api/stories/${storyId}`).send({ mediaUrl: "/uploads/a.png" });

    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/posts/:id", () => {
  it("edits the caption on a post you own", async () => {
    const res = await request(app).patch(`/api/posts/${postId}`).send({ caption: "updated" });

    expect(res.status).toBe(200);
    expect(res.body.data.post.caption).toBe("updated");
  });

  it("clears the caption when emptied", async () => {
    const res = await request(app).patch(`/api/posts/${postId}`).send({ caption: "" });

    expect(res.status).toBe(200);
    expect(res.body.data.post.caption).toBeNull();
  });

  it("refuses to edit someone else's post", async () => {
    const res = await request(app)
      .patch(`/api/posts/${postId}`)
      .set("x-user", OTHER)
      .send({ caption: "hijack" });

    expect(res.status).toBe(403);
  });

  it("rejects an over-long caption", async () => {
    const res = await request(app).patch(`/api/posts/${postId}`).send({ caption: "x".repeat(2201) });

    expect(res.status).toBe(400);
  });
});

describe("comment editing", () => {
  it("edits a comment you wrote", async () => {
    const res = await request(app).patch(`/api/posts/comments/${commentId}`).send({ content: "edited" });

    expect(res.status).toBe(200);
    expect(res.body.data.comment.content).toBe("edited");
  });

  it("refuses to edit someone else's comment", async () => {
    const res = await request(app)
      .patch(`/api/posts/comments/${commentId}`)
      .set("x-user", OTHER)
      .send({ content: "hijack" });

    expect(res.status).toBe(403);
  });

  it("rejects an empty comment", async () => {
    const res = await request(app).patch(`/api/posts/comments/${commentId}`).send({ content: "   " });

    expect(res.status).toBe(400);
  });

  it("deletes a comment you wrote", async () => {
    const res = await request(app).delete(`/api/posts/comments/${commentId}`);

    expect(res.status).toBe(200);
    expect(store.comments.has(commentId)).toBe(false);
  });

  it("refuses to delete someone else's comment", async () => {
    const res = await request(app)
      .delete(`/api/posts/comments/${commentId}`)
      .set("x-user", OTHER);

    expect(res.status).toBe(403);
    expect(store.comments.has(commentId)).toBe(true);
  });

  it("404s an unknown comment", async () => {
    const res = await request(app)
      .delete("/api/posts/comments/99999999-9999-4999-8999-999999999999");

    expect(res.status).toBe(404);
  });
});
