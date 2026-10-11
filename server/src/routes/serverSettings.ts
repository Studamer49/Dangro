import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticate, AuthRequest, requireUser } from "../middleware/auth.js";
import { AppError, asyncHandler, ok, parseOrThrow } from "../lib/http.js";
import { paramId } from "../lib/access.js";
import { nullableMediaUrl } from "../lib/urls.js";
import { ROLES, assertOutranks, requireServerPermission } from "../lib/permissions.js";

/**
 * Server settings: the profile, the member list, and role changes.
 *
 * Every mutation goes through the role hierarchy in `lib/permissions.ts` so
 * that "who may act on whom" is decided in exactly one place.
 */

const router = Router();

const updateServerSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    icon: nullableMediaUrl(),
    description: z.string().trim().max(500).nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update" });

const updateMemberSchema = z.object({
  role: z.enum(ROLES),
  nickname: z.string().trim().min(1).max(32).nullish().optional(),
});

router.patch(
  "/servers/:id",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const id = String(req.params.id ?? "");
    const input = parseOrThrow(updateServerSchema, req.body);

    await requireServerPermission(id, userId, "manageServer");

    const server = await prisma.server.update({
      where: { id },
      data: {
        name: input.name,
        icon: input.icon === undefined ? undefined : input.icon ?? null,
        description: input.description === undefined ? undefined : input.description ?? null,
      },
      include: { channels: { orderBy: { position: "asc" } }, categories: { orderBy: { position: "asc" } } },
    });

    ok(res, { server });
  })
);

/** The member list behind "Server Settings → Members". */
router.get(
  "/servers/:id/members",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const id = String(req.params.id ?? "");

    // Any member may see the roster; only managers may change it.
    const member = await prisma.member.findUnique({
      where: { userId_serverId: { userId, serverId: id } },
      select: { id: true },
    });
    if (!member) throw AppError.of("FORBIDDEN", "You are not a member of this server");

    const members = await prisma.member.findMany({
      where: { serverId: id },
      include: {
        user: { select: { id: true, username: true, avatar: true, status: true, createdAt: true } },
      },
      orderBy: { joinedAt: "asc" },
    });

    ok(res, { members });
  })
);

router.patch(
  "/servers/:id/members/:memberId",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const id = String(req.params.id ?? "");
    const memberId = paramId(req.params.memberId, "member id");
    const input = parseOrThrow(updateMemberSchema, req.body);

    const actor = await requireServerPermission(id, userId, "manageRoles");

    const target = await prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, userId: true, serverId: true, role: true },
    });
    if (!target || target.serverId !== id) throw AppError.of("NOT_FOUND", "Member not found");

    const ownerId = await prisma.server.findUnique({ where: { id }, select: { ownerId: true } });
    const targetIsOwner = ownerId?.ownerId === target.userId;

    // "owner" is not assignable: ownership moves only through /transfer.
    if (input.role === "owner") {
      throw AppError.of("BAD_REQUEST", "Transfer ownership instead of assigning the owner role");
    }

    // Changing your own role, or anyone at or above your level, is refused.
    if (!targetIsOwner) assertOutranks(actor, target.role, false);

    const updated = await prisma.member.update({
      where: { id: memberId },
      data: {
        role: input.role,
        nickname: input.nickname === undefined ? undefined : input.nickname ?? null,
      },
      include: { user: { select: { id: true, username: true, avatar: true, status: true } } },
    });

    ok(res, { member: updated });
  })
);

/** Kick a member. The same hierarchy check as a role change. */
router.delete(
  "/servers/:id/members/:memberId",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const id = String(req.params.id ?? "");
    const memberId = paramId(req.params.memberId, "member id");

    const actor = await requireServerPermission(id, userId, "kickMembers");

    const target = await prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, userId: true, serverId: true, role: true },
    });
    if (!target || target.serverId !== id) throw AppError.of("NOT_FOUND", "Member not found");

    const server = await prisma.server.findUnique({ where: { id }, select: { ownerId: true } });
    assertOutranks(actor, target.role, server?.ownerId === target.userId);

    await prisma.member.delete({ where: { id: memberId } });

    ok(res, { message: "Member removed" });
  })
);

/** Move ownership. Owner only, and the new owner must already be a member. */
router.post(
  "/servers/:id/transfer",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const id = String(req.params.id ?? "");
    const { memberId } = parseOrThrow(z.object({ memberId: z.string().uuid() }), req.body);

    await requireServerPermission(id, userId, "manageServer");

    const target = await prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, userId: true, serverId: true },
    });
    if (!target || target.serverId !== id) throw AppError.of("NOT_FOUND", "Member not found");
    if (target.userId === userId) throw AppError.of("BAD_REQUEST", "You already own this server");

    await prisma.$transaction([
      prisma.server.update({ where: { id }, data: { ownerId: target.userId } }),
      // The outgoing owner's membership row becomes an ordinary admin.
      prisma.member.update({ where: { id: memberId }, data: { role: "admin" } }),
    ]);

    ok(res, { message: "Ownership transferred" });
  })
);

export default router;
