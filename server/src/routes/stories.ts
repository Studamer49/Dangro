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
    requireUser(req);

    await prisma.story.deleteMany({ where: { expiresAt: { lt: new Date() } } });

    const stories = await prisma.story.findMany({
      where: { expiresAt: { gt: new Date() } },
      include: { author: { select: { id: true, username: true, avatar: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const order: string[] = [];
    const byAuthor = new Map<
      string,
      { author: (typeof stories)[number]["author"]; stories: (typeof stories)[number][] }
    >();
    for (const story of stories) {
      let group = byAuthor.get(story.authorId);
      if (!group) {
        group = { author: story.author, stories: [] };
        byAuthor.set(story.authorId, group);
        order.push(story.authorId);
      }
      group.stories.push(story);
    }

    ok(res, { stories: order.map((authorId) => byAuthor.get(authorId)!) });
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
