import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticate, AuthRequest, requireUser } from "../middleware/auth.js";
import { AppError, asyncHandler, ok, parseOrThrow } from "../lib/http.js";
import { paramId } from "../lib/access.js";

const router = Router();

const updateProfileSchema = z.object({
  username: z.string().min(3).max(32).regex(/^\S+$/, "Username cannot contain spaces").optional(),
  email: z.string().email().max(254).optional(),
  bio: z.string().max(500).optional(),
  avatar: z.string().max(500).nullish(),
  status: z.enum(["online", "idle", "dnd", "offline"]).optional(),
});

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
});

const publicUserSelect = {
  id: true,
  username: true,
  avatar: true,
  bio: true,
  status: true,
} as const;

router.get(
  "/search",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const { q } = parseOrThrow(searchQuerySchema, req.query);
    const userId = requireUser(req);

    if (!q || q.length < 2) {
      ok(res, { users: [] });
      return;
    }

    const users = await prisma.user.findMany({
      where: {
        id: { not: userId },
        OR: [
          { username: { contains: q, mode: "insensitive" } },
          { bio: { contains: q, mode: "insensitive" } },
        ],
      },
      select: publicUserSelect,
      take: 20,
    });

    ok(res, { users });
  })
);

router.get(
  "/:id",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = paramId(req.params.id, "user id");

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        bio: true,
        avatar: true,
        status: true,
        lastSeen: true,
        createdAt: true,
      },
    });

    if (!user) throw AppError.of("NOT_FOUND", "User not found");

    ok(res, { user });
  })
);

router.patch(
  "/me",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const input = parseOrThrow(updateProfileSchema, req.body);

    if (Object.keys(input).length === 0) {
      throw AppError.of("BAD_REQUEST", "Nothing to update");
    }

    const data: Record<string, string | null> = {};

    if (input.username !== undefined) {
      const existing = await prisma.user.findFirst({
        where: { username: { equals: input.username, mode: "insensitive" }, id: { not: userId } },
        select: { id: true },
      });
      if (existing) throw AppError.of("CONFLICT", "Username already taken");
      data.username = input.username;
    }

    if (input.email !== undefined) {
      const email = input.email.trim().toLowerCase();
      const existing = await prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" }, id: { not: userId } },
        select: { id: true },
      });
      if (existing) throw AppError.of("CONFLICT", "Email already in use");
      data.email = email;
    }

    if (input.bio !== undefined) data.bio = input.bio;
    if (input.avatar !== undefined) data.avatar = input.avatar ?? null;
    if (input.status !== undefined) data.status = input.status;

    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        username: true,
        email: true,
        bio: true,
        avatar: true,
        status: true,
        lastSeen: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    ok(res, { user });
  })
);

export default router;
