import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { getIO } from "../socket/io.js";
import { authenticate, AuthRequest, requireUser } from "../middleware/auth.js";
import { AppError, asyncHandler, ok, parseOrThrow } from "../lib/http.js";
import { assertChannelMember, assertChannelReply, paramId } from "../lib/access.js";
import { mediaUrl } from "../lib/urls.js";
import { actorCan, loadActor } from "../lib/permissions.js";

const router = Router();

const attachmentSchema = z.object({
  url: mediaUrl(),
  type: z.enum(["image", "video", "audio", "file"]),
  filename: z.string().trim().min(1).max(255),
  size: z.number().int().min(0),
  mimeType: z.string().trim().min(1).max(255),
});

const sendMessageSchema = z
  .object({
    content: z.string().trim().max(4000).optional(),
    channelId: z.string().uuid(),
    replyToId: z.string().uuid().nullish(),
    /** Optional single file, uploaded first and attached to the message. */
    attachment: attachmentSchema.optional(),
  })
  // A message must carry words or a file; an empty row has nothing to show.
  .refine((value) => Boolean(value.content?.trim()) || Boolean(value.attachment), {
    message: "Add a message or an attachment",
  });

const editMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});

const reactionSchema = z.object({ emoji: z.string().min(1).max(16) });

const messageInclude = {
  author: { select: { id: true, username: true, avatar: true } },
  replyTo: { include: { author: { select: { id: true, username: true } } } },
  reactions: true,
  attachments: true,
} as const;

router.post(
  "/",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const { content, channelId, replyToId, attachment } = parseOrThrow(sendMessageSchema, req.body);

    await assertChannelMember(channelId, userId);
    await assertChannelReply(replyToId, channelId);

    const message = await prisma.message.create({
      data: {
        content: content?.trim() ?? "",
        authorId: userId,
        channelId,
        replyToId: replyToId ?? undefined,
        ...(attachment
          ? {
              attachments: {
                create: {
                  url: attachment.url,
                  filename: attachment.filename,
                  size: attachment.size,
                  mimeType: attachment.mimeType,
                  userId,
                },
              },
            }
          : {}),
      },
      include: messageInclude,
    });

    getIO()?.to(`channel:${channelId}`).emit("new_message", message);

    ok(res, { message }, 201);
  })
);

router.get(
  "/:channelId",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const channelId = paramId(req.params.channelId, "channel id");

    const channel = await assertChannelMember(channelId, userId);

    const messages = await prisma.message.findMany({
      where: { channelId },
      include: { ...messageInclude, reactions: { include: { user: { select: { id: true, username: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    // Surfaced so the client knows whether to offer "delete message" on other
    // people's messages without a second round trip.
    const actor = await loadActor(channel.serverId, userId);
    const canManageMessages = actorCan(actor, "MANAGE_MESSAGES");

    ok(res, { messages: messages.reverse(), canManageMessages });
  })
);

router.patch(
  "/:id",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const { content } = parseOrThrow(editMessageSchema, req.body);
    const messageId = paramId(req.params.id, "message id");

    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw AppError.of("NOT_FOUND", "Message not found");
    if (message.authorId !== userId) throw AppError.of("FORBIDDEN", "You can only edit your own messages");

    await assertChannelMember(message.channelId, userId);

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { content, edited: true },
      include: messageInclude,
    });

    getIO()?.to(`channel:${message.channelId}`).emit("message_edited", updated);

    ok(res, { message: updated });
  })
);

router.delete(
  "/:id",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const messageId = paramId(req.params.id, "message id");

    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw AppError.of("NOT_FOUND", "Message not found");

    const channel = await assertChannelMember(message.channelId, userId);

    // The author may always remove their own message. Anyone else needs
    // MANAGE_MESSAGES, which the server owner holds implicitly.
    if (message.authorId !== userId) {
      const actor = await loadActor(channel.serverId, userId);
      if (!actorCan(actor, "MANAGE_MESSAGES")) {
        throw AppError.of("FORBIDDEN", "You need the MANAGE_MESSAGES permission to delete this message");
      }
    }

    await prisma.message.delete({ where: { id: messageId } });

    getIO()?.to(`channel:${message.channelId}`).emit("message_deleted", { messageId });

    ok(res, { message: "Message deleted" });
  })
);

router.post(
  "/:id/reactions",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const { emoji } = parseOrThrow(reactionSchema, req.body);
    const messageId = paramId(req.params.id, "message id");

    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw AppError.of("NOT_FOUND", "Message not found");

    await assertChannelMember(message.channelId, userId);

    const existing = await prisma.reaction.findUnique({
      where: { userId_messageId_emoji: { userId, messageId, emoji } },
    });

    if (existing) {
      await prisma.reaction.delete({ where: { id: existing.id } });
    } else {
      await prisma.reaction.create({ data: { userId, messageId, emoji } });
    }

    const updatedMessage = await prisma.message.findUnique({
      where: { id: messageId },
      include: { reactions: { include: { user: { select: { id: true, username: true } } } } },
    });

    if (updatedMessage) {
      getIO()?.to(`channel:${message.channelId}`).emit("message_reactions_updated", {
        messageId,
        reactions: updatedMessage.reactions,
      });
    }

    ok(res, { reactionToggled: !existing, message: updatedMessage });
  })
);

export default router;
