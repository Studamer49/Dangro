import { prisma } from "../prisma.js";
import { AppError } from "./http.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Rejects malformed path parameters before they reach Prisma. */
export function paramId(value: unknown, label = "id"): string {
  if (typeof value !== "string" || !isUuid(value)) {
    throw AppError.of("BAD_REQUEST", `Invalid ${label}`);
  }
  return value;
}

export async function findServerOr404(serverId: string) {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    include: {
      channels: true,
      members: { include: { user: { select: { id: true, username: true, avatar: true, status: true } } } },
    },
  });
  if (!server) throw AppError.of("NOT_FOUND", "Server not found");
  return server;
}

export async function assertServerMember(serverId: string, userId: string, roles?: string[]) {
  const member = await prisma.member.findUnique({
    where: { userId_serverId: { userId, serverId } },
  });
  if (!member) throw AppError.of("FORBIDDEN", "You are not a member of this server");
  if (roles && !roles.includes(member.role)) {
    throw AppError.of("FORBIDDEN", "You do not have permission to do that");
  }
  return member;
}

/** Loads a channel and guarantees the caller belongs to its server. */
export async function assertChannelMember(channelId: string, userId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: { server: { include: { members: { where: { userId } } } } },
  });
  if (!channel) throw AppError.of("NOT_FOUND", "Channel not found");
  if (channel.server.members.length === 0) {
    throw AppError.of("FORBIDDEN", "You are not a member of this server");
  }
  return channel;
}

export async function assertConversationMember(conversationId: string, userId: string) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) throw AppError.of("NOT_FOUND", "Conversation not found");
  if (conversation.user1Id !== userId && conversation.user2Id !== userId) {
    throw AppError.of("FORBIDDEN", "You are not a participant in this conversation");
  }
  return conversation;
}

/** A reply may only reference a message in the same channel. */
export async function assertChannelReply(replyToId: string | null | undefined, channelId: string): Promise<void> {
  if (!replyToId) return;
  if (!isUuid(replyToId)) throw AppError.of("BAD_REQUEST", "Invalid reply target");
  const target = await prisma.message.findUnique({ where: { id: replyToId }, select: { channelId: true } });
  if (!target || target.channelId !== channelId) {
    throw AppError.of("BAD_REQUEST", "Reply target does not belong to this channel");
  }
}

/** A DM reply may only reference a message in the same conversation. */
export async function assertDirectMessageReply(
  replyToId: string | null | undefined,
  conversationId: string
): Promise<void> {
  if (!replyToId) return;
  if (!isUuid(replyToId)) throw AppError.of("BAD_REQUEST", "Invalid reply target");
  const target = await prisma.directMessage.findUnique({
    where: { id: replyToId },
    select: { conversationId: true },
  });
  if (!target || target.conversationId !== conversationId) {
    throw AppError.of("BAD_REQUEST", "Reply target does not belong to this conversation");
  }
}
