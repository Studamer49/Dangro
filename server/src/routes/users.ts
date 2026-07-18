import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";

const router = Router();

const updateProfileSchema = z.object({
  username: z.string().min(3).max(32).optional(),
  bio: z.string().max(500).optional(),
  status: z.enum(["online", "idle", "dnd", "offline"]).optional(),
});

router.get("/search", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const query = req.query.q as string;

    if (!query || query.length < 2) {
      res.json({ users: [] });
      return;
    }

    const users = await prisma.user.findMany({
      where: {
        username: { contains: query, mode: "insensitive" },
        id: { not: req.userId! },
      },
      select: {
        id: true,
        username: true,
        avatar: true,
        bio: true,
        status: true,
      },
      take: 20,
    });

    res.json({ users });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id as string },
      select: {
        id: true,
        username: true,
        bio: true,
        avatar: true,
        status: true,
        lastSeen: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    res.json({ user });
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ message: err.message });
      return;
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

router.patch("/me", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = updateProfileSchema.parse(req.body);

    if (data.username) {
      const existing = await prisma.user.findFirst({
        where: { username: data.username, id: { not: req.userId! } },
      });
      if (existing) {
        throw new AppError("Username already taken", 409);
      }
    }

    const user = await prisma.user.update({
      where: { id: req.userId! },
      data,
      select: {
        id: true,
        username: true,
        email: true,
        bio: true,
        avatar: true,
        status: true,
        lastSeen: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({ user });
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

export default router;
