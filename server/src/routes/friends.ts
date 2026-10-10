import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticate, AuthRequest, requireUser } from "../middleware/auth.js";
import { AppError, asyncHandler, ok, parseOrThrow } from "../lib/http.js";
import { paramId } from "../lib/access.js";
import { createNotification } from "../lib/notifications.js";

const router = Router();

const requestSchema = z.object({ userId: z.string().uuid() });
const requestIdSchema = z.object({ requestId: z.string().uuid() });

const userSelect = { id: true, username: true, avatar: true, status: true } as const;

interface FriendUser {
  id: string;
  username: string;
  avatar: string | null;
  status: string;
}

interface FriendshipRow {
  id: string;
  userId: string;
  friendId: string;
  createdAt: Date;
  user: FriendUser | null;
  friend: FriendUser | null;
}

/**
 * Collapses a friendship into a single entry.
 *
 * Accepting a request writes two directed rows — `A→B` and `B→A` — so either
 * side can find the friendship without a second query. A lookup for
 * "everyone I am friends with" therefore matches both rows and yields the
 * same person twice, which is what the friends list rendered before this
 * collapse existed.
 *
 * Keyed by the *other* user's id rather than the row id, so the identity of
 * an entry does not depend on which of the two rows happened to come back
 * first. Rows whose other user could not be loaded are skipped: a person who
 * cannot be rendered is not a friend row worth showing.
 */
export function toFriendList(
  rows: FriendshipRow[],
  userId: string
): Array<{ id: string; friend: FriendUser; createdAt: Date }> {
  const seen = new Set<string>();
  const friends: Array<{ id: string; friend: FriendUser; createdAt: Date }> = [];

  for (const row of rows) {
    const outgoing = row.userId === userId;
    const otherId = outgoing ? row.friendId : row.userId;
    const other = outgoing ? row.friend : row.user;
    if (!other || seen.has(otherId)) continue;

    seen.add(otherId);
    friends.push({ id: otherId, friend: other, createdAt: row.createdAt });
  }

  return friends;
}

router.get(
  "/",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);

    const friendships = await prisma.friend.findMany({
      where: { OR: [{ userId }, { friendId: userId }] },
      include: { user: { select: userSelect }, friend: { select: userSelect } },
    });

    ok(res, { friends: toFriendList(friendships, userId) });
  })
);

router.get(
  "/requests",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const requests = await prisma.friendRequest.findMany({
      where: { receiverId: requireUser(req), status: "pending" },
      include: { sender: { select: userSelect } },
      orderBy: { createdAt: "desc" },
    });

    ok(res, { requests });
  })
);

router.get(
  "/requests/sent",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const requests = await prisma.friendRequest.findMany({
      where: { senderId: requireUser(req), status: "pending" },
      include: { receiver: { select: userSelect } },
      orderBy: { createdAt: "desc" },
    });

    ok(res, { requests });
  })
);

router.post(
  "/request",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const { userId: targetId } = parseOrThrow(requestSchema, req.body);

    if (targetId === userId) {
      throw AppError.of("BAD_REQUEST", "Cannot send a friend request to yourself");
    }

    const targetUser = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!targetUser) throw AppError.of("NOT_FOUND", "User not found");

    const existingFriendship = await prisma.friend.findFirst({
      where: {
        OR: [
          { userId, friendId: targetId },
          { userId: targetId, friendId: userId },
        ],
      },
      select: { id: true },
    });
    if (existingFriendship) throw AppError.of("CONFLICT", "You are already friends");

    const existingRequest = await prisma.friendRequest.findFirst({
      where: {
        OR: [
          { senderId: userId, receiverId: targetId },
          { senderId: targetId, receiverId: userId },
        ],
        status: "pending",
      },
      select: { id: true },
    });
    if (existingRequest) throw AppError.of("CONFLICT", "A friend request between you already exists");

    const friendRequest = await prisma.friendRequest.create({
      data: { senderId: userId, receiverId: targetId },
      include: { sender: { select: userSelect } },
    });

    void createNotification({
      userId: targetId,
      type: "friend_request",
      message: "Sent you a friend request",
      fromUserId: userId,
    });

    ok(res, { request: friendRequest }, 201);
  })
);

router.post(
  "/accept",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const { requestId } = parseOrThrow(requestIdSchema, req.body);

    const friendRequest = await prisma.friendRequest.findUnique({ where: { id: requestId } });
    if (!friendRequest) throw AppError.of("NOT_FOUND", "Friend request not found");
    if (friendRequest.receiverId !== userId) throw AppError.of("FORBIDDEN", "Not authorized");
    if (friendRequest.status !== "pending") throw AppError.of("CONFLICT", "Friend request already processed");

    await prisma.$transaction([
      prisma.friendRequest.update({ where: { id: requestId }, data: { status: "accepted" } }),
      prisma.friend.create({ data: { userId: friendRequest.senderId, friendId: friendRequest.receiverId } }),
      prisma.friend.create({ data: { userId: friendRequest.receiverId, friendId: friendRequest.senderId } }),
    ]);

    ok(res, { message: "Friend request accepted" });
  })
);

/** Receiver declines an incoming request. */
router.post(
  "/reject",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const { requestId } = parseOrThrow(requestIdSchema, req.body);

    const friendRequest = await prisma.friendRequest.findUnique({ where: { id: requestId } });
    if (!friendRequest) throw AppError.of("NOT_FOUND", "Friend request not found");
    if (friendRequest.receiverId !== userId) throw AppError.of("FORBIDDEN", "Not authorized");
    if (friendRequest.status !== "pending") throw AppError.of("CONFLICT", "Friend request already processed");

    await prisma.friendRequest.update({ where: { id: requestId }, data: { status: "rejected" } });

    ok(res, { message: "Friend request rejected" });
  })
);

/** Sender withdraws an outgoing request. */
router.delete(
  "/request/:requestId",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const requestId = paramId(req.params.requestId, "request id");

    const friendRequest = await prisma.friendRequest.findUnique({ where: { id: requestId } });
    if (!friendRequest) throw AppError.of("NOT_FOUND", "Friend request not found");
    if (friendRequest.senderId !== userId) throw AppError.of("FORBIDDEN", "Not authorized");
    if (friendRequest.status !== "pending") throw AppError.of("CONFLICT", "Friend request already processed");

    await prisma.friendRequest.delete({ where: { id: requestId } });

    ok(res, { message: "Friend request cancelled" });
  })
);

router.delete(
  "/remove/:friendId",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const friendId = paramId(req.params.friendId, "user id");

    const result = await prisma.friend.deleteMany({
      where: {
        OR: [
          { userId, friendId },
          { userId: friendId, friendId: userId },
        ],
      },
    });

    if (result.count === 0) throw AppError.of("NOT_FOUND", "You are not friends with that user");

    ok(res, { message: "Friend removed" });
  })
);

export default router;
