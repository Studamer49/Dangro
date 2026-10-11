import { z } from "zod";
import { prisma } from "../prisma.js";
import { AppError } from "./http.js";

/**
 * Discord's model, which is: roles belong to a server, each role carries a set
 * of permissions, a member holds any number of roles, and a role's `position`
 * decides who may act on whom.
 *
 * The previous version hardcoded four global roles (owner/admin/moderator/member)
 * and mapped each permission to a list of them. That cannot express a server
 * whose "Moderator" may also manage channels, and it made the owner special in
 * a way every route had to remember. Here the owner is just the member with the
 * highest possible position and an implicit full permission set.
 */

/** Every permission a role can grant, with the copy the settings UI shows. */
export const PERMISSION_GROUPS = [
  {
    name: "General",
    permissions: {
      VIEW_CHANNEL: {
        label: "View channels",
        description: "See channels by default",
      },
      CHANGE_NICKNAME: {
        label: "Change nickname",
        description: "Change their own nickname",
      },
      CREATE_INVITES: {
        label: "Create invite",
        description: "Create new invites to the server",
      },
    },
  },
  {
    name: "Text",
    permissions: {
      SEND_MESSAGES: { label: "Send messages", description: "Send messages in text channels" },
      SEND_ATTACHMENTS: {
        label: "Attach files and media",
        description: "Upload images, video and files",
      },
      ADD_REACTIONS: { label: "Add reactions", description: "React to messages with emoji" },
      MENTION_EVERYONE: {
        label: "Mention @everyone",
        description: "Notify the whole server at once",
      },
      MANAGE_MESSAGES: {
        label: "Manage messages",
        description: "Delete and pin messages from other people",
      },
    },
  },
  {
    name: "Voice",
    permissions: {
      CONNECT: { label: "Connect", description: "Join voice channels" },
      SPEAK: { label: "Speak", description: "Talk in voice channels" },
      MUTE_MEMBERS: { label: "Mute members", description: "Mute and deafen other members" },
      MOVE_MEMBERS: { label: "Move members", description: "Disconnect or move others" },
    },
  },
  {
    name: "Membership",
    permissions: {
      KICK_MEMBERS: { label: "Kick members", description: "Remove members from the server" },
      BAN_MEMBERS: { label: "Ban members", description: "Permanently ban members" },
      MANAGE_NICKNAMES: {
        label: "Manage nicknames",
        description: "Change other members' nicknames",
      },
    },
  },
  {
    name: "Management",
    permissions: {
      MANAGE_CHANNELS: { label: "Manage channels", description: "Create and edit channels" },
      MANAGE_CATEGORIES: {
        label: "Manage categories",
        description: "Reorder categories and move channels between them",
      },
      MANAGE_ROLES: { label: "Manage roles", description: "Create roles and assign permissions" },
      MANAGE_INVITES: { label: "Manage invites", description: "View and revoke invite links" },
      MANAGE_SERVER: { label: "Manage server", description: "Change the server's name and settings" },
    },
  },
] as const;

export type PermissionGroup = (typeof PERMISSION_GROUPS)[number];

/**
 * Distributes over the groups. A plain `keyof PermissionGroup["permissions"]`
 * intersects the keys of every group instead of unioning them, and since the
 * groups hold disjoint permissions that collapses to `never`.
 */
type PermissionsOf<T> = T extends { permissions: infer P } ? keyof P : never;
export type Permission = PermissionsOf<PermissionGroup>;

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((group) =>
  Object.keys(group.permissions)
) as Permission[];

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && (ALL_PERMISSIONS as string[]).includes(value);
}

/**
 * Permission keys as they arrive over the wire, so an unknown key is a 400
 * rather than a silently ignored entry in a role's permission list.
 */
export const permissionKeySchema = z.custom<Permission>(
  (value) => typeof value === "string" && isPermission(value),
  { message: "Unknown permission" }
);

/**
 * The baseline every member has, matching Discord's @everyone.
 *
 * Deliberately excludes every management permission: joining a server should
 * never hand you the ability to change it.
 */
export const EVERYONE_PERMISSIONS: Permission[] = [
  "VIEW_CHANNEL",
  "SEND_MESSAGES",
  "SEND_ATTACHMENTS",
  "ADD_REACTIONS",
  "CONNECT",
  "SPEAK",
  "CHANGE_NICKNAME",
];

/** What a Moderator adds on top of @everyone. */
export const MODERATOR_PERMISSIONS: Permission[] = [
  ...EVERYONE_PERMISSIONS,
  "MANAGE_MESSAGES",
  "MUTE_MEMBERS",
  "MOVE_MEMBERS",
  "KICK_MEMBERS",
  "MANAGE_NICKNAMES",
];

/** What an Admin adds on top of Moderator. */
export const ADMIN_PERMISSIONS: Permission[] = [
  ...MODERATOR_PERMISSIONS,
  "BAN_MEMBERS",
  "MANAGE_CHANNELS",
  "MANAGE_CATEGORIES",
  "MANAGE_INVITES",
  "MANAGE_ROLES",
  "MANAGE_SERVER",
];

/** Position assigned to the seeded default roles. Owner is above all of them. */
export const DEFAULT_ROLE_POSITIONS = {
  everyone: 0,
  moderator: 10,
  admin: 20,
} as const;

/** A role's position above this is reserved for the owner. */
export const OWNER_POSITION = 1_000;

export interface RoleLike {
  id: string;
  name: string;
  color: string | null;
  position: number;
  permissions: string[];
  isEveryone?: boolean;
  hoist?: boolean;
}

export interface ServerRole extends RoleLike {
  serverId: string;
}

export interface MemberWithRoles {
  id: string;
  userId: string;
  serverId: string;
  /** Legacy single role, kept for old documents; the roles table is truth. */
  role?: string;
  roles?: ServerRole[];
}

/**
 * A resolved caller: what they may do, and how far up the hierarchy they sit.
 */
export interface Actor {
  serverId: string;
  userId: string;
  isOwner: boolean;
  /** Highest position among the member's roles. The owner gets OWNER_POSITION. */
  position: number;
  permissions: Set<Permission>;
  roleIds: string[];
}

/** The owner's position, for comparisons. */
export function actorPosition(actor: Pick<Actor, "isOwner" | "position">): number {
  return actor.isOwner ? OWNER_POSITION : actor.position;
}

export function actorCan(actor: Actor, permission: Permission): boolean {
  // The owner is not a role and can never be demoted out of their permissions.
  if (actor.isOwner) return true;
  return actor.permissions.has(permission);
}

/**
 * Turns stored permission strings into a validated set.
 *
 * Unknown keys are dropped rather than thrown on: a permission renamed in a
 * later deploy must not lock everyone out of the server until they are
 * reassigned.
 */
export function permissionSet(values: readonly string[] | undefined | null): Set<Permission> {
  const set = new Set<Permission>();
  for (const value of values ?? []) {
    if (isPermission(value)) set.add(value);
  }
  return set;
}

/**
 * The permissions a member effectively holds: the union of their roles'.
 *
 * @everyone is included automatically, so a member always keeps the baseline
 * even if no explicit link to it exists.
 */
export function resolvePermissions(
  serverRoles: readonly ServerRole[],
  memberRoleIds: readonly string[],
  isOwner: boolean
): Set<Permission> {
  if (isOwner) return new Set<Permission>(ALL_PERMISSIONS);

  const byId = new Map(serverRoles.map((role) => [role.id, role]));

  const granted = new Set<Permission>(EVERYONE_PERMISSIONS);
  for (const roleId of memberRoleIds) {
    const role = byId.get(roleId);
    if (!role) continue;
    for (const permission of permissionSet(role.permissions)) granted.add(permission);
  }
  return granted;
}

/** The member's highest role position; 0 when they hold no roles. */
export function highestPosition(memberRoleIds: readonly string[], serverRoles: readonly ServerRole[]): number {
  if (memberRoleIds.length === 0) return 0;
  const byId = new Map(serverRoles.map((role) => [role.id, role]));
  let highest = 0;
  for (const roleId of memberRoleIds) {
    const position = byId.get(roleId)?.position ?? 0;
    if (position > highest) highest = position;
  }
  return highest;
}

/**
 * Loads a server's roles once.
 *
 * Every permission check needs them, and hitting the database once per route
 * (twice for the actor + once for the target) is what makes the old
 * string-list approach look cheap.
 */
export async function loadServerRoles(serverId: string): Promise<ServerRole[]> {
  const roles = await prisma.role.findMany({
    where: { serverId },
    orderBy: { position: "desc" },
    select: {
      id: true,
      serverId: true,
      name: true,
      color: true,
      position: true,
      permissions: true,
      isEveryone: true,
      hoist: true,
    },
  });
  return roles as unknown as ServerRole[];
}

/** Resolves the caller against a server's roles. */
export async function loadActor(serverId: string, userId: string): Promise<Actor> {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { ownerId: true },
  });
  if (!server) throw AppError.of("NOT_FOUND", "Server not found");

  const isOwner = server.ownerId === userId;

  const member = await prisma.member.findUnique({
    where: { userId_serverId: { userId, serverId } },
    select: { id: true, role: true },
  });
  if (!member) throw AppError.of("FORBIDDEN", "You are not a member of this server");

  const serverRoles = await loadServerRoles(serverId);
  const roleIds = serverRoles
    .filter((role) => role.isEveryone)
    .map((role) => role.id);
  const links = await prisma.memberRole.findMany({
    where: { memberId: member.id },
    select: { roleId: true },
  });
  const assigned = links.map((link) => link.roleId);

  // A member explicitly linked to @everyone and one that is not must resolve
  // identically, so @everyone is always folded into the role list.
  const effectiveRoleIds = [...new Set([...roleIds, ...assigned])];

  return {
    serverId,
    userId,
    isOwner,
    position: isOwner ? OWNER_POSITION : highestPosition(assigned, serverRoles),
    permissions: resolvePermissions(serverRoles, effectiveRoleIds, isOwner),
    roleIds: assigned,
  };
}

/** Resolves the caller and fails unless they hold `permission`. */
export async function requirePermission(
  serverId: string,
  userId: string,
  permission: Permission
): Promise<Actor> {
  const actor = await loadActor(serverId, userId);
  if (!actorCan(actor, permission)) {
    throw AppError.of("FORBIDDEN", `You need the ${permission} permission to do that`);
  }
  return actor;
}

/** Membership check with no permission requirement — reading is not gated. */
export async function requireMember(serverId: string, userId: string): Promise<Actor> {
  return loadActor(serverId, userId);
}

/**
 * Fails unless the target sits strictly below the actor.
 *
 * Discord's rule, and the one that stops two admins removing each other. The
 * owner is never a valid target: ownership moves only through /transfer.
 */
export function assertOutranks(actor: Actor, target: { userId: string; position: number; isOwner: boolean }): void {
  if (target.isOwner) throw AppError.of("FORBIDDEN", "The server owner cannot be modified");
  if (actor.userId === target.userId) {
    throw AppError.of("BAD_REQUEST", "You cannot do that to yourself");
  }
  if (actorPosition(actor) <= target.position) {
    throw AppError.of("FORBIDDEN", "You cannot act on someone at or above your highest role");
  }
}

/** Resolves a member into the shape `assertOutranks` compares. */
export async function loadTarget(
  serverId: string,
  memberId: string,
  serverRoles: readonly ServerRole[],
  ownerId: string
): Promise<{ userId: string; position: number; isOwner: boolean }> {
  const target = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, userId: true, serverId: true },
  });
  if (!target || target.serverId !== serverId) {
    throw AppError.of("NOT_FOUND", "Member not found");
  }

  if (target.userId === ownerId) {
    return { userId: target.userId, position: OWNER_POSITION, isOwner: true };
  }

  const links = await prisma.memberRole.findMany({
    where: { memberId: target.id },
    select: { roleId: true },
  });

  return {
    userId: target.userId,
    position: highestPosition(
      links.map((link) => link.roleId),
      serverRoles
    ),
    isOwner: false,
  };
}

/** The role ids seeded for a new server, in creation order. */
export async function createDefaultRoles(serverId: string): Promise<ServerRole[]> {
  const created: ServerRole[] = [];

  const everyone = await prisma.role.create({
    data: {
      serverId,
      name: "@everyone",
      color: null,
      position: DEFAULT_ROLE_POSITIONS.everyone,
      permissions: EVERYONE_PERMISSIONS,
      isEveryone: true,
      hoist: false,
    },
    select: {
      id: true,
      serverId: true,
      name: true,
      color: true,
      position: true,
      permissions: true,
      isEveryone: true,
      hoist: true,
    },
  });
  created.push(everyone as unknown as ServerRole);

  const moderator = await prisma.role.create({
    data: {
      serverId,
      name: "Moderator",
      color: "#3ba55d",
      position: DEFAULT_ROLE_POSITIONS.moderator,
      permissions: MODERATOR_PERMISSIONS,
      isEveryone: false,
      hoist: true,
    },
    select: {
      id: true,
      serverId: true,
      name: true,
      color: true,
      position: true,
      permissions: true,
      isEveryone: true,
      hoist: true,
    },
  });
  created.push(moderator as unknown as ServerRole);

  const admin = await prisma.role.create({
    data: {
      serverId,
      name: "Admin",
      color: "#f23f43",
      position: DEFAULT_ROLE_POSITIONS.admin,
      permissions: ADMIN_PERMISSIONS,
      isEveryone: false,
      hoist: true,
    },
    select: {
      id: true,
      serverId: true,
      name: true,
      color: true,
      position: true,
      permissions: true,
      isEveryone: true,
      hoist: true,
    },
  });
  created.push(admin as unknown as ServerRole);

  return created;
}

/**
 * Maps the legacy single-role column onto the default roles.
 *
 * Servers created before roles existed stored "owner" | "admin" | "moderator"
 * | "member" on the member row. The backfill links those to the seeded roles
 * so nobody loses access to the server they already ran.
 */
export function legacyRoleNames(legacy: string | undefined | null): string[] {
  switch (legacy) {
    case "owner":
    case "admin":
      return ["Admin"];
    case "moderator":
      return ["Moderator"];
    default:
      return [];
  }
}
