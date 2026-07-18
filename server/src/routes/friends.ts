import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";

const router = Router();

const requestSchema = z.object({
  userId: z.string().uuid(),
});

const acceptSchema = z.object({
  requestId: z.string().uuid(),
});

router.get("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const friendships = await prisma.friend.findMany({
      where: {
        OR: [{ userId: req.userId }, { friendId: req.userId }],
      },
      include: {
        user: { select: { id: true, username: true, avatar: true, status: true } },
        friend: { select: { id: true, username: true, avatar: true, status: true } },
      },
    });

    const friends = friendships.map((f) => ({
      id: f.id,
      friend: f.userId === req.userId ? f.friend : f.user,
      createdAt: f.createdAt,
    }));

    res.json({ friends });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/requests", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const requests = await prisma.friendRequest.findMany({
      where: {
        receiverId: req.userId,
        status: "pending",
      },
      include: {
        sender: { select: { id: true, username: true, avatar: true, status: true } },
      },
    });

    res.json({ requests });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/request", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = requestSchema.parse(req.body);

    if (userId === req.userId) {
      throw new AppError("Cannot send friend request to yourself", 400);
    }

    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) {
      throw new AppError("User not found", 404);
    }

    const existingFriendship = await prisma.friend.findFirst({
      where: {
        OR: [
          { userId: req.userId, friendId: userId },
          { userId, friendId: req.userId },
        ],
      },
    });

    if (existingFriendship) {
      throw new AppError("Already friends", 400);
    }

    const existingRequest = await prisma.friendRequest.findFirst({
      where: {
        OR: [
          { senderId: req.userId, receiverId: userId },
          { senderId: userId, receiverId: req.userId },
        ],
      },
    });

    if (existingRequest) {
      throw new AppError("Friend request already exists", 400);
    }

    const friendRequest = await prisma.friendRequest.create({
      data: { senderId: req.userId!, receiverId: userId },
      include: {
        sender: { select: { id: true, username: true, avatar: true } },
      },
    });

    res.status(201).json({ request: friendRequest });
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

router.post("/accept", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { requestId } = acceptSchema.parse(req.body);

    const friendRequest = await prisma.friendRequest.findUnique({
      where: { id: requestId },
    });

    if (!friendRequest) {
      throw new AppError("Friend request not found", 404);
    }

    if (friendRequest.receiverId !== req.userId) {
      throw new AppError("Not authorized", 403);
    }

    if (friendRequest.status !== "pending") {
      throw new AppError("Friend request already processed", 400);
    }

    await prisma.$transaction([
      prisma.friendRequest.update({
        where: { id: requestId },
        data: { status: "accepted" },
      }),
      prisma.friend.create({
        data: {
          userId: friendRequest.senderId,
          friendId: friendRequest.receiverId,
        },
      }),
      prisma.friend.create({
        data: {
          userId: friendRequest.receiverId,
          friendId: friendRequest.senderId,
        },
      }),
    ]);

    res.json({ message: "Friend request accepted" });
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

router.delete("/remove/:friendId", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const friendId = req.params.friendId as string;

    await prisma.friend.deleteMany({
      where: {
        OR: [
          { userId: req.userId, friendId },
          { userId: friendId, friendId: req.userId },
        ],
      },
    });

    res.json({ message: "Friend removed" });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
