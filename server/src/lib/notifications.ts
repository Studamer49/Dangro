import { prisma } from "../prisma.js";
import { getIO } from "../socket/io.js";

export interface CreateNotificationInput {
  userId: string;
  type: "friend_request" | "friend_accept" | "server_invite" | "follow" | "mention" | "message_request" | "message_request_accepted";
  message: string;
  fromUserId?: string;
  serverId?: string;
  channelId?: string;
}

/**
 * Best-effort: a notification failure must never fail the action that
 * triggered it.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  try {
    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        message: input.message,
        fromUserId: input.fromUserId,
        serverId: input.serverId,
        channelId: input.channelId,
      },
      include: { fromUser: { select: { id: true, username: true, avatar: true } } },
    });

    const unreadCount = await prisma.notification.count({ where: { userId: input.userId, read: false } });

    getIO()?.to(`user:${input.userId}`).emit("notification", { notification, unreadCount });
  } catch (err) {
    console.error("[notifications] failed to create notification:", err);
  }
}
