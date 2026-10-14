import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticate, AuthRequest, requireUser } from "../middleware/auth.js";
import { AppError, asyncHandler, ok, parseOrThrow } from "../lib/http.js";
import { paramId } from "../lib/access.js";
import { mediaUrl } from "../lib/urls.js";
import { destroyImageForUrl } from "../lib/cloudinary.js";

const router = Router();

const createPostSchema = z
  .object({
    caption: z.string().max(2200).optional(),
    media: z
      .array(
        z.object({
          url: mediaUrl(),
          type: z.enum(["image", "video"]),
          width: z.number().int().min(0).max(10000).optional(),
          height: z.number().int().min(0).max(10000).optional(),
        })
      )
      .max(10)
      .default([]),
  })
  // A post with neither words nor media has nothing to show.
  .refine((value) => Boolean(value.caption?.trim()) || value.media.length > 0, {
    message: "Add a caption or some media",
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

    const posts = await prisma.post.findMany({
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

    const author = await prisma.user.findUnique({
      where: { id: authorId },
      select: { isPrivate: true },
    });
    if (!author) throw AppError.of("NOT_FOUND", "User not found");

    // A private profile hides its posts from everyone except itself and the
    // people it has accepted a follow from. Enforced here as well as in the UI,
    // because the profile page is not the only way to reach this endpoint.
    if (author.isPrivate && viewerId !== authorId) {
      const follows = await prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: viewerId, followingId: authorId } },
        select: { id: true },
      });
      if (!follows) {
        ok(res, { posts: [] });
        return;
      }
    }

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

const updatePostSchema = z
  .object({ caption: z.string().trim().max(2200).nullish() })
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update" });

const updateCommentSchema = z.object({ content: z.string().trim().min(1).max(500) });

router.patch(
  "/:id",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const id = paramId(req.params.id, "post id");
    const input = parseOrThrow(updatePostSchema, req.body);

    const post = await prisma.post.findUnique({ where: { id }, select: { authorId: true } });
    if (!post) throw AppError.of("NOT_FOUND", "Post not found");
    if (post.authorId !== userId) throw AppError.of("FORBIDDEN", "You can only edit your own posts");

    const updated = await prisma.post.update({
      where: { id },
      // An emptied caption means "no caption": storing "" would leave a post
      // that renders a blank line under the author name forever.
      data: {
        caption:
          input.caption === undefined
            ? undefined
            : input.caption === null || input.caption.trim() === ""
              ? null
              : input.caption,
      },
      include: withViewer(userId),
    });

    ok(res, { post: updated });
  })
);

router.delete(
  "/:id",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const id = paramId(req.params.id, "post id");

    // `media` is read here, not after the delete, because the cascade removes
    // the rows with the post and the delivery URLs would be gone with them.
    const post = await prisma.post.findUnique({
      where: { id },
      select: { authorId: true, media: { select: { url: true } } },
    });
    if (!post) throw AppError.of("NOT_FOUND", "Post not found");
    if (post.authorId !== userId) throw AppError.of("FORBIDDEN", "You can only delete your own posts");

    await prisma.post.delete({ where: { id } });

    // Each image is addressed by its own public ID, so these are unrelated
    // assets even when a post reuses one. Best effort, after the delete.
    for (const item of post.media ?? []) {
      await destroyImageForUrl(item.url, `post ${id}`);
    }

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

/** Edit a comment you wrote. Mirrors the message edit route. */
router.patch(
  "/comments/:commentId",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const commentId = paramId(req.params.commentId, "comment id");
    const { content } = parseOrThrow(updateCommentSchema, req.body);

    const comment = await prisma.postComment.findUnique({
      where: { id: commentId },
      select: { authorId: true },
    });
    if (!comment) throw AppError.of("NOT_FOUND", "Comment not found");
    if (comment.authorId !== userId) throw AppError.of("FORBIDDEN", "You can only edit your own comments");

    const updated = await prisma.postComment.update({
      where: { id: commentId },
      data: { content },
      include: { author: { select: { id: true, username: true, avatar: true } } },
    });

    ok(res, { comment: updated });
  })
);

router.delete(
  "/comments/:commentId",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const commentId = paramId(req.params.commentId, "comment id");

    const comment = await prisma.postComment.findUnique({
      where: { id: commentId },
      select: { authorId: true },
    });
    if (!comment) throw AppError.of("NOT_FOUND", "Comment not found");
    if (comment.authorId !== userId) {
      throw AppError.of("FORBIDDEN", "You can only delete your own comments");
    }

    await prisma.postComment.delete({ where: { id: commentId } });

    ok(res, { message: "Comment deleted" });
  })
);

export default router;
