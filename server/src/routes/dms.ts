import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { getIO } from "../socket/io.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";

const router = Router();

const startConversationSchema = z.object({
  userId: z.string().uuid(),
});

const sendMessageSchema = z.object({
  content: z.string().min(1).max(4000),
  attachmentUrl: z.string().optional(),
  attachmentType: z.string().optional(),
  replyToId: z.string().uuid().optional(),
});

const dmInclude = {
  sender: { select: { id: true, username: true, avatar: true, status: true } },
  replyTo: {
    include: { sender: { select: { id: true, username: true } } },
  },
};

function getConversationId(userId1: string, userId2: string): string {
  return [userId1, userId2].sort().join("_");
}

router.get("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
      include: {
        user1: { select: { id: true, username: true, avatar: true, status: true } },
        user2: { select: { id: true, username: true, avatar: true, status: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { sender: { select: { id: true, username: true } } },
        },
      },
      orderBy: { lastMessageAt: "desc" },
    });

    const result = await Promise.all(
      conversations.map(async (c) => {
        const otherUser = c.user1Id === userId ? c.user2 : c.user1;
        const lastMessage = c.messages[0] || null;
        const unreadCount = lastMessage && lastMessage.senderId !== userId && !lastMessage.readAt
          ? await prisma.directMessage.count({
              where: {
                conversationId: c.id,
                senderId: { not: userId },
                readAt: null,
              },
            })
          : 0;

        return {
          id: c.id,
          otherUser,
          lastMessage,
          lastMessageAt: c.lastMessageAt,
          unreadCount,
        };
      })
    );

    res.json({ conversations: result });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/start", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { userId: otherUserId } = startConversationSchema.parse(req.body);
    const userId = req.userId!;

    if (userId === otherUserId) {
      throw new AppError("Cannot start conversation with yourself", 400);
    }

    const otherUser = await prisma.user.findUnique({ where: { id: otherUserId } });
    if (!otherUser) {
      throw new AppError("User not found", 404);
    }

    const sortedIds = [userId, otherUserId].sort();
    let conversation = await prisma.conversation.findUnique({
      where: {
        user1Id_user2Id: { user1Id: sortedIds[0], user2Id: sortedIds[1] },
      },
      include: {
        user1: { select: { id: true, username: true, avatar: true, status: true } },
        user2: { select: { id: true, username: true, avatar: true, status: true } },
      },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          user1Id: sortedIds[0],
          user2Id: sortedIds[1],
        },
        include: {
          user1: { select: { id: true, username: true, avatar: true, status: true } },
          user2: { select: { id: true, username: true, avatar: true, status: true } },
        },
      });
    }

    const other = conversation.user1Id === userId ? conversation.user2 : conversation.user1;

    res.json({
      conversation: {
        id: conversation.id,
        otherUser: other,
        lastMessage: null,
        lastMessageAt: conversation.lastMessageAt,
        unreadCount: 0,
      },
    });
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

router.get("/:conversationId", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const conversationId = req.params.conversationId as string;
    const userId = req.userId!;

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new AppError("Conversation not found", 404);
    }

    if (conversation.user1Id !== userId && conversation.user2Id !== userId) {
      throw new AppError("Not authorized", 403);
    }

    const messages = await prisma.directMessage.findMany({
      where: { conversationId },
      include: dmInclude,
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json({ messages: messages.reverse() });
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ message: err.message });
      return;
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/:conversationId", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const conversationId = req.params.conversationId as string;
    const userId = req.userId!;
    const { content, attachmentUrl, attachmentType, replyToId } = sendMessageSchema.parse(req.body);

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new AppError("Conversation not found", 404);
    }

    if (conversation.user1Id !== userId && conversation.user2Id !== userId) {
      throw new AppError("Not authorized", 403);
    }

    const otherUserId = conversation.user1Id === userId ? conversation.user2Id : conversation.user1Id;

    const message = await prisma.directMessage.create({
      data: {
        content,
        senderId: userId,
        conversationId,
        attachmentUrl: attachmentUrl || undefined,
        attachmentType: attachmentType || undefined,
        replyToId: replyToId || undefined,
        deliveredAt: new Date(),
      },
      include: dmInclude,
    });

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });

    const io = getIO();
    if (io) {
      io.to(`dm:${conversationId}`).emit("new_dm", message);
      io.to(`user:${otherUserId}`).emit("dm_updated", {
        conversationId,
        lastMessage: {
          id: message.id,
          content: message.content,
          senderId: message.senderId,
          createdAt: message.createdAt,
        },
      });
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

router.patch("/:conversationId/read", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const conversationId = req.params.conversationId as string;
    const userId = req.userId!;

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new AppError("Conversation not found", 404);
    }

    if (conversation.user1Id !== userId && conversation.user2Id !== userId) {
      throw new AppError("Not authorized", 403);
    }

    await prisma.directMessage.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    const otherUserId = conversation.user1Id === userId ? conversation.user2Id : conversation.user1Id;

    const io = getIO();
    if (io) {
      io.to(`dm:${conversationId}`).emit("dm_read", {
        conversationId,
        readBy: userId,
      });
      io.to(`user:${otherUserId}`).emit("dm_read_receipt", {
        conversationId,
        readBy: userId,
      });
    }

    res.json({ message: "Messages marked as read" });
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ message: err.message });
      return;
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
