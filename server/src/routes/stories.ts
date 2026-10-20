import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticate, AuthRequest, requireUser } from "../middleware/auth.js";
import { AppError, asyncHandler, ok, parseOrThrow } from "../lib/http.js";
import { paramId } from "../lib/access.js";
import { mediaUrl } from "../lib/urls.js";
import { destroyImageForUrl } from "../lib/cloudinary.js";

const router = Router();

/**
 * Removes stories that have outlived `expiresAt`.
 *
 * This used to run inline in `GET /`, which made a read endpoint do an
 * unbounded collection-wide delete on every request from every caller. The
 * read already filters `expiresAt: { gt: now }`, so the sweep never affected
 * the response — it is pure housekeeping, and housekeeping belongs on a timer
 * (`startStorySweep` in index.ts) rather than in the request path.
 */
export async function purgeExpiredStories(): Promise<number> {
  const result = await prisma.story.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return result.count ?? 0;
}

const createStorySchema = z.object({
  mediaUrl: mediaUrl(),
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

    const [following, friendships, blocks] = await Promise.all([
      prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } }),
      prisma.friend.findMany({
        where: { OR: [{ userId }, { friendId: userId }] },
        select: { userId: true, friendId: true },
      }),
      prisma.block.findMany({
        where: { OR: [{ userId }, { blockedId: userId }] },
        select: { userId: true, blockedId: true },
      }),
    ]);

    // A block is a wall in both directions, so either side removes the other
    // from the story ring. Blocking does not delete the `Follow`/`Friend` rows,
    // so without this the two lookups above kept re-admitting a blocked user.
    const walled = new Set<string>();
    for (const block of blocks) {
      if (block.userId !== userId) walled.add(block.userId);
      if (block.blockedId !== userId) walled.add(block.blockedId);
    }

    const visibleIds = new Set<string>([userId, ...following.map((f) => f.followingId)]);
    for (const f of friendships) {
      visibleIds.add(f.userId);
      visibleIds.add(f.friendId);
    }
    for (const id of walled) visibleIds.delete(id);

    const stories = await prisma.story.findMany({
      where: {
        expiresAt: { gt: new Date() },
        authorId: { in: [...visibleIds] },
      },
      include: {
        author: { select: { id: true, username: true, avatar: true } },
        likes: { select: { userId: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    // The client only needs the count and whether the viewer is one of them,
    // so the raw like rows never leave the server.
    type Row = (typeof stories)[number];
    type Serialized = Omit<Row, "likes"> & { likeCount: number; liked: boolean };
    const serialize = (story: Row): Serialized => {
      const { likes, ...rest } = story;
      return {
        ...rest,
        likeCount: likes.length,
        liked: likes.some((like) => like.userId === userId),
      };
    };

    const order: string[] = [];
    const byAuthor = new Map<string, { author: Row["author"]; stories: Serialized[] }>();
    for (const story of stories) {
      // A story whose author could not be loaded (deleted account) would
      // otherwise produce a group with a null author, which the client then
      // dereferences. Skip them rather than emit an unusable group.
      if (!story.author) continue;
      let group = byAuthor.get(story.authorId);
      if (!group) {
        group = { author: story.author, stories: [] };
        byAuthor.set(story.authorId, group);
        order.push(story.authorId);
      }
      group.stories.push(serialize(story));
    }

    ok(res, { stories: order.map((authorId) => byAuthor.get(authorId)!) });
  })
);

router.post(
  "/:id/like",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const storyId = paramId(req.params.id, "story id");

    const story = await prisma.story.findUnique({ where: { id: storyId }, select: { id: true } });
    if (!story) throw AppError.of("NOT_FOUND", "Story not found");

    const existing = await prisma.storyLike.findUnique({
      where: { storyId_userId: { storyId, userId } },
    });

    if (existing) {
      await prisma.storyLike.delete({ where: { id: existing.id } });
    } else {
      await prisma.storyLike.create({ data: { storyId, userId } });
    }

    const likeCount = await prisma.storyLike.count({ where: { storyId } });

    ok(res, { liked: !existing, likeCount });
  })
);

/**
 * Who liked a story. Author-only, mirroring the post likers endpoint: the tally
 * is public, the names behind it are not.
 */
router.get(
  "/:id/likes",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const storyId = paramId(req.params.id, "story id");

    const story = await prisma.story.findUnique({ where: { id: storyId }, select: { authorId: true } });
    if (!story) throw AppError.of("NOT_FOUND", "Story not found");
    if (story.authorId !== userId) {
      throw AppError.of("FORBIDDEN", "Only the author can see who liked this story");
    }

    const likes = await prisma.storyLike.findMany({
      where: { storyId },
      include: { user: { select: { id: true, username: true, avatar: true } } },
      orderBy: { createdAt: "desc" },
    });

    ok(res, { users: likes.map((like) => like.user) });
  })
);

router.patch(
  "/:id",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const id = paramId(req.params.id, "story id");
    const { mediaUrl, mediaType } = parseOrThrow(createStorySchema, req.body);

    const story = await prisma.story.findUnique({
      where: { id },
      select: { authorId: true, expiresAt: true, mediaUrl: true },
    });
    if (!story || story.authorId !== userId) throw AppError.of("NOT_FOUND", "Story not found");

    // Editing an expired story would resurrect content the viewer may already
    // have seen the end of; replace it only while it is still live.
    if (story.expiresAt && story.expiresAt.getTime() <= Date.now()) {
      throw AppError.of("CONFLICT", "This story has already expired");
    }

    const updated = await prisma.story.update({
      where: { id },
      data: { mediaUrl, mediaType },
      include: { author: { select: { id: true, username: true, avatar: true } } },
    });

    // The image the story used to show is now unreachable, so remove it from
    // the media library rather than leaving it there for ever. Best effort:
    // the edit itself has already succeeded.
    if (story.mediaUrl && story.mediaUrl !== mediaUrl) {
      await destroyImageForUrl(story.mediaUrl, `story ${id}`);
    }

    ok(res, { story: updated });
  })
);

router.delete(
  "/:id",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const id = paramId(req.params.id, "story id");

    const story = await prisma.story.findUnique({ where: { id }, select: { authorId: true, mediaUrl: true } });
    if (!story || story.authorId !== userId) throw AppError.of("NOT_FOUND", "Story not found");

    await prisma.story.delete({ where: { id } });

    // Nobody can reach this image any more.
    await destroyImageForUrl(story.mediaUrl, `story ${id}`);

    ok(res, { message: "Story deleted" });
  })
);

export default router;
