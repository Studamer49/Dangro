import { Server as SocketServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../prisma.js";

interface AuthPayload {
  userId: string;
}

const channelRef = z.object({ channelId: z.string().uuid() });
const serverRef = z.object({ serverId: z.string().uuid() });
const conversationRef = z.object({ conversationId: z.string().uuid() });
const messagePayload = z.object({
  content: z.string().trim().min(1).max(4000),
  channelId: z.string().uuid(),
  replyToId: z.string().uuid().nullish(),
});
const targetRef = z.object({ targetUserId: z.string().uuid() });
const callInvite = targetRef.extend({
  callType: z.enum(["voice", "video"]),
  roomId: z.string().min(1).max(64),
});
const roomTarget = targetRef.extend({ roomId: z.string().min(1).max(64) });
const signalTarget = targetRef.extend({ signal: z.unknown() });

/** Returns true when the socket's user belongs to the channel's server. */
async function isChannelMember(channelId: string, userId: string): Promise<boolean> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { server: { select: { members: { where: { userId }, select: { id: true } } } } },
  });
  return !!channel && channel.server.members.length > 0;
}

async function isServerMember(serverId: string, userId: string): Promise<boolean> {
  const member = await prisma.member.findUnique({
    where: { userId_serverId: { userId, serverId } },
    select: { id: true },
  });
  return !!member;
}

async function isConversationParticipant(conversationId: string, userId: string): Promise<boolean> {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return false;
  return conversation.user1Id === userId || conversation.user2Id === userId;
}

function parse<T extends z.ZodType>(schema: T, data: unknown): z.output<T> | null {
  const result = schema.safeParse(data);
  return result.success ? result.data : null;
}

export function setupSocketHandlers(io: SocketServer): void {
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth.token;
    if (typeof token !== "string" || !token) {
      next(new Error("Authentication error"));
      return;
    }

    try {
      const decoded = jwt.verify(token, config.jwtSecret) as AuthPayload;
      if (!decoded.userId) throw new Error("missing userId");
      socket.data.userId = decoded.userId;
      next();
    } catch {
      next(new Error("Authentication error"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const userId = socket.data.userId as string;

    socket.join(`user:${userId}`);

    prisma.user
      .update({ where: { id: userId }, data: { status: "online" } })
      .catch((err) => console.error(`[socket] failed to mark ${userId} online:`, err));

    socket.on("join_server", async (payload: unknown) => {
      const data = parse(serverRef, payload);
      if (!data) return;
      if (!(await isServerMember(data.serverId, userId))) return;
      void socket.join(`server:${data.serverId}`);
    });

    socket.on("leave_server", (payload: unknown) => {
      const data = parse(serverRef, payload);
      if (data) void socket.leave(`server:${data.serverId}`);
    });

    socket.on("join_channel", async (payload: unknown) => {
      const data = parse(channelRef, payload);
      if (!data) return;
      if (!(await isChannelMember(data.channelId, userId))) return;
      void socket.join(`channel:${data.channelId}`);
    });

    socket.on("leave_channel", (payload: unknown) => {
      const data = parse(channelRef, payload);
      if (data) void socket.leave(`channel:${data.channelId}`);
    });

    socket.on("message", async (payload: unknown) => {
      try {
        const data = parse(messagePayload, payload);
        if (!data) {
          socket.emit("error", { message: "Invalid message payload" });
          return;
        }

        if (!(await isChannelMember(data.channelId, userId))) {
          socket.emit("error", { message: "You cannot send messages to this channel" });
          return;
        }

        if (data.replyToId) {
          const target = await prisma.message.findUnique({
            where: { id: data.replyToId },
            select: { channelId: true },
          });
          if (!target || target.channelId !== data.channelId) {
            socket.emit("error", { message: "Reply target is not in this channel" });
            return;
          }
        }

        const message = await prisma.message.create({
          data: {
            content: data.content,
            authorId: userId,
            channelId: data.channelId,
            replyToId: data.replyToId ?? undefined,
          },
          include: {
            author: { select: { id: true, username: true, avatar: true } },
            replyTo: { include: { author: { select: { id: true, username: true } } } },
            reactions: true,
            attachments: true,
          },
        });

        io.to(`channel:${data.channelId}`).emit("new_message", message);
      } catch (err) {
        console.error("[socket] message failed:", err);
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    socket.on("typing_start", async (payload: unknown) => {
      const data = parse(channelRef, payload);
      if (!data) return;
      if (!(await isChannelMember(data.channelId, userId))) return;
      socket.to(`channel:${data.channelId}`).emit("typing_start", { userId, channelId: data.channelId });
    });

    socket.on("typing_stop", async (payload: unknown) => {
      const data = parse(channelRef, payload);
      if (!data) return;
      if (!(await isChannelMember(data.channelId, userId))) return;
      socket.to(`channel:${data.channelId}`).emit("typing_stop", { userId, channelId: data.channelId });
    });

    socket.on("voice_join", async (payload: unknown) => {
      const data = parse(channelRef, payload);
      if (!data) return;
      if (!(await isChannelMember(data.channelId, userId))) return;
      void socket.join(`voice:${data.channelId}`);
      socket.to(`voice:${data.channelId}`).emit("voice_user_join", { userId, channelId: data.channelId });
    });

    socket.on("voice_leave", (payload: unknown) => {
      const data = parse(channelRef, payload);
      if (!data) return;
      void socket.leave(`voice:${data.channelId}`);
      socket.to(`voice:${data.channelId}`).emit("voice_user_leave", { userId, channelId: data.channelId });
    });

    socket.on("voice_signal", (payload: unknown) => {
      const data = parse(signalTarget, payload);
      if (!data) return;
      io.to(`user:${data.targetUserId}`).emit("voice_signal", { userId, signal: data.signal });
    });

    socket.on("dm_join", async (payload: unknown) => {
      const data = parse(conversationRef, payload);
      if (!data) return;
      if (!(await isConversationParticipant(data.conversationId, userId))) return;
      void socket.join(`dm:${data.conversationId}`);
    });

    socket.on("dm_leave", (payload: unknown) => {
      const data = parse(conversationRef, payload);
      if (data) void socket.leave(`dm:${data.conversationId}`);
    });

    socket.on("dm_typing_start", async (payload: unknown) => {
      const data = parse(conversationRef, payload);
      if (!data) return;
      if (!(await isConversationParticipant(data.conversationId, userId))) return;
      socket.to(`dm:${data.conversationId}`).emit("dm_typing_start", { userId, conversationId: data.conversationId });
    });

    socket.on("dm_typing_stop", async (payload: unknown) => {
      const data = parse(conversationRef, payload);
      if (!data) return;
      if (!(await isConversationParticipant(data.conversationId, userId))) return;
      socket.to(`dm:${data.conversationId}`).emit("dm_typing_stop", { userId, conversationId: data.conversationId });
    });

    socket.on("call_invite", (payload: unknown) => {
      const data = parse(callInvite, payload);
      if (!data) return;
      io.to(`user:${data.targetUserId}`).emit("call_invite", {
        callerId: userId,
        callType: data.callType,
        roomId: data.roomId,
      });
    });

    socket.on("call_accept", (payload: unknown) => {
      const data = parse(roomTarget, payload);
      if (!data) return;
      io.to(`user:${data.targetUserId}`).emit("call_accept", { accepterId: userId, roomId: data.roomId });
    });

    socket.on("call_reject", (payload: unknown) => {
      const data = parse(targetRef, payload);
      if (!data) return;
      io.to(`user:${data.targetUserId}`).emit("call_reject", { rejecterId: userId });
    });

    socket.on("call_end", (payload: unknown) => {
      const data = parse(targetRef, payload);
      if (!data) return;
      io.to(`user:${data.targetUserId}`).emit("call_end", { enderId: userId });
    });

    socket.on("webrtc_offer", (payload: unknown) => {
      const data = parse(signalTarget, payload);
      if (!data) return;
      io.to(`user:${data.targetUserId}`).emit("webrtc_offer", { userId, offer: data.signal });
    });

    socket.on("webrtc_answer", (payload: unknown) => {
      const data = parse(signalTarget, payload);
      if (!data) return;
      io.to(`user:${data.targetUserId}`).emit("webrtc_answer", { userId, answer: data.signal });
    });

    socket.on("ice_candidate", (payload: unknown) => {
      const data = parse(signalTarget, payload);
      if (!data) return;
      io.to(`user:${data.targetUserId}`).emit("ice_candidate", { userId, candidate: data.signal });
    });

    socket.on("disconnect", () => {
      // The socket has already been removed from its rooms by now, so the
      // room size is the count of OTHER live connections for this user
      // (e.g. a second tab). Only go offline when the last one closes.
      const remaining = io.sockets.adapter.rooms.get(`user:${userId}`)?.size ?? 0;
      if (remaining > 0) return;
      prisma.user
        .update({ where: { id: userId }, data: { status: "offline", lastSeen: new Date() } })
        .catch((err) => console.error(`[socket] failed to mark ${userId} offline:`, err));
    });
  });
}
