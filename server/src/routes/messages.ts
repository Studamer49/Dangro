import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { getIO } from "../socket/io.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";

const router = Router();

const sendMessageSchema = z.object({
  content: z.string().min(1).max(4000),
  channelId: z.string().uuid(),
  replyToId: z.string().uuid().optional(),
});

const editMessageSchema = z.object({
  content: z.string().min(1).max(4000),
});

const messageInclude = {
  author: { select: { id: true, username: true, avatar: true } },
  replyTo: {
    include: { author: { select: { id: true, username: true } } },
  },
  reactions: true,
  attachments: true,
};

router.post("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { content, channelId, replyToId } = sendMessageSchema.parse(req.body);

    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: { server: { include: { members: { where: { userId: req.userId } } } } },
    });

    if (!channel) {
      throw new AppError("Channel not found", 404);
    }

    if (channel.server.members.length === 0) {
      throw new AppError("Not a member of this server", 403);
    }

    const message = await prisma.message.create({
      data: {
        content,
        authorId: req.userId!,
        channelId,
        replyToId: replyToId || undefined,
      },
      include: messageInclude,
    });

    const io = getIO();
    if (io) {
      io.to(`channel:${channelId}`).emit("new_message", message);
    }

    res.status(201).json({ message });
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

router.get("/:channelId", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const channelId = req.params.channelId as string;
    const messages = await prisma.message.findMany({
      where: { channelId },
      include: {
        ...messageInclude,
        reactions: {
          include: { user: { select: { id: true, username: true } } },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    });

    res.json({ messages });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
});

router.patch("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { content } = editMessageSchema.parse(req.body);
    const messageId = req.params.id as string;

    const message = await prisma.message.findUnique({ where: { id: messageId } });

    if (!message) {
      throw new AppError("Message not found", 404);
    }

    if (message.authorId !== req.userId) {
      throw new AppError("Not authorized", 403);
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { content, edited: true },
      include: messageInclude,
    });

    const io = getIO();
    if (io) {
      io.to(`channel:${message.channelId}`).emit("message_edited", updated);
    }

    res.json({ message: updated });
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
    const messageId = req.params.id as string;
    const message = await prisma.message.findUnique({ where: { id: messageId } });

    if (!message) {
      throw new AppError("Message not found", 404);
    }

    if (message.authorId !== req.userId) {
      throw new AppError("Not authorized", 403);
    }

    await prisma.message.delete({ where: { id: messageId } });

    const io = getIO();
    if (io) {
      io.to(`channel:${message.channelId}`).emit("message_deleted", { messageId });
    }

    res.json({ message: "Message deleted" });
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ message: err.message });
      return;
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/:id/reactions", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { emoji } = z.object({ emoji: z.string().min(1).max(10) }).parse(req.body);
    const messageId = req.params.id as string;

    const message = await prisma.message.findUnique({ where: { id: messageId } });

    if (!message) {
      throw new AppError("Message not found", 404);
    }

    const existing = await prisma.reaction.findUnique({
      where: {
        userId_messageId_emoji: {
          userId: req.userId!,
          messageId,
          emoji,
        },
      },
    });

    if (existing) {
      await prisma.reaction.delete({ where: { id: existing.id } });
    } else {
      await prisma.reaction.create({
        data: { userId: req.userId!, messageId, emoji },
      });
    }

    const updatedMessage = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        reactions: {
          include: { user: { select: { id: true, username: true } } },
        },
      },
    });

    const io = getIO();
    if (io && updatedMessage) {
      io.to(`channel:${message.channelId}`).emit("message_reactions_updated", {
        messageId,
        reactions: updatedMessage.reactions,
      });
    }

    res.json({ message: existing ? "Reaction removed" : "Reaction added" });
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
