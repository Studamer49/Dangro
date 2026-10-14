import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticate, AuthRequest, requireUser } from "../middleware/auth.js";
import { AppError, asyncHandler, ok, parseOrThrow } from "../lib/http.js";
import {
  ALL_PERMISSIONS,
  PERMISSION_GROUPS,
  OWNER_POSITION,
  assertOutranks,
  loadActor,
  loadServerRoles,
  loadTarget,
  permissionKeySchema,
  requirePermission,
} from "../lib/permissions.js";

/**
 * Role management: create, edit, reorder and delete the roles of a server, and
 * assign them to members.
 *
 * Discord's rules, enforced here so they hold everywhere:
 *   - @everyone cannot be deleted, renamed or have its position changed, and
 *     cannot be assigned by hand.
 *   - the owner is not a role; ownership moves through /transfer.
 *   - you may only manage roles strictly below your own highest role, so two
 *     admins cannot rewrite each other's powers.
 */

const router = Router();

const roleSelect = {
  id: true,
  serverId: true,
  name: true,
  color: true,
  position: true,
  permissions: true,
  isEveryone: true,
  hoist: true,
} as const;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const createRoleSchema = z.object({
  serverId: z.string().uuid(),
  name: z.string().trim().min(1).max(32),
  color: z.string().regex(HEX_COLOR, "Colour must be a hex value like #5865f2").nullish(),
  permissions: z.array(permissionKeySchema).max(ALL_PERMISSIONS.length).default([]),
});

const updateRoleSchema = z
  .object({
    name: z.string().trim().min(1).max(32).optional(),
    color: z.string().regex(HEX_COLOR, "Colour must be a hex value like #5865f2").nullish(),
    permissions: z.array(permissionKeySchema).max(ALL_PERMISSIONS.length).optional(),
    hoist: z.boolean().optional(),
    position: z.number().int().min(1).max(OWNER_POSITION - 1).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update" });

const reorderSchema = z.object({
  roleIds: z.array(z.string().uuid()).max(100),
});

/** Loads a role and refuses one belonging to another server. */
async function findRoleInServer(roleId: string, serverId: string) {
  const role = await prisma.role.findUnique({ where: { id: roleId }, select: roleSelect });
  if (!role || role.serverId !== serverId) throw AppError.of("NOT_FOUND", "Role not found");
  return role;
}

/**
 * Refuses to move a role above the actor's own highest role, which would let an
 * admin promote a role past themselves and then act with it.
 */
async function assertCanPlaceAt(actor: Awaited<ReturnType<typeof requirePermission>>, roleId: string, position: number) {
  if (actor.isOwner) return;
  if (position > actor.position) {
    throw AppError.of("FORBIDDEN", "You cannot create or move a role above your own highest role");
  }
  void roleId;
}

/**
 * The permission catalogue, so the settings UI does not hardcode a second copy
 * that can drift from the server's enforcement.
 *
 * Public: it describes what a role can be granted, not who holds what.
 */
router.get(
  "/permissions",
  asyncHandler(async (_req: Request, res) => {
    ok(res, {
      groups: PERMISSION_GROUPS.map((group) => ({
        name: group.name,
        permissions: group.permissions as Record<string, { label: string; description: string }>,
      })),
      all: ALL_PERMISSIONS,
    });
  })
);

router.get(
  "/servers/:id/roles",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const serverId = String(req.params.id ?? "");

    // Reading the role list is allowed to any member; the settings UI uses it
    // to label people, and hiding it would make the member list unreadable.
    // Without this check the endpoint handed the full permission matrix of
    // *any* server to any authenticated caller who could guess its id.
    await loadActor(serverId, userId);

    const roles = await loadServerRoles(serverId);

    const counts = await prisma.memberRole.findMany({
      where: { role: { serverId } },
      select: { roleId: true },
    });
    const tally = new Map<string, number>();
    for (const row of counts) tally.set(row.roleId, (tally.get(row.roleId) ?? 0) + 1);

    ok(res, { roles: roles.map((role) => ({ ...role, memberCount: tally.get(role.id) ?? 0 })) });
  })
);

router.post(
  "/servers/:id/roles",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const serverId = String(req.params.id ?? "");
    const input = parseOrThrow(createRoleSchema, { ...req.body, serverId });

    const actor = await requirePermission(serverId, userId, "MANAGE_ROLES");

    const roles = await loadServerRoles(serverId);
    // New roles land at the bottom of the actor's reach, never above it.
    const position = Math.min(
      ...roles.filter((role) => role.position <= actor.position).map((role) => role.position),
      actor.position
    );
    await assertCanPlaceAt(actor, "", position - 1);

    const role = await prisma.role.create({
      data: {
        serverId,
        name: input.name,
        color: input.color ?? null,
        // Strictly below the actor so an admin cannot mint a superior role.
        position: actor.isOwner ? position : Math.max(0, position - 1),
        permissions: input.permissions,
        isEveryone: false,
        hoist: false,
      },
      select: roleSelect,
    });

    ok(res, { role: { ...role, memberCount: 0 } }, 201);
  })
);

router.patch(
  "/servers/:id/roles/:roleId",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const serverId = String(req.params.id ?? "");
    const roleId = String(req.params.roleId ?? "");
    const input = parseOrThrow(updateRoleSchema, req.body);

    const actor = await requirePermission(serverId, userId, "MANAGE_ROLES");
    const role = await findRoleInServer(roleId, serverId);

    // @everyone is structural: renaming it or moving it breaks every
    // permission resolution in the server.
    if (role.isEveryone && (input.name !== undefined || input.position !== undefined)) {
      throw AppError.of("BAD_REQUEST", "@everyone cannot be renamed or moved");
    }

    if (input.position !== undefined) {
      if (actor.isOwner) {
        if (input.position >= OWNER_POSITION) {
          throw AppError.of("BAD_REQUEST", "That position is reserved for the owner");
        }
      } else {
        // An admin may not promote a role above their own highest role.
        // Strictly below: an admin must not be able to rewrite the very role
        // that grants them their powers just by including `position` in the
        // same request. This has to match the `>=` used by the branch below.
        if (role.position >= actor.position) {
          throw AppError.of("FORBIDDEN", "You cannot edit a role at or above your own highest role");
        }
        if (input.position >= actor.position) {
          throw AppError.of("FORBIDDEN", "You cannot move a role to your own level or above");
        }
      }
    } else if (!actor.isOwner && role.position >= actor.position) {
      // Discord's rule is *strictly* below: without the >= here an admin could
      // rename or rewrite the very role that grants them their powers.
      throw AppError.of("FORBIDDEN", "You cannot edit a role at or above your own highest role");
    }

    // Removing your own admin powers would be a way to lock yourself out
    // mid-session; Discord forbids stripping the role you are acting through.
    const updated = await prisma.role.update({
      where: { id: roleId },
      data: {
        name: input.name,
        color: input.color === undefined ? undefined : input.color ?? null,
        permissions: input.permissions,
        hoist: input.hoist,
        position: input.position,
      },
      select: roleSelect,
    });

    ok(res, { role: updated });
  })
);

router.delete(
  "/servers/:id/roles/:roleId",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const serverId = String(req.params.id ?? "");
    const roleId = String(req.params.roleId ?? "");

    const actor = await requirePermission(serverId, userId, "MANAGE_ROLES");
    const role = await findRoleInServer(roleId, serverId);

    if (role.isEveryone) {
      throw AppError.of("BAD_REQUEST", "@everyone cannot be deleted");
    }
    if (!actor.isOwner && role.position >= actor.position) {
      throw AppError.of("FORBIDDEN", "You cannot delete a role at or above your own highest role");
    }

    // MemberRole links cascade with the role.
    await prisma.role.delete({ where: { id: roleId } });

    ok(res, { message: "Role deleted" });
  })
);

/** Reorder the whole role list, Discord's drag-to-reorder. */
router.post(
  "/servers/:id/roles/reorder",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const serverId = String(req.params.id ?? "");
    const input = parseOrThrow(reorderSchema, req.body);

    const actor = await requirePermission(serverId, userId, "MANAGE_ROLES");
    const roles = await loadServerRoles(serverId);
    const byId = new Map(roles.map((role) => [role.id, role]));

    for (const roleId of input.roleIds) {
      if (!byId.has(roleId)) throw AppError.of("BAD_REQUEST", "Unknown role for this server");
    }

    // Positions are assigned top-down from below the owner. An admin is capped
    // strictly below their own level, so a reorder cannot lift a role past
    // them or put one on their own tier.
    const ceiling = actor.isOwner ? OWNER_POSITION - 1 : actor.position - 1;
    // @everyone is structural and stays pinned where it is. `PATCH` refuses to
    // move it, so a drag must not move it either — otherwise a reorder
    // rewrites the ladder the position field is supposed to preserve.
    const everyoneId = roles.find((role) => role.isEveryone)?.id;
    const movable = input.roleIds.filter((roleId) => roleId !== everyoneId);
    const operations = movable.map((roleId, index) => {
      const position = Math.max(0, Math.min(ceiling, movable.length - index));
      return prisma.role.update({ where: { id: roleId }, data: { position } }) as never;
    });
    await prisma.$transaction(operations);

    ok(res, { roles: await loadServerRoles(serverId) });
  })
);

/** Assign or clear roles on a member. */
router.put(
  "/servers/:id/members/:memberId/roles",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const serverId = String(req.params.id ?? "");
    const memberId = String(req.params.memberId ?? "");
    const { roleIds } = parseOrThrow(
      z.object({ roleIds: z.array(z.string().uuid()).max(20) }),
      req.body ?? {}
    );

    const actor = await requirePermission(serverId, userId, "MANAGE_ROLES");

    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, serverId: true },
    });
    if (!member || member.serverId !== serverId) throw AppError.of("NOT_FOUND", "Member not found");

    const server = await prisma.server.findUnique({ where: { id: serverId }, select: { ownerId: true } });
    const roles = await loadServerRoles(serverId);
    assertOutranks(actor, await loadTarget(serverId, memberId, roles, server?.ownerId ?? ""));

    const everyone = roles.find((role) => role.isEveryone);
    const assignable = roleIds.filter((roleId) => roleId !== everyone?.id);
    const known = new Map(roles.map((role) => [role.id, role]));

    for (const roleId of assignable) {
      const role = known.get(roleId);
      if (!role) throw AppError.of("BAD_REQUEST", "Unknown role for this server");
      // Handing out a role at or above your own reach would be a privilege
      // escalation, so it is refused even by someone who could otherwise
      // assign it.
      if (!actor.isOwner && role.position >= actor.position) {
        throw AppError.of("FORBIDDEN", "You cannot assign a role at or above your own highest role");
      }
    }

    await prisma.memberRole.deleteMany({ where: { memberId } });
    for (const roleId of assignable) {
      await prisma.memberRole.create({ data: { memberId, roleId } });
    }

    ok(res, { roleIds: assignable });
  })
);

export default router;
