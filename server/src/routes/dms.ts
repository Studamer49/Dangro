import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { getIO } from "../socket/io.js";
import { authenticate, AuthRequest, requireUser } from "../middleware/auth.js";
import { AppError, asyncHandler, ok, parseOrThrow } from "../lib/http.js";
import { assertConversationMember, assertDirectMessageReply, paramId } from "../lib/access.js";
import { createNotification } from "../lib/notifications.js";

const router = Router();

const startConversationSchema = z.object({ userId: z.string().uuid() });

const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  attachmentUrl: z.string().max(500).optional(),
  attachmentType: z.string().max(100).optional(),
  replyToId: z.string().uuid().nullish(),
});

const editMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});

const dmInclude = {
  sender: { select: { id: true, username: true, avatar: true, status: true } },
  replyTo: { include: { sender: { select: { id: true, username: true } } } },
} as const;

const otherUserSelect = {
  id: true,
  username: true,
  avatar: true,
  status: true,
  bio: true,
} as const;

/**
 * A user may message someone directly (no request gate) when they are friends
 * or when the recipient follows them (the recipient opted in to their content).
 */
async function canMessageDirectly(senderId: string, candidateId: string): Promise<boolean> {
  const friendship = await prisma.friend.findFirst({
    where: {
      OR: [
        { userId: senderId, friendId: candidateId },
        { userId: candidateId, friendId: senderId },
      ],
    },
    select: { id: true },
  });
  if (friendship) return true;

  const follow = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: candidateId, followingId: senderId } },
  });
  return !!follow;
}

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

    // One query for every conversation's unread count.
    //
    // This used to run a COUNT per conversation, and worse, it was guarded by
    // "is the newest message unread?". Replied-to but never-opened threads
    // reported 0 because the newest message was the viewer's own, however
    // many older ones were still waiting.
    const unreadByConversation = new Map<string, number>();
    if (conversations.length > 0) {
      const unread = await prisma.directMessage.findMany({
        where: {
          conversationId: { in: conversations.map((c) => c.id) },
          senderId: { not: userId },
          readAt: null,
        },
        select: { conversationId: true },
      });

      for (const message of unread) {
        unreadByConversation.set(
          message.conversationId,
          (unreadByConversation.get(message.conversationId) ?? 0) + 1
        );
      }
    }

    const result = await Promise.all(
      conversations.map(async (c) => {
        const otherUser = c.user1Id === userId ? c.user2 : c.user1;
        const lastMessage = c.messages[0] || null;
        const unreadCount = unreadByConversation.get(c.id) ?? 0;

        return {
          id: c.id,
          otherUser,
          lastMessage,
          lastMessageAt: c.lastMessageAt,
          unreadCount,
          status: c.status,
          requestSenderId: c.requestSenderId,
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
        user1: { select: otherUserSelect },
        user2: { select: otherUserSelect },
      },
    });

    if (!conversation) {
      const canDirect = await canMessageDirectly(userId, otherUserId);
      conversation = await prisma.conversation.create({
        data: {
          user1Id: sortedIds[0],
          user2Id: sortedIds[1],
          status: canDirect ? "active" : "pending",
          requestSenderId: canDirect ? null : userId,
        },
        include: {
          user1: { select: otherUserSelect },
          user2: { select: otherUserSelect },
        },
      });

      if (!canDirect) {
        getIO()?.to(`user:${otherUserId}`).emit("dm_request", { conversationId: conversation.id });
      }
    }

    const other = conversation.user1Id === userId ? conversation.user2 : conversation.user1;

    ok(res, {
      conversation: {
        id: conversation.id,
        otherUser: other,
        lastMessage: null,
        lastMessageAt: conversation.lastMessageAt,
        unreadCount: 0,
        status: conversation.status,
        requestSenderId: conversation.requestSenderId,
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
    const isPending = conversation.status === "pending";
    const amRequester = conversation.requestSenderId === userId;
    const requesterId = conversation.requestSenderId;
    const io = getIO();

    if (isPending && !amRequester) {
      // Replying to a message request accepts it.
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { status: "active", requestSenderId: null },
      });
      if (io && requesterId) {
        io.to(`user:${requesterId}`).emit("dm_request_accepted", { conversationId });
      }
      if (requesterId) {
        const me = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
        void createNotification({
          userId: requesterId,
          type: "message_request_accepted",
          message: `${me?.username ?? "Someone"} accepted your message request`,
          fromUserId: userId,
        });
      }
    } else if (isPending && amRequester) {
      const firstMessage = (await prisma.directMessage.count({ where: { conversationId } })) === 0;
      if (firstMessage) {
        const me = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
        void createNotification({
          userId: otherUserId,
          type: "message_request",
          message: `${me?.username ?? "Someone"} sent you a message request`,
          fromUserId: userId,
        });
      }
    }

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

    const receiverUnread = await prisma.directMessage.count({
      where: { conversationId, senderId: { not: otherUserId }, readAt: null },
    });

    if (io) {
      io.to(`dm:${conversationId}`).emit("new_dm", message);
      io.to(`user:${otherUserId}`).emit("dm_updated", {
        conversationId,
        message,
        lastMessageAt: message.createdAt,
        unreadCount: receiverUnread,
      });
      io.to(`user:${userId}`).emit("dm_updated", {
        conversationId,
        message,
        lastMessageAt: message.createdAt,
        unreadCount: 0,
      });
    }

    ok(res, { message }, 201);
  })
);

router.patch(
  "/:id",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const { content } = parseOrThrow(editMessageSchema, req.body);
    const messageId = paramId(req.params.id, "message id");

    const message = await prisma.directMessage.findUnique({ where: { id: messageId } });
    if (!message) throw AppError.of("NOT_FOUND", "Message not found");
    if (message.senderId !== userId) {
      throw AppError.of("FORBIDDEN", "You can only edit your own messages");
    }

    const conversation = await assertConversationMember(message.conversationId, userId);

    const updated = await prisma.directMessage.update({
      where: { id: messageId },
      data: { content, edited: true },
      include: dmInclude,
    });

    const io = getIO();
    if (io) {
      io.to(`dm:${message.conversationId}`).emit("dm_message_edited", {
        conversationId: message.conversationId,
        message: updated,
      });
      io.to(`user:${conversation.user1Id}`).emit("dm_message_edited", {
        conversationId: message.conversationId,
        message: updated,
      });
      io.to(`user:${conversation.user2Id}`).emit("dm_message_edited", {
        conversationId: message.conversationId,
        message: updated,
      });
    }

    ok(res, { message: updated });
  })
);

router.delete(
  "/:id",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const messageId = paramId(req.params.id, "message id");

    const message = await prisma.directMessage.findUnique({ where: { id: messageId } });
    if (!message) throw AppError.of("NOT_FOUND", "Message not found");
    if (message.senderId !== userId) {
      throw AppError.of("FORBIDDEN", "You can only delete your own messages");
    }

    const conversation = await assertConversationMember(message.conversationId, userId);

    await prisma.directMessage.delete({ where: { id: messageId } });

    const io = getIO();
    if (io) {
      io.to(`dm:${message.conversationId}`).emit("dm_message_deleted", {
        conversationId: message.conversationId,
        messageId,
      });
      io.to(`user:${conversation.user1Id}`).emit("dm_message_deleted", {
        conversationId: message.conversationId,
        messageId,
      });
      io.to(`user:${conversation.user2Id}`).emit("dm_message_deleted", {
        conversationId: message.conversationId,
        messageId,
      });
    }

    ok(res, { message: "Message deleted" });
  })
);

/** Recipient accepts a pending message request. */
router.post(
  "/:conversationId/accept",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const conversationId = paramId(req.params.conversationId, "conversation id");

    const conversation = await assertConversationMember(conversationId, userId);
    if (conversation.status !== "pending") {
      throw AppError.of("CONFLICT", "No pending message request");
    }
    if (conversation.requestSenderId === userId) {
      throw AppError.of("FORBIDDEN", "You cannot accept your own message request");
    }

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: "active", requestSenderId: null },
    });

    const io = getIO();
    if (io && conversation.requestSenderId) {
      io.to(`user:${conversation.requestSenderId}`).emit("dm_request_accepted", { conversationId });
    }

    const me = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    if (conversation.requestSenderId) {
      void createNotification({
        userId: conversation.requestSenderId,
        type: "message_request_accepted",
        message: `${me?.username ?? "Someone"} accepted your message request`,
        fromUserId: userId,
      });
    }

    ok(res, { message: "Message request accepted", conversationId });
  })
);

/** Recipient declines a pending message request (removes the thread). */
router.post(
  "/:conversationId/decline",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const conversationId = paramId(req.params.conversationId, "conversation id");

    const conversation = await assertConversationMember(conversationId, userId);
    if (conversation.status !== "pending") {
      throw AppError.of("CONFLICT", "No pending message request");
    }
    if (conversation.requestSenderId === userId) {
      throw AppError.of("FORBIDDEN", "You cannot decline your own message request");
    }

    const requesterId = conversation.requestSenderId;
    await prisma.conversation.delete({ where: { id: conversationId } });

    const io = getIO();
    if (io && requesterId) {
      io.to(`user:${requesterId}`).emit("dm_request_declined", { conversationId });
    }

    ok(res, { message: "Message request declined", conversationId });
  })
);

router.patch(
  "/:conversationId/read",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const conversationId = paramId(req.params.conversationId, "conversation id");

    const conversation = await assertConversationMember(conversationId, userId);

    const result = await prisma.directMessage.updateMany({
      where: { conversationId, senderId: { not: userId }, readAt: null },
      data: { readAt: new Date() },
    });

    // Nothing was unread, so there is nothing to tell anyone. The client
    // polls this endpoint; broadcasting regardless made every idle tick wake
    // the other user's socket for a state it was already in.
    if (result.count === 0) {
      ok(res, { message: "Messages marked as read" });
      return;
    }

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
