import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticate, AuthRequest, requireUser } from "../middleware/auth.js";
import { AppError, asyncHandler, ok, parseOrThrow } from "../lib/http.js";
import { paramId } from "../lib/access.js";

const router = Router();

const createPostSchema = z.object({
  caption: z.string().max(2200).optional(),
  media: z
    .array(
      z.object({
        url: z.string().max(500),
        type: z.enum(["image", "video"]),
        width: z.number().int().min(0).max(10000).optional(),
        height: z.number().int().min(0).max(10000).optional(),
      })
    )
    .min(1)
    .max(10),
});

const createCommentSchema = z.object({ content: z.string().trim().min(1).max(500) });

const baseInclude = {
  author: { select: { id: true, username: true, avatar: true } },
  media: { orderBy: { order: "asc" as const } },
  _count: { select: { likes: true, comments: true } },
} as const;

function withViewer(userId: string) {
  return { ...baseInclude, likes: { where: { userId }, select: { id: true } } };
}

router.post(
  "/",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const { caption, media } = parseOrThrow(createPostSchema, req.body);

    const post = await prisma.post.create({
      data: {
        authorId: userId,
        caption,
        media: {
          create: media.map((m, i) => ({
            url: m.url,
            type: m.type,
            order: i,
            width: m.width,
            height: m.height,
          })),
        },
      },
      include: withViewer(userId),
    });

    ok(res, { post }, 201);
  })
);

router.get(
  "/feed",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);

    const following = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });
    const authorIds = [userId, ...following.map((f) => f.followingId)];

    const posts = await prisma.post.findMany({
      where: { authorId: { in: authorIds } },
      include: withViewer(userId),
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    ok(res, { posts });
  })
);

router.get(
  "/user/:userId",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const viewerId = requireUser(req);
    const authorId = paramId(req.params.userId, "user id");

    const posts = await prisma.post.findMany({
      where: { authorId },
      include: withViewer(viewerId),
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    ok(res, { posts });
  })
);

router.get(
  "/:id",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const id = paramId(req.params.id, "post id");

    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        ...withViewer(userId),
        comments: {
          include: { author: { select: { id: true, username: true, avatar: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!post) throw AppError.of("NOT_FOUND", "Post not found");

    ok(res, { post });
  })
);

router.delete(
  "/:id",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const id = paramId(req.params.id, "post id");

    const post = await prisma.post.findUnique({ where: { id }, select: { authorId: true } });
    if (!post) throw AppError.of("NOT_FOUND", "Post not found");
    if (post.authorId !== userId) throw AppError.of("FORBIDDEN", "You can only delete your own posts");

    await prisma.post.delete({ where: { id } });

    ok(res, { message: "Post deleted" });
  })
);

router.post(
  "/:id/like",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const postId = paramId(req.params.id, "post id");

    const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) throw AppError.of("NOT_FOUND", "Post not found");

    const existing = await prisma.postLike.findUnique({
      where: { postId_userId: { postId, userId } },
    });

    if (existing) {
      await prisma.postLike.delete({ where: { id: existing.id } });
    } else {
      await prisma.postLike.create({ data: { postId, userId } });
    }

    const likeCount = await prisma.postLike.count({ where: { postId } });

    ok(res, { liked: !existing, likeCount });
  })
);

router.get(
  "/:id/comments",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const postId = paramId(req.params.id, "post id");

    const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) throw AppError.of("NOT_FOUND", "Post not found");

    const comments = await prisma.postComment.findMany({
      where: { postId },
      include: { author: { select: { id: true, username: true, avatar: true } } },
      orderBy: { createdAt: "asc" },
    });

    ok(res, { comments });
  })
);

router.post(
  "/:id/comments",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const postId = paramId(req.params.id, "post id");
    const { content } = parseOrThrow(createCommentSchema, req.body);

    const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) throw AppError.of("NOT_FOUND", "Post not found");

    const comment = await prisma.postComment.create({
      data: { postId, authorId: userId, content },
      include: { author: { select: { id: true, username: true, avatar: true } } },
    });

    ok(res, { comment }, 201);
  })
);

export default router;
