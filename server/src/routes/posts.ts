import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";

const router = Router();

const createPostSchema = z.object({
  caption: z.string().max(2200).optional(),
  media: z.array(z.object({
    url: z.string(),
    type: z.string(),
    width: z.number().optional(),
    height: z.number().optional(),
  })).min(1).max(10),
});

const createCommentSchema = z.object({
  content: z.string().min(1).max(500),
});

router.post("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { caption, media } = createPostSchema.parse(req.body);

    const post = await prisma.post.create({
      data: {
        authorId: req.userId!,
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
      include: {
        author: { select: { id: true, username: true, avatar: true } },
        media: true,
        _count: { select: { likes: true, comments: true } },
      },
    });

    res.status(201).json({ post });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ message: err.errors[0].message });
      return;
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/feed", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const following = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });
    const followingIds = following.map((f) => f.followingId);
    const authorIds = [userId, ...followingIds];

    const posts = await prisma.post.findMany({
      where: { authorId: { in: authorIds } },
      include: {
        author: { select: { id: true, username: true, avatar: true } },
        media: { orderBy: { order: "asc" } },
        likes: { where: { userId }, select: { id: true } },
        _count: { select: { likes: true, comments: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json({ posts });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const post = await prisma.post.findUnique({
      where: { id: req.params.id as string },
      include: {
        author: { select: { id: true, username: true, avatar: true } },
        media: { orderBy: { order: "asc" } },
        likes: { where: { userId: req.userId! }, select: { id: true } },
        comments: {
          include: { author: { select: { id: true, username: true, avatar: true } } },
          orderBy: { createdAt: "asc" },
        },
        _count: { select: { likes: true, comments: true } },
      },
    });

    if (!post) throw new AppError("Post not found", 404);
    res.json({ post });
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ message: err.message });
      return;
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

router.delete("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const post = await prisma.post.findUnique({ where: { id: req.params.id as string } });
    if (!post) throw new AppError("Post not found", 404);
    if (post.authorId !== req.userId) throw new AppError("Not authorized", 403);
    await prisma.post.delete({ where: { id: req.params.id as string } });
    res.json({ message: "Post deleted" });
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ message: err.message });
      return;
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/:id/like", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const postId = req.params.id as string;
    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new AppError("Post not found", 404);

    const existing = await prisma.postLike.findUnique({
      where: { postId_userId: { postId, userId: req.userId! } },
    });

    if (existing) {
      await prisma.postLike.delete({ where: { id: existing.id } });
      res.json({ liked: false });
    } else {
      await prisma.postLike.create({
        data: { postId, userId: req.userId! },
      });
      res.json({ liked: true });
    }
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ message: err.message });
      return;
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/:id/comments", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const postId = req.params.id as string;
    const { content } = createCommentSchema.parse(req.body);

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new AppError("Post not found", 404);

    const comment = await prisma.postComment.create({
      data: { postId, authorId: req.userId!, content },
      include: { author: { select: { id: true, username: true, avatar: true } } },
    });

    res.status(201).json({ comment });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ message: err.errors[0].message });
      return;
    }
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ message: err.message });
      return;
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:id/comments", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const comments = await prisma.postComment.findMany({
      where: { postId: req.params.id as string },
      include: { author: { select: { id: true, username: true, avatar: true } } },
      orderBy: { createdAt: "asc" },
    });
    res.json({ comments });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
