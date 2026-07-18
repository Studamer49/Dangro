import { Router, Response } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";

const router = Router();

const createServerSchema = z.object({
  name: z.string().min(1).max(100),
  icon: z.string().url().optional(),
});

const updateServerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  icon: z.string().url().optional(),
});

router.get("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const servers = await prisma.server.findMany({
      where: {
        members: { some: { userId: req.userId } },
      },
      include: {
        channels: { take: 1 },
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ servers });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { name, icon } = createServerSchema.parse(req.body);

    const server = await prisma.server.create({
      data: {
        name,
        icon,
        ownerId: req.userId!,
        inviteCode: uuidv4().slice(0, 8),
        members: {
          create: { userId: req.userId!, role: "owner" },
        },
        channels: {
          create: [{ name: "general", type: "text" }],
        },
      },
      include: {
        channels: true,
      },
    });

    res.status(201).json({ server });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ message: err.errors[0].message });
      return;
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/join/:inviteCode", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const server = await prisma.server.findUnique({
      where: { inviteCode: req.params.inviteCode as string },
    });

    if (!server) {
      throw new AppError("Server not found", 404);
    }

    const existingMember = await prisma.member.findUnique({
      where: {
        userId_serverId: { userId: req.userId!, serverId: server.id },
      },
    });

    if (existingMember) {
      res.json({ server });
      return;
    }

    await prisma.member.create({
      data: { userId: req.userId!, serverId: server.id },
    });

    res.json({ server });
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ message: err.message });
      return;
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

router.patch("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = updateServerSchema.parse(req.body);

    const member = await prisma.member.findUnique({
      where: {
        userId_serverId: { userId: req.userId!, serverId: req.params.id as string },
      },
    });

    if (!member || (member.role !== "owner" && member.role !== "admin")) {
      throw new AppError("Not authorized", 403);
    }

    const server = await prisma.server.update({
      where: { id: req.params.id as string },
      data,
    });

    res.json({ server });
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

router.delete("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const server = await prisma.server.findUnique({
      where: { id: req.params.id as string },
    });

    if (!server || server.ownerId !== req.userId) {
      throw new AppError("Not authorized", 403);
    }

    await prisma.server.delete({ where: { id: req.params.id as string } });

    res.json({ message: "Server deleted" });
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ message: err.message });
      return;
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
