import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";

const router = Router();

const createChannelSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["text", "voice"]),
  serverId: z.string().uuid(),
});

router.post("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { name, type, serverId } = createChannelSchema.parse(req.body);

    const member = await prisma.member.findUnique({
      where: {
        userId_serverId: { userId: req.userId!, serverId },
      },
    });

    if (!member) {
      throw new AppError("Not a member of this server", 403);
    }

    const channel = await prisma.channel.create({
      data: { name, type, serverId },
    });

    res.status(201).json({ channel });
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

router.get("/:channelId/server", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const channelId = req.params.channelId as string;
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: {
        server: {
          include: {
            channels: true,
            members: {
              include: {
                user: { select: { id: true, username: true, avatar: true, status: true } },
              },
            },
          },
        },
      },
    });

    if (!channel) {
      throw new AppError("Channel not found", 404);
    }

    res.json({ server: channel.server });
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ message: err.message });
      return;
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
