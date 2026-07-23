import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";

const router = Router();

const createStorySchema = z.object({
  mediaUrl: z.string(),
  mediaType: z.enum(["image", "video"]),
});

router.post("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { mediaUrl, mediaType } = createStorySchema.parse(req.body);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const story = await prisma.story.create({
      data: {
        authorId: req.userId!,
        mediaUrl,
        mediaType,
        expiresAt,
      },
      include: {
        author: { select: { id: true, username: true, avatar: true } },
      },
    });

    res.status(201).json({ story });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ message: err.errors[0].message });
      return;
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    await prisma.story.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    const following = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });
    const followingIds = following.map((f) => f.followingId);
    const authorIds = [userId, ...followingIds];

    const stories = await prisma.story.findMany({
      where: {
        authorId: { in: authorIds },
        expiresAt: { gt: new Date() },
      },
      include: {
        author: { select: { id: true, username: true, avatar: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const grouped = authorIds
      .map((authorId) => {
        const userStories = stories.filter((s) => s.authorId === authorId);
        if (userStories.length === 0) return null;
        return {
          author: userStories[0].author,
          stories: userStories,
        };
      })
      .filter(Boolean);

    res.json({ stories: grouped });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
});

router.delete("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const story = await prisma.story.findUnique({ where: { id: req.params.id as string } });
    if (!story || story.authorId !== req.userId) {
      res.status(404).json({ message: "Story not found" });
      return;
    }
    await prisma.story.delete({ where: { id: req.params.id as string } });
    res.json({ message: "Story deleted" });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
