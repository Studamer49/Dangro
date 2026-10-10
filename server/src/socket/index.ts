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

/**
 * Whether `fromUserId` is allowed to reach `toUserId` at all.
 *
 * This is the same rule the DM routes use (see `canMessageDirectly`): two
 * people who are friends, or where the recipient follows the sender. A call
 * is a direct message with media attached, so it has to obey the same rule.
 */
async function canContact(fromUserId: string, toUserId: string): Promise<boolean> {
  if (fromUserId === toUserId) return false;

  const friendship = await prisma.friend.findFirst({
    where: {
      OR: [
        { userId: fromUserId, friendId: toUserId },
        { userId: toUserId, friendId: fromUserId },
      ],
    },
    select: { id: true },
  });
  if (friendship) return true;

  const follow = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: toUserId, followingId: fromUserId } },
    select: { id: true },
  });
  return !!follow;
}

/**
 * Calls that have been authorised and are still live, keyed by room.
 *
 * Signalling is relayed only between the two participants named in the
 * entry, so `webrtc_*` and `ice_candidate` need no database round trip per
 * event — which matters, because a single call emits dozens of ICE
 * candidates.
 */
interface ActiveCall {
  callerId: string;
  calleeId: string;
  startedAt: number;
}

const activeCalls = new Map<string, ActiveCall>();
const CALL_TIMEOUT_MS = 2 * 60 * 60 * 1000;

function pruneCalls(now: number): void {
  for (const [roomId, call] of activeCalls) {
    if (now - call.startedAt > CALL_TIMEOUT_MS) activeCalls.delete(roomId);
  }
}

/** The live call between two users, with the room that identifies it. */
function callBetween(a: string, b: string): { roomId: string; call: ActiveCall } | undefined {
  for (const [roomId, call] of activeCalls) {
    if ((call.callerId === a && call.calleeId === b) || (call.callerId === b && call.calleeId === a)) {
      return { roomId, call };
    }
  }
  return undefined;
}

/** Exposed for tests: drops all in-flight call state. */
export function resetActiveCalls(): void {
  activeCalls.clear();
}

/**
 * Sliding-window rate limit, so one socket cannot ring another user forever.
 * Returns true when the event should be dropped.
 */
function rateLimited(hits: number[], limit: number, windowMs: number, now: number): boolean {
  while (hits.length > 0 && now - hits[0] > windowMs) hits.shift();
  if (hits.length >= limit) return true;
  hits.push(now);
  return false;
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
    // Per-socket invite timestamps for the sliding-window rate limit.
    const inviteHits: number[] = [];

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

    socket.on("voice_signal", async (payload: unknown) => {
      const data = parse(signalTarget, payload);
      if (!data) return;
      // Voice-channel signalling is only meaningful between two people in
      // the same voice room, and `voice_join` already verified channel
      // membership before anyone could enter one.
      if (data.targetUserId === userId) return;
      const voiceRooms = [...socket.rooms].filter((room) => room.startsWith("voice:"));
      if (voiceRooms.length === 0) return;

      const targets = await io.in(`user:${data.targetUserId}`).fetchSockets();
      const sharesVoiceRoom = targets.some((peer) => voiceRooms.some((room) => peer.rooms.has(room)));
      if (!sharesVoiceRoom) return;

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

    // A call is only ever relayed between its two participants. Without these
    // checks any authenticated user could ring, interrupt or tear down anyone
    // else's call simply by naming their id.
    socket.on("call_invite", async (payload: unknown) => {
      const data = parse(callInvite, payload);
      if (!data) return;

      const now = Date.now();
      pruneCalls(now);
      // A ringtone is an interruption to a real person, so an invite is rate
      // limited as well as authorised.
      if (rateLimited(inviteHits, 5, 60_000, now)) return;
      if (!(await canContact(userId, data.targetUserId))) return;

      activeCalls.set(data.roomId, {
        callerId: userId,
        calleeId: data.targetUserId,
        startedAt: now,
      });

      io.to(`user:${data.targetUserId}`).emit("call_invite", {
        callerId: userId,
        callType: data.callType,
        roomId: data.roomId,
      });
    });

    socket.on("call_accept", (payload: unknown) => {
      const data = parse(roomTarget, payload);
      if (!data) return;
      const call = activeCalls.get(data.roomId);
      if (!call) return;
      if (call.calleeId !== userId || call.callerId !== data.targetUserId) return;
      io.to(`user:${data.targetUserId}`).emit("call_accept", { accepterId: userId, roomId: data.roomId });
    });

    socket.on("call_reject", (payload: unknown) => {
      const data = parse(targetRef, payload);
      if (!data) return;
      const live = callBetween(userId, data.targetUserId);
      if (!live) return;
      activeCalls.delete(live.roomId);
      io.to(`user:${data.targetUserId}`).emit("call_reject", { rejecterId: userId });
    });

    socket.on("call_end", (payload: unknown) => {
      const data = parse(targetRef, payload);
      if (!data) return;
      const live = callBetween(userId, data.targetUserId);
      if (!live) return;
      activeCalls.delete(live.roomId);
      io.to(`user:${data.targetUserId}`).emit("call_end", { enderId: userId });
    });

    socket.on("webrtc_offer", (payload: unknown) => {
      const data = parse(signalTarget, payload);
      if (!data) return;
      if (!callBetween(userId, data.targetUserId)) return;
      io.to(`user:${data.targetUserId}`).emit("webrtc_offer", { userId, offer: data.signal });
    });

    socket.on("webrtc_answer", (payload: unknown) => {
      const data = parse(signalTarget, payload);
      if (!data) return;
      if (!callBetween(userId, data.targetUserId)) return;
      io.to(`user:${data.targetUserId}`).emit("webrtc_answer", { userId, answer: data.signal });
    });

    socket.on("ice_candidate", (payload: unknown) => {
      const data = parse(signalTarget, payload);
      if (!data) return;
      if (!callBetween(userId, data.targetUserId)) return;
      io.to(`user:${data.targetUserId}`).emit("ice_candidate", { userId, candidate: data.signal });
    });

    socket.on("disconnect", () => {
      // The socket has already been removed from its rooms by now, so the
      // room size is the count of OTHER live connections for this user
      // (e.g. a second tab). Only go offline when the last one closes.
      const remaining = io.sockets.adapter.rooms.get(`user:${userId}`)?.size ?? 0;

      // Nobody is left to talk to on this user's calls, so stop relaying
      // signalling for them.
      for (const [roomId, call] of activeCalls) {
        if (call.callerId === userId || call.calleeId === userId) activeCalls.delete(roomId);
      }

      if (remaining > 0) return;
      prisma.user
        .update({ where: { id: userId }, data: { status: "offline", lastSeen: new Date() } })
        .catch((err) => console.error(`[socket] failed to mark ${userId} offline:`, err));
    });
  });
}
