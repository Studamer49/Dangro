import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticate, AuthRequest, requireUser } from "../middleware/auth.js";
import { AppError, asyncHandler, ok, parseOrThrow } from "../lib/http.js";
import { paramId } from "../lib/access.js";

const router = Router();

const createStorySchema = z.object({
  mediaUrl: z.string().max(500),
  mediaType: z.enum(["image", "video"]),
});

router.post(
  "/",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const { mediaUrl, mediaType } = parseOrThrow(createStorySchema, req.body);

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const story = await prisma.story.create({
      data: { authorId: userId, mediaUrl, mediaType, expiresAt },
      include: { author: { select: { id: true, username: true, avatar: true } } },
    });

    ok(res, { story }, 201);
  })
);

router.get(
  "/",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);

    await prisma.story.deleteMany({ where: { expiresAt: { lt: new Date() } } });

    const following = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });
    const authorIds = [userId, ...following.map((f) => f.followingId)];

    const stories = await prisma.story.findMany({
      where: { authorId: { in: authorIds }, expiresAt: { gt: new Date() } },
      include: { author: { select: { id: true, username: true, avatar: true } } },
      orderBy: { createdAt: "desc" },
    });

    const grouped = authorIds
      .map((authorId) => {
        const userStories = stories.filter((s) => s.authorId === authorId);
        if (userStories.length === 0) return null;
        return { author: userStories[0].author, stories: userStories };
      })
      .filter((group): group is NonNullable<typeof group> => group !== null);

    ok(res, { stories: grouped });
  })
);

router.delete(
  "/:id",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const id = paramId(req.params.id, "story id");

    const story = await prisma.story.findUnique({ where: { id }, select: { authorId: true } });
    if (!story || story.authorId !== userId) throw AppError.of("NOT_FOUND", "Story not found");

    await prisma.story.delete({ where: { id } });

    ok(res, { message: "Story deleted" });
  })
);

export default router;
