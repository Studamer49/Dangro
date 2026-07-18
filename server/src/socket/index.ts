import { Server as SocketServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { prisma } from "../prisma.js";

interface AuthPayload {
  userId: string;
}

export function setupSocketHandlers(io: SocketServer): void {
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("Authentication error"));
    }

    try {
      const decoded = jwt.verify(token, config.jwtSecret) as AuthPayload;
      socket.data.userId = decoded.userId;
      next();
    } catch {
      next(new Error("Authentication error"));
    }
  });

  io.on("connection", async (socket: Socket) => {
    const userId = socket.data.userId as string;
    console.log(`User connected: ${userId}`);

    await prisma.user.update({
      where: { id: userId },
      data: { status: "online" },
    });

    socket.join(`user:${userId}`);

    socket.on("join_server", (serverId: string) => {
      socket.join(`server:${serverId}`);
    });

    socket.on("leave_server", (serverId: string) => {
      socket.leave(`server:${serverId}`);
    });

    socket.on("join_channel", (channelId: string) => {
      socket.join(`channel:${channelId}`);
    });

    socket.on("leave_channel", (channelId: string) => {
      socket.leave(`channel:${channelId}`);
    });

    socket.on("message", async (data: { content: string; channelId: string; replyToId?: string }) => {
      try {
        const message = await prisma.message.create({
          data: {
            content: data.content,
            authorId: userId,
            channelId: data.channelId,
            replyToId: data.replyToId,
          },
          include: {
            author: { select: { id: true, username: true, avatar: true } },
            replyTo: {
              include: { author: { select: { id: true, username: true } } },
            },
            reactions: true,
            attachments: true,
          },
        });

        io.to(`channel:${data.channelId}`).emit("new_message", message);
      } catch (err) {
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    socket.on("typing_start", (data: { channelId: string }) => {
      socket.to(`channel:${data.channelId}`).emit("typing_start", {
        userId,
        channelId: data.channelId,
      });
    });

    socket.on("typing_stop", (data: { channelId: string }) => {
      socket.to(`channel:${data.channelId}`).emit("typing_stop", {
        userId,
        channelId: data.channelId,
      });
    });

    socket.on("voice_join", (data: { channelId: string }) => {
      socket.join(`voice:${data.channelId}`);
      socket.to(`voice:${data.channelId}`).emit("voice_user_join", {
        userId,
        channelId: data.channelId,
      });
    });

    socket.on("voice_leave", (data: { channelId: string }) => {
      socket.leave(`voice:${data.channelId}`);
      socket.to(`voice:${data.channelId}`).emit("voice_user_leave", {
        userId,
        channelId: data.channelId,
      });
    });

    socket.on("voice_signal", (data: { targetUserId: string; signal: unknown }) => {
      io.to(`user:${data.targetUserId}`).emit("voice_signal", {
        userId,
        signal: data.signal,
      });
    });

    socket.on("disconnect", async () => {
      console.log(`User disconnected: ${userId}`);
      await prisma.user.update({
        where: { id: userId },
        data: { status: "offline", lastSeen: new Date() },
      });
    });
  });
}
