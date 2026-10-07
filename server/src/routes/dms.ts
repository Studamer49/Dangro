import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { getIO } from "../socket/io.js";
import { authenticate, AuthRequest, requireUser } from "../middleware/auth.js";
import { AppError, asyncHandler, ok, parseOrThrow } from "../lib/http.js";
import { assertConversationMember, assertDirectMessageReply, paramId } from "../lib/access.js";

const router = Router();

const startConversationSchema = z.object({ userId: z.string().uuid() });

const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  attachmentUrl: z.string().max(500).optional(),
  attachmentType: z.string().max(100).optional(),
  replyToId: z.string().uuid().nullish(),
});

const dmInclude = {
  sender: { select: { id: true, username: true, avatar: true, status: true } },
  replyTo: { include: { sender: { select: { id: true, username: true } } } },
} as const;

router.get(
  "/",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);

    const conversations = await prisma.conversation.findMany({
      where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
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
        const unreadCount =
          lastMessage && lastMessage.senderId !== userId && !lastMessage.readAt
            ? await prisma.directMessage.count({
                where: { conversationId: c.id, senderId: { not: userId }, readAt: null },
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

    ok(res, { conversations: result });
  })
);

router.post(
  "/start",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const { userId: otherUserId } = parseOrThrow(startConversationSchema, req.body);

    if (userId === otherUserId) {
      throw AppError.of("BAD_REQUEST", "Cannot start a conversation with yourself");
    }

    const otherUser = await prisma.user.findUnique({
      where: { id: otherUserId },
      select: { id: true, username: true, avatar: true, status: true },
    });
    if (!otherUser) throw AppError.of("NOT_FOUND", "User not found");

    const sortedIds = [userId, otherUserId].sort();
    let conversation = await prisma.conversation.findUnique({
      where: { user1Id_user2Id: { user1Id: sortedIds[0], user2Id: sortedIds[1] } },
      include: {
        user1: { select: { id: true, username: true, avatar: true, status: true } },
        user2: { select: { id: true, username: true, avatar: true, status: true } },
      },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { user1Id: sortedIds[0], user2Id: sortedIds[1] },
        include: {
          user1: { select: { id: true, username: true, avatar: true, status: true } },
          user2: { select: { id: true, username: true, avatar: true, status: true } },
        },
      });
    }

    const other = conversation.user1Id === userId ? conversation.user2 : conversation.user1;

    ok(res, {
      conversation: {
        id: conversation.id,
        otherUser: other,
        lastMessage: null,
        lastMessageAt: conversation.lastMessageAt,
        unreadCount: 0,
      },
    });
  })
);

router.get(
  "/:conversationId",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const conversationId = paramId(req.params.conversationId, "conversation id");

    await assertConversationMember(conversationId, userId);

    const messages = await prisma.directMessage.findMany({
      where: { conversationId },
      include: dmInclude,
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    ok(res, { messages: messages.reverse() });
  })
);

router.post(
  "/:conversationId",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const conversationId = paramId(req.params.conversationId, "conversation id");
    const { content, attachmentUrl, attachmentType, replyToId } = parseOrThrow(sendMessageSchema, req.body);

    const conversation = await assertConversationMember(conversationId, userId);
    await assertDirectMessageReply(replyToId, conversationId);

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

    ok(res, { message }, 201);
  })
);

router.patch(
  "/:conversationId/read",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const conversationId = paramId(req.params.conversationId, "conversation id");

    const conversation = await assertConversationMember(conversationId, userId);

    await prisma.directMessage.updateMany({
      where: { conversationId, senderId: { not: userId }, readAt: null },
      data: { readAt: new Date() },
    });

    const otherUserId = conversation.user1Id === userId ? conversation.user2Id : conversation.user1Id;

    const io = getIO();
    if (io) {
      io.to(`dm:${conversationId}`).emit("dm_read", { conversationId, readBy: userId });
      io.to(`user:${otherUserId}`).emit("dm_read_receipt", { conversationId, readBy: userId });
    }

    ok(res, { message: "Messages marked as read" });
  })
);

export default router;
