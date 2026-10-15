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
  // `server` is null when the channel outlives its server — possible on the
  // MongoDB backend, which enforces no foreign keys. Prisma's types call it
  // non-nullable, so this is the only thing stopping a TypeError (and an
  // unhandled rejection in the async handlers below).
  return !!channel?.server && channel.server.members.length > 0;
}

/**
 * A reply to an emitting client, when it asked for one.
 *
 * `call_invite` and `call_accept` are fire-and-forget on the wire from the
 * store's point of view, but the caller/callee must not sit in a call nobody
 * acknowledged: a refused invite (blocked, offline rules, already in a call)
 * used to leave the caller ringing at a black screen forever, because the
 * server simply dropped the event and said nothing.
 */
type Ack = (response: { ok: boolean; reason?: string }) => void;
const noAck: Ack = () => undefined;

/**
 * Wraps an async socket listener so a rejected database call cannot escape.
 *
 * Socket.IO does not await listeners, and `process.on("unhandledRejection")` in
 * index.ts swallows the rejection rather than crashing — so without this the
 * event is dropped in total silence and the socket stays half-joined. The
 * client gets a clear error instead.
 */
function safe(
  socket: Socket,
  event: string,
  handler: (payload: unknown, ack: Ack) => Promise<void>
): void {
  socket.on(event, (payload: unknown, ack?: unknown) => {
    const reply: Ack = typeof ack === "function" ? (ack as Ack) : noAck;
    // Socket.IO ignores the return value; the promise is returned so tests
    // can await the handler deterministically.
    return handler(payload, reply).catch((err: unknown) => {
      console.error(`[socket] ${event} failed:`, err);
      socket.emit("error", { message: "Request failed" });
      reply({ ok: false, reason: "error" });
    });
  });
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

  // A block in either direction is a hard stop for calls, matching the DM
  // routes so a blocked user cannot reach someone by ringing them instead.
  const block = await prisma.block.findFirst({
    where: {
      OR: [
        { userId: fromUserId, blockedId: toUserId },
        { userId: toUserId, blockedId: fromUserId },
      ],
    },
    select: { id: true },
  });
  if (block) return false;

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
  /** Whether the callee answered. A ring nobody picks up is timed out. */
  accepted: boolean;
  /** Backstop timer that drops an invite nobody ever answered. */
  ringTimer?: ReturnType<typeof setTimeout>;
}

const activeCalls = new Map<string, ActiveCall>();
const CALL_TIMEOUT_MS = 2 * 60 * 60 * 1000;
/**
 * How long an unanswered ring lasts before the server gives up.
 *
 * The callee's client auto-declines after 30s on its own, so this only fires
 * when that client never saw the invite (app closed, phone asleep, invite
 * lost) — without it the caller rang at "Ringing..." forever, because nothing
 * else ever told them nobody was coming.
 */
const RING_TIMEOUT_MS = 40_000;

/** Drops a call and cancels its ring timer, if either still exists. */
function dropCall(roomId: string): void {
  const call = activeCalls.get(roomId);
  if (!call) return;
  if (call.ringTimer) clearTimeout(call.ringTimer);
  activeCalls.delete(roomId);
}

function pruneCalls(now: number): void {
  for (const [roomId, call] of activeCalls) {
    if (now - call.startedAt > CALL_TIMEOUT_MS) dropCall(roomId);
  }
}

/** Whether this user is a participant of any live call right now. */
function anyCallInvolving(userId: string): boolean {
  for (const call of activeCalls.values()) {
    if (call.callerId === userId || call.calleeId === userId) return true;
  }
  return false;
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
  for (const roomId of [...activeCalls.keys()]) dropCall(roomId);
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

    safe(socket, "join_server", async (payload: unknown) => {
      const data = parse(serverRef, payload);
      if (!data) return;
      if (!(await isServerMember(data.serverId, userId))) return;
      void socket.join(`server:${data.serverId}`);
    });

    socket.on("leave_server", (payload: unknown) => {
      const data = parse(serverRef, payload);
      if (data) void socket.leave(`server:${data.serverId}`);
    });

    safe(socket, "join_channel", async (payload: unknown) => {
      const data = parse(channelRef, payload);
      if (!data) return;
      if (!(await isChannelMember(data.channelId, userId))) return;
      void socket.join(`channel:${data.channelId}`);
    });

    socket.on("leave_channel", (payload: unknown) => {
      const data = parse(channelRef, payload);
      if (data) void socket.leave(`channel:${data.channelId}`);
    });

    safe(socket, "message", async (payload: unknown) => {
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
    });

    safe(socket, "typing_start", async (payload: unknown) => {
      const data = parse(channelRef, payload);
      if (!data) return;
      if (!(await isChannelMember(data.channelId, userId))) return;
      socket.to(`channel:${data.channelId}`).emit("typing_start", { userId, channelId: data.channelId });
    });

    safe(socket, "typing_stop", async (payload: unknown) => {
      const data = parse(channelRef, payload);
      if (!data) return;
      if (!(await isChannelMember(data.channelId, userId))) return;
      socket.to(`channel:${data.channelId}`).emit("typing_stop", { userId, channelId: data.channelId });
    });

    safe(socket, "voice_join", async (payload: unknown) => {
      const data = parse(channelRef, payload);
      if (!data) return;
      if (!(await isChannelMember(data.channelId, userId))) return;

      const room = `voice:${data.channelId}`;
      // Read the room BEFORE this socket joins it: the members already inside
      // only learn about the newcomer from the broadcast below, so the
      // newcomer is the only side that needs — and can be given — the roster.
      const existing = await io.in(room).fetchSockets();
      const peers = existing
        .map((member) => member.data.userId as string | undefined)
        .filter((id): id is string => Boolean(id) && id !== userId)
        .map((id) => ({ userId: id }));

      void socket.join(room);
      socket.emit("voice_peers", { channelId: data.channelId, peers });
      socket.to(room).emit("voice_user_join", { userId, channelId: data.channelId });
    });

    socket.on("voice_leave", (payload: unknown) => {
      const data = parse(channelRef, payload);
      if (!data) return;
      void socket.leave(`voice:${data.channelId}`);
      socket.to(`voice:${data.channelId}`).emit("voice_user_leave", { userId, channelId: data.channelId });
    });

    safe(socket, "voice_signal", async (payload: unknown) => {
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

    safe(socket, "dm_join", async (payload: unknown) => {
      const data = parse(conversationRef, payload);
      if (!data) return;
      if (!(await isConversationParticipant(data.conversationId, userId))) return;
      void socket.join(`dm:${data.conversationId}`);
    });

    socket.on("dm_leave", (payload: unknown) => {
      const data = parse(conversationRef, payload);
      if (data) void socket.leave(`dm:${data.conversationId}`);
    });

    safe(socket, "dm_typing_start", async (payload: unknown) => {
      const data = parse(conversationRef, payload);
      if (!data) return;
      if (!(await isConversationParticipant(data.conversationId, userId))) return;
      socket.to(`dm:${data.conversationId}`).emit("dm_typing_start", { userId, conversationId: data.conversationId });
    });

    safe(socket, "dm_typing_stop", async (payload: unknown) => {
      const data = parse(conversationRef, payload);
      if (!data) return;
      if (!(await isConversationParticipant(data.conversationId, userId))) return;
      socket.to(`dm:${data.conversationId}`).emit("dm_typing_stop", { userId, conversationId: data.conversationId });
    });

    // A call is only ever relayed between its two participants. Without these
    // checks any authenticated user could ring, interrupt or tear down anyone
    // else's call simply by naming their id.
    safe(socket, "call_invite", async (payload: unknown, ack: Ack) => {
      const data = parse(callInvite, payload);
      if (!data) {
        ack({ ok: false, reason: "invalid" });
        return;
      }

      const now = Date.now();
      pruneCalls(now);
      // A ringtone is an interruption to a real person, so an invite is rate
      // limited as well as authorised.
      if (rateLimited(inviteHits, 5, 60_000, now)) {
        ack({ ok: false, reason: "rate" });
        return;
      }
      if (!(await canContact(userId, data.targetUserId))) {
        // The caller needs to hear "no" — a silently dropped invite left them
        // ringing at a screen nobody will ever answer.
        ack({ ok: false, reason: "unavailable" });
        return;
      }

      // Same pair already ringing: re-send the EXISTING room instead of minting
      // a second one. A double tap (or a second tab) used to overwrite the
      // callee's stored room with an id that was never registered, so their
      // accept hit nothing and both sides hung.
      const existing = callBetween(userId, data.targetUserId);
      if (existing) {
        if (existing.call.accepted) {
          ack({ ok: false, reason: "in-call" });
          return;
        }
        io.to(`user:${data.targetUserId}`).emit("call_invite", {
          callerId: userId,
          callType: data.callType,
          roomId: existing.roomId,
        });
        ack({ ok: true });
        return;
      }

      // Either side busy with someone else (including a second device of this
      // user holding a call) — ringing would stack two calls in one UI.
      if (anyCallInvolving(userId)) {
        ack({ ok: false, reason: "in-call" });
        return;
      }
      if (anyCallInvolving(data.targetUserId)) {
        ack({ ok: false, reason: "busy" });
        return;
      }

      const call: ActiveCall = {
        callerId: userId,
        calleeId: data.targetUserId,
        startedAt: now,
        accepted: false,
      };
      call.ringTimer = setTimeout(() => {
        // The entry may already have been answered, ended or replaced — only a
        // still-ringing call times out, and both sides must be told so the
        // caller stops ringing and the callee's other devices stop glowing.
        if (activeCalls.get(data.roomId) !== call) return;
        activeCalls.delete(data.roomId);
        io.to(`user:${call.callerId}`).emit("call_timeout", { roomId: data.roomId });
        io.to(`user:${call.calleeId}`).emit("call_timeout", { roomId: data.roomId });
      }, RING_TIMEOUT_MS);
      activeCalls.set(data.roomId, call);

      io.to(`user:${data.targetUserId}`).emit("call_invite", {
        callerId: userId,
        callType: data.callType,
        roomId: data.roomId,
      });
      ack({ ok: true });
    });

    socket.on("call_accept", (payload: unknown, ack?: unknown) => {
      const reply: Ack = typeof ack === "function" ? (ack as Ack) : noAck;
      const data = parse(roomTarget, payload);
      if (!data) {
        reply({ ok: false, reason: "invalid" });
        return;
      }
      const call = activeCalls.get(data.roomId);
      if (!call || call.calleeId !== userId || call.callerId !== data.targetUserId) {
        reply({ ok: false, reason: "gone" });
        return;
      }
      // A second device of the callee answering the same ring: the first one
      // wins, or the caller would receive two offers for one call.
      if (call.accepted) {
        reply({ ok: false, reason: "gone" });
        return;
      }
      call.accepted = true;
      if (call.ringTimer) clearTimeout(call.ringTimer);
      io.to(`user:${data.targetUserId}`).emit("call_accept", { accepterId: userId, roomId: data.roomId });
      // The accepter's OWN other devices are still glowing and ringing — tell
      // them the call was picked up here so they stand down.
      io.to(`user:${userId}`).emit("call_accepted", { roomId: data.roomId });
      reply({ ok: true });
    });

    socket.on("call_reject", (payload: unknown) => {
      const data = parse(targetRef, payload);
      if (!data) return;
      const live = callBetween(userId, data.targetUserId);
      if (!live) return;
      const roomId = live.roomId;
      dropCall(roomId);
      io.to(`user:${data.targetUserId}`).emit("call_reject", { rejecterId: userId });
      // Sibling devices of whoever declined are still ringing.
      io.to(`user:${userId}`).emit("call_rejected", { roomId });
    });

    socket.on("call_end", (payload: unknown) => {
      const data = parse(targetRef, payload);
      if (!data) return;
      const live = callBetween(userId, data.targetUserId);
      if (!live) return;
      dropCall(live.roomId);
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

    socket.on("disconnecting", () => {
      // A dropped connection never gets to emit `voice_leave`, so the other
      // members would keep a ghost participant. `disconnecting` still has the
      // socket's rooms; `disconnect` has already left them.
      for (const room of socket.rooms) {
        if (room.startsWith("voice:")) {
          socket.to(room).emit("voice_user_leave", {
            userId,
            channelId: room.slice("voice:".length),
          });
        }
      }
    });

    socket.on("disconnect", () => {
      // The socket has already been removed from its rooms by now, so the
      // room size is the count of OTHER live connections for this user
      // (e.g. a second tab).
      const remaining = io.sockets.adapter.rooms.get(`user:${userId}`)?.size ?? 0;

      // Still connected elsewhere. Relaying must keep working for this user,
      // so leave their call state alone — otherwise closing a second tab
      // silently tears down a call the peer is still sitting in.
      if (remaining > 0) return;

      // This was their last connection, so nobody is left to talk to on their
      // calls: stop relaying signalling for them — and TELL the other side.
      // Deleting the entry silently left the peer sitting in a call that could
      // never be signalled again: no offer, no candidates, no hang-up, just a
      // frozen screen until their own client gave up.
      for (const [roomId, call] of [...activeCalls]) {
        if (call.callerId !== userId && call.calleeId !== userId) continue;
        dropCall(roomId);
        const other = call.callerId === userId ? call.calleeId : call.callerId;
        io.to(`user:${other}`).emit(
          call.accepted ? "call_end" : "call_timeout",
          { roomId, enderId: userId }
        );
      }

      prisma.user
        .update({ where: { id: userId }, data: { status: "offline", lastSeen: new Date() } })
        .catch((err) => console.error(`[socket] failed to mark ${userId} offline:`, err));
    });
  });
}
