import { Router, Response } from "express";
import { prisma } from "../prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";

const router = Router();

router.post("/:userId", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const targetUserId = req.params.userId as string;
    const userId = req.userId!;

    if (userId === targetUserId) {
      throw new AppError("Cannot follow yourself", 400);
    }

    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) throw new AppError("User not found", 404);

    const existing = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: userId, followingId: targetUserId } },
    });

    if (existing) {
      await prisma.follow.delete({ where: { id: existing.id } });
      res.json({ isFollowing: false });
    } else {
      await prisma.follow.create({
        data: { followerId: userId, followingId: targetUserId },
      });
      res.json({ isFollowing: true });
    }
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ message: err.message });
      return;
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:userId", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const targetUserId = req.params.userId as string;
    const userId = req.userId!;

    const isFollowing = !!(await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: userId, followingId: targetUserId } },
    }));

    const followerCount = await prisma.follow.count({ where: { followingId: targetUserId } });
    const followingCount = await prisma.follow.count({ where: { followerId: targetUserId } });

    res.json({ isFollowing, followerCount, followingCount });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:userId/followers", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const followers = await prisma.follow.findMany({
      where: { followingId: req.params.userId as string },
      include: { follower: { select: { id: true, username: true, avatar: true } } },
    });
    res.json({ followers: followers.map((f) => f.follower) });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:userId/following", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const following = await prisma.follow.findMany({
      where: { followerId: req.params.userId as string },
      include: { following: { select: { id: true, username: true, avatar: true } } },
    });
    res.json({ following: following.map((f) => f.following) });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
