import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticate, AuthRequest, requireUser } from "../middleware/auth.js";
import { AppError, asyncHandler, ok, parseOrThrow } from "../lib/http.js";
import { paramId } from "../lib/access.js";
import { nullableMediaUrl } from "../lib/urls.js";
import {
  assertOutranks,
  loadServerRoles,
  loadTarget,
  requireMember,
  requirePermission,
} from "../lib/permissions.js";

/**
 * Server settings: the profile, the member list, and member changes.
 *
 * Every mutation goes through the role hierarchy in `lib/permissions.ts` so
 * that "who may act on whom" is decided in exactly one place.
 */

const router = Router();

const updateServerSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    icon: nullableMediaUrl(),
    banner: nullableMediaUrl(),
    description: z.string().trim().max(500).nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update" });

/** A member holds any number of roles, Discord-style. */
const updateMemberSchema = z.object({
  roleIds: z.array(z.string().uuid()).max(20).optional(),
  nickname: z.string().trim().min(1).max(32).nullish().optional(),
});

router.patch(
  "/servers/:id",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const id = String(req.params.id ?? "");
    const input = parseOrThrow(updateServerSchema, req.body);

    await requirePermission(id, userId, "MANAGE_SERVER");

    const server = await prisma.server.update({
      where: { id },
      data: {
        name: input.name,
        icon: input.icon === undefined ? undefined : input.icon ?? null,
        banner: input.banner === undefined ? undefined : input.banner ?? null,
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
    await requireMember(id, userId);

    const members = await prisma.member.findMany({
      where: { serverId: id },
      include: {
        user: { select: { id: true, username: true, avatar: true, status: true, createdAt: true } },
      },
      orderBy: { joinedAt: "asc" },
    });

    const links = await prisma.memberRole.findMany({
      where: { member: { serverId: id } },
      select: { memberId: true, roleId: true },
    });
    const rolesByMember = new Map<string, string[]>();
    for (const link of links) {
      const bucket = rolesByMember.get(link.memberId);
      if (bucket) bucket.push(link.roleId);
      else rolesByMember.set(link.memberId, [link.roleId]);
    }

    const roles = await loadServerRoles(id);
    const owner = await prisma.server.findUnique({ where: { id }, select: { ownerId: true } });

    ok(res, {
      members: members.map((member) => ({
        ...member,
        roleIds: rolesByMember.get(member.id) ?? [],
        isOwner: owner?.ownerId === member.userId,
        // Resolved so the UI can grey out actions the viewer may not take.
        position: roles
          .filter((role) => (rolesByMember.get(member.id) ?? []).includes(role.id))
          .reduce((highest, role) => Math.max(highest, role.position), 0),
      })),
    });
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

    const actor = await requirePermission(id, userId, "MANAGE_ROLES");

    const target = await prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, userId: true, serverId: true },
    });
    if (!target || target.serverId !== id) throw AppError.of("NOT_FOUND", "Member not found");

    const server = await prisma.server.findUnique({ where: { id }, select: { ownerId: true } });
    const serverRoles = await loadServerRoles(id);
    const resolved = await loadTarget(id, memberId, serverRoles, server?.ownerId ?? "");

    // Changing your own roles, or anyone at or above your level, is refused.
    assertOutranks(actor, resolved);

    if (input.roleIds) {
      // @everyone is implicit and cannot be assigned or removed by hand.
      const everyone = serverRoles.find((role) => role.isEveryone);
      const assignable = input.roleIds.filter((roleId) => roleId !== everyone?.id);

      const byId = new Map(serverRoles.map((role) => [role.id, role]));
      for (const roleId of assignable) {
        const role = byId.get(roleId);
        if (!role) throw AppError.of("BAD_REQUEST", "Unknown role for this server");
        // Handing out a role at or above your own reach would be a privilege
        // escalation — an admin could promote someone past themselves and act
        // through them — so it is refused even by someone who could otherwise
        // assign roles. Mirrors the check in `PUT .../members/:id/roles`.
        if (!actor.isOwner && role.position >= actor.position) {
          throw AppError.of("FORBIDDEN", "You cannot assign a role at or above your own highest role");
        }
      }

      await prisma.memberRole.deleteMany({ where: { memberId } });
      for (const roleId of assignable) {
        await prisma.memberRole.create({ data: { memberId, roleId } });
      }
    }

    const updated = await prisma.member.update({
      where: { id: memberId },
      data: { nickname: input.nickname === undefined ? undefined : input.nickname ?? null },
      include: { user: { select: { id: true, username: true, avatar: true, status: true } } },
    });

    const links = await prisma.memberRole.findMany({
      where: { memberId },
      select: { roleId: true },
    });

    ok(res, { member: { ...updated, roleIds: links.map((link) => link.roleId) } });
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

    const actor = await requirePermission(id, userId, "KICK_MEMBERS");

    const target = await prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, userId: true, serverId: true },
    });
    if (!target || target.serverId !== id) throw AppError.of("NOT_FOUND", "Member not found");

    const server = await prisma.server.findUnique({ where: { id }, select: { ownerId: true } });
    const serverRoles = await loadServerRoles(id);
    assertOutranks(actor, await loadTarget(id, memberId, serverRoles, server?.ownerId ?? ""));

    // The member's role links cascade with the row.
    await prisma.member.delete({ where: { id: memberId } });

    ok(res, { message: "Member removed" });
  })
);

/** Optional free-text reason attached to a ban. */
const banReason = z.string().trim().max(300).nullish();

/** The ban list behind "Server Settings → Members → Banned". */
router.get(
  "/servers/:id/bans",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const id = paramId(req.params.id, "server id");

    await requirePermission(id, userId, "BAN_MEMBERS");

    const bans = await prisma.ban.findMany({
      where: { serverId: id },
      include: {
        user: { select: { id: true, username: true, avatar: true } },
        moderator: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    ok(res, { bans });
  })
);

/**
 * Ban a user. Landing the ban also removes their member row, so a banned user
 * cannot keep reading the server; the ban itself is what blocks them rejoining.
 */
router.post(
  "/servers/:id/bans",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const id = paramId(req.params.id, "server id");
    const { userId: targetId, reason } = parseOrThrow(
      z.object({ userId: z.string().uuid(), reason: banReason }),
      req.body
    );

    const actor = await requirePermission(id, userId, "BAN_MEMBERS");

    if (targetId === userId) throw AppError.of("BAD_REQUEST", "You cannot ban yourself");

    const server = await prisma.server.findUnique({ where: { id }, select: { ownerId: true } });
    if (!server) throw AppError.of("NOT_FOUND", "Server not found");
    if (server.ownerId === targetId) {
      throw AppError.of("FORBIDDEN", "The server owner cannot be banned");
    }

    // If the target is still a member, the same hierarchy rule as a kick applies.
    const member = await prisma.member.findUnique({
      where: { userId_serverId: { userId: targetId, serverId: id } },
      select: { id: true },
    });
    if (member) {
      const serverRoles = await loadServerRoles(id);
      assertOutranks(actor, await loadTarget(id, member.id, serverRoles, server.ownerId));
    }

    const ban = await prisma.ban.upsert({
      where: { serverId_userId: { serverId: id, userId: targetId } },
      create: { serverId: id, userId: targetId, moderatorId: userId, reason: reason ?? null },
      update: { moderatorId: userId, reason: reason ?? null },
      include: { user: { select: { id: true, username: true, avatar: true } } },
    });

    if (member) await prisma.member.delete({ where: { id: member.id } });

    ok(res, { ban }, 201);
  })
);

/** Lift a ban. The user must be re-invited to return. */
router.delete(
  "/servers/:id/bans/:userId",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const id = paramId(req.params.id, "server id");
    const targetId = paramId(req.params.userId, "user id");

    await requirePermission(id, userId, "BAN_MEMBERS");

    const existing = await prisma.ban.findUnique({
      where: { serverId_userId: { serverId: id, userId: targetId } },
      select: { id: true },
    });
    if (!existing) throw AppError.of("NOT_FOUND", "Ban not found");

    await prisma.ban.delete({ where: { id: existing.id } });

    ok(res, { message: "Ban lifted" });
  })
);

/** Move ownership. The outgoing owner keeps the Admin role. */
router.post(
  "/servers/:id/transfer",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const id = String(req.params.id ?? "");
    const { memberId } = parseOrThrow(z.object({ memberId: z.string().uuid() }), req.body);

    // Only the owner can hand the server on, even though MANAGE_SERVER is
    // normally an admin permission.
    const actor = await requirePermission(id, userId, "MANAGE_SERVER");
    if (!actor.isOwner) {
      throw AppError.of("FORBIDDEN", "Only the server owner can transfer ownership");
    }

    const target = await prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, userId: true, serverId: true },
    });
    if (!target || target.serverId !== id) throw AppError.of("NOT_FOUND", "Member not found");
    if (target.userId === userId) throw AppError.of("BAD_REQUEST", "You already own this server");

    // The new owner gets the Admin role so they keep full access afterwards.
    const admin = (await loadServerRoles(id)).find((role) => role.name === "Admin");
    const existing = await prisma.memberRole.findMany({ where: { memberId }, select: { roleId: true } });

    const operations = [
      prisma.server.update({ where: { id }, data: { ownerId: target.userId } }),
    ];
    if (admin && !existing.some((link) => link.roleId === admin.id)) {
      operations.push(
        prisma.memberRole.create({ data: { memberId, roleId: admin.id } }) as never
      );
    }
    await prisma.$transaction(operations as never);

    ok(res, { message: "Ownership transferred" });
  })
);

export default router;
