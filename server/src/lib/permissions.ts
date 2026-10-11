import { prisma } from "../prisma.js";
import { AppError } from "./http.js";

/**
 * Server roles and what each one may do.
 *
 * Discord's hierarchy: a member can only act on someone strictly below them,
 * and nobody can touch the owner. The old checks were ad-hoc
 * `assertServerMember(id, userId, ["owner", "admin"])` string lists scattered
 * across routes, which meant "who may kick whom" was decided differently
 * everywhere — and nothing stopped an admin from demoting or removing another
 * admin.
 *
 *   owner      everything, cannot be removed or demoted
 *   admin      manage channels, categories, invites, members
 *   moderator  manage channels and kick members
 *   member     read, write, leave
 */
export const ROLES = ["owner", "admin", "moderator", "member"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_RANK: Record<Role, number> = {
  owner: 4,
  admin: 3,
  moderator: 2,
  member: 1,
};

/** Actions guarded by the hierarchy, keyed by the lowest role that may do them. */
export const PERMISSIONS = {
  manageServer: ["owner"],
  manageRoles: ["owner", "admin"],
  manageInvites: ["owner", "admin"],
  manageChannels: ["owner", "admin", "moderator"],
  manageCategories: ["owner", "admin"],
  kickMembers: ["owner", "admin", "moderator"],
  /** Only moderators and above may remove messages. */
  deleteAnyMessage: ["owner", "admin", "moderator"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function roleHas(role: string, permission: Permission): boolean {
  if (!isRole(role)) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export interface ServerActor {
  serverId: string;
  userId: string;
  role: Role;
  isOwner: boolean;
}

/**
 * Loads the caller's membership and fails unless they hold `permission`.
 *
 * Throws NOT_FOUND rather than FORBIDDEN when the caller is not a member at
 * all, so a non-member cannot probe which servers exist.
 */
export async function requireServerPermission(
  serverId: string,
  userId: string,
  permission: Permission
): Promise<ServerActor> {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { ownerId: true },
  });
  if (!server) throw AppError.of("NOT_FOUND", "Server not found");

  const member = await prisma.member.findUnique({
    where: { userId_serverId: { userId, serverId } },
    select: { role: true },
  });
  if (!member) throw AppError.of("FORBIDDEN", "You are not a member of this server");

  const isOwner = server.ownerId === userId;
  // The owner is not stored as a role row in every legacy server, so they are
  // always promoted here rather than trusted to have been written correctly.
  const role: Role = isOwner ? "owner" : isRole(member.role) ? member.role : "member";

  if (!roleHas(role, permission)) {
    throw AppError.of("FORBIDDEN", "You do not have permission to do that");
  }

  return { serverId, userId, role, isOwner };
}

/**
 * Fails when `actor` may not act on `targetRole`.
 *
 * Discord's rule is strict ordering: you cannot act on your own level or
 * above, and the owner is untouchable by anyone.
 */
export function assertOutranks(actor: ServerActor, targetRole: string, targetIsOwner: boolean): void {
  if (targetIsOwner) throw AppError.of("FORBIDDEN", "The server owner cannot be modified");
  if (actor.userId && actor.role === "member") {
    throw AppError.of("FORBIDDEN", "You do not have permission to do that");
  }
  const target: Role = isRole(targetRole) ? targetRole : "member";
  if (ROLE_RANK[actor.role] <= ROLE_RANK[target]) {
    throw AppError.of("FORBIDDEN", `You cannot act on someone with the ${target} role`);
  }
}
