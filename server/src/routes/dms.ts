import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { getIO } from "../socket/io.js";
import { authenticate, AuthRequest, requireUser } from "../middleware/auth.js";
import { AppError, asyncHandler, ok, parseOrThrow } from "../lib/http.js";
import { assertConversationMember, assertDirectMessageReply, paramId } from "../lib/access.js";
import { mediaUrl } from "../lib/urls.js";
import { createNotification } from "../lib/notifications.js";
import { destroyImage, isCloudinaryConfigured } from "../lib/cloudinary.js";

const router = Router();

/**
 * Removes the Cloudinary asset behind a deleted message.
 *
 * Three rules, in order:
 *   1. Never throw. The message row is already deleted by the time this runs,
 *      so surfacing an error would tell the caller their delete failed when it
 *      succeeded. The orphan is logged instead.
 *   2. Never delete an asset another message still points at. Every upload
 *      gets a fresh public ID, so this is a cheap safety net rather than the
 *      main defence.
 *   3. Never log credentials — only the public ID, which is not a secret.
 */
async function removeAttachmentAsset(publicId: string): Promise<void> {
  try {
    if (!isCloudinaryConfigured()) {
      console.warn("[media] Skipping asset removal: Cloudinary is not configured.");
      return;
    }

    const stillReferenced = await prisma.directMessage.findFirst({
      where: { attachmentPublicId: publicId },
      select: { id: true },
    });
    if (stillReferenced) return;

    await destroyImage(publicId);
  } catch (err) {
    console.error(
      "[media] Could not remove Cloudinary asset:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

const startConversationSchema = z.object({ userId: z.string().uuid() });

const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  attachmentUrl: mediaUrl().optional(),
  attachmentType: z.string().max(100).optional(),
  /**
   * Cloudinary's canonical asset ID, used to delete the asset when the
   * message is removed. Bounded to the shape Cloudinary actually issues
   * (`folder/name`) so it cannot be used to address an arbitrary path.
   */
  attachmentPublicId: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(/^[A-Za-z0-9_\-/]+$/, "Invalid attachment identifier")
    .optional(),
  replyToId: z.string().uuid().nullish(),
});

const editMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});

const reactionSchema = z.object({ emoji: z.string().min(1).max(16) });

const dmInclude = {
  sender: { select: { id: true, username: true, avatar: true, status: true } },
  replyTo: { include: { sender: { select: { id: true, username: true } } } },
  reactions: { include: { user: { select: { id: true, username: true } } } },
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

/**
 * True when either side has blocked the other. A block is a wall, not a
 * direction: once it exists neither party may start or continue a thread.
 */
async function isBlockedEitherWay(a: string, b: string): Promise<boolean> {
  const block = await prisma.block.findFirst({
    where: { OR: [{ userId: a, blockedId: b }, { userId: b, blockedId: a }] },
    select: { id: true },
  });
  return !!block;
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

    if (await isBlockedEitherWay(userId, otherUserId)) {
      throw AppError.of("FORBIDDEN", "You cannot message this user");
    }

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
    const {
      content,
      attachmentUrl,
      attachmentType,
      attachmentPublicId,
      replyToId,
    } = parseOrThrow(sendMessageSchema, req.body);

    const conversation = await assertConversationMember(conversationId, userId);
    await assertDirectMessageReply(replyToId, conversationId);

    const otherUserId = conversation.user1Id === userId ? conversation.user2Id : conversation.user1Id;

    if (await isBlockedEitherWay(userId, otherUserId)) {
      throw AppError.of("FORBIDDEN", "You cannot message this user");
    }

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
        attachmentPublicId: attachmentPublicId || undefined,
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

    // Everything above is the existing authorisation chain and is unchanged.
    // Only once the caller is confirmed to own the message does any external
    // side effect happen.
    await prisma.directMessage.delete({ where: { id: messageId } });

    // Remove the Cloudinary asset, but never at the cost of the delete the
    // user asked for: the message row is already gone, so failing here would
    // leave the caller thinking their message survived. The orphan is logged
    // and can be swept later from the media library.
    if (message.attachmentPublicId) {
      await removeAttachmentAsset(message.attachmentPublicId);
    }

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

/** Toggles a reaction on a direct message, mirroring the channel route. */
router.post(
  "/:id/reactions",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const { emoji } = parseOrThrow(reactionSchema, req.body);
    const messageId = paramId(req.params.id, "message id");

    const message = await prisma.directMessage.findUnique({ where: { id: messageId } });
    if (!message) throw AppError.of("NOT_FOUND", "Message not found");

    await assertConversationMember(message.conversationId, userId);

    const existing = await prisma.directReaction.findUnique({
      where: { userId_directMessageId_emoji: { userId, directMessageId: messageId, emoji } },
    });

    if (existing) {
      await prisma.directReaction.delete({ where: { id: existing.id } });
    } else {
      await prisma.directReaction.create({
        data: { userId, directMessageId: messageId, emoji },
      });
    }

    const updatedMessage = await prisma.directMessage.findUnique({
      where: { id: messageId },
      include: { reactions: { include: { user: { select: { id: true, username: true } } } } },
    });

    const io = getIO();
    if (io && updatedMessage) {
      io.to(`dm:${message.conversationId}`).emit("dm_reactions_updated", {
        conversationId: message.conversationId,
        messageId,
        reactions: updatedMessage.reactions,
      });
    }

    ok(res, { reactionToggled: !existing, message: updatedMessage });
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
