import { Router } from "express";
import { prisma } from "../prisma.js";
import { authenticate, AuthRequest, requireUser } from "../middleware/auth.js";
import { AppError, asyncHandler, ok } from "../lib/http.js";
import { paramId } from "../lib/access.js";
import { createNotification } from "../lib/notifications.js";

const router = Router();

const userSelect = { id: true, username: true, avatar: true, status: true } as const;

router.post(
  "/:userId",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const targetUserId = paramId(req.params.userId, "user id");

    if (userId === targetUserId) throw AppError.of("BAD_REQUEST", "Cannot follow yourself");

    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
    if (!targetUser) throw AppError.of("NOT_FOUND", "User not found");

    const existing = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: userId, followingId: targetUserId } },
    });

    if (existing) {
      await prisma.follow.delete({ where: { id: existing.id } });
    } else {
      await prisma.follow.create({ data: { followerId: userId, followingId: targetUserId } });
      void createNotification({
        userId: targetUserId,
        type: "follow",
        message: "Started following you",
        fromUserId: userId,
      });
    }

    const followerCount = await prisma.follow.count({ where: { followingId: targetUserId } });

    ok(res, { isFollowing: !existing, followerCount });
  })
);

router.get(
  "/:userId",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const targetUserId = paramId(req.params.userId, "user id");

    const isFollowing = !!(await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: userId, followingId: targetUserId } },
    }));

    const followerCount = await prisma.follow.count({ where: { followingId: targetUserId } });
    const followingCount = await prisma.follow.count({ where: { followerId: targetUserId } });

    ok(res, { isFollowing, followerCount, followingCount });
  })
);

router.get(
  "/:userId/followers",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const targetUserId = paramId(req.params.userId, "user id");

    const follows = await prisma.follow.findMany({
      where: { followingId: targetUserId },
      include: { follower: { select: userSelect } },
    });

    ok(res, { followers: follows.map((f) => f.follower) });
  })
);

router.get(
  "/:userId/following",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const targetUserId = paramId(req.params.userId, "user id");

    const follows = await prisma.follow.findMany({
      where: { followerId: targetUserId },
      include: { following: { select: userSelect } },
    });

    ok(res, { following: follows.map((f) => f.following) });
  })
);

export default router;
