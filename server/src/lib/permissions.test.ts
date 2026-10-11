import { describe, expect, it } from "vitest";
import {
  ADMIN_PERMISSIONS,
  ALL_PERMISSIONS,
  DEFAULT_ROLE_POSITIONS,
  EVERYONE_PERMISSIONS,
  MODERATOR_PERMISSIONS,
  OWNER_POSITION,
  PERMISSION_GROUPS,
  actorCan,
  actorPosition,
  assertOutranks,
  highestPosition,
  isPermission,
  legacyRoleNames,
  permissionSet,
  resolvePermissions,
} from "./permissions.js";
import { AppError } from "./http.js";
import type { Actor, Permission, ServerRole } from "./permissions.js";

/**
 * The role model is only worth anything if the hierarchy is airtight, so it is
 * tested as pure logic rather than through the database.
 *
 * The previous version had four hardcoded roles and a `roleHas(role, permission)`
 * lookup. It could not express "this server's Moderator may also manage
 * channels", and nothing compared the actor with the target, which is how two
 * admins came to be able to remove each other.
 */

const role = (over: Partial<ServerRole> & { id: string }): ServerRole => ({
  serverId: "s1",
  name: over.id,
  color: null,
  position: 0,
  permissions: [],
  isEveryone: false,
  hoist: false,
  ...over,
});

const EVERYONE = role({ id: "r-everyone", name: "@everyone", position: 0, isEveryone: true });
const MOD = role({ id: "r-mod", name: "Moderator", position: 10, permissions: MODERATOR_PERMISSIONS });
const ADMIN = role({ id: "r-admin", name: "Admin", position: 20, permissions: ADMIN_PERMISSIONS });

const ROLES: ServerRole[] = [EVERYONE, MOD, ADMIN];

const actor = (over: Partial<Actor> = {}): Actor => ({
  serverId: "s1",
  userId: "actor-1",
  isOwner: false,
  position: 0,
  permissions: new Set<Permission>(),
  roleIds: [],
  ...over,
});

describe("permission catalogue", () => {
  it("exposes every permission exactly once across the groups", () => {
    const flattened = PERMISSION_GROUPS.flatMap((group) => Object.keys(group.permissions));
    expect(new Set(flattened).size).toBe(flattened.length);
    expect([...flattened].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  it("gives every permission a label and a description for the settings UI", () => {
    for (const group of PERMISSION_GROUPS) {
      for (const meta of Object.values(group.permissions)) {
        expect(meta.label.length).toBeGreaterThan(0);
        expect(meta.description.length).toBeGreaterThan(0);
      }
    }
  });

  it("recognises only declared permissions", () => {
    expect(isPermission("KICK_MEMBERS")).toBe(true);
    expect(isPermission("DELETE_SERVER")).toBe(false);
    expect(isPermission(42)).toBe(false);
    expect(isPermission(undefined)).toBe(false);
  });
});

describe("the seeded roles", () => {
  it("gives @everyone no management power", () => {
    // Joining a server must never hand you the ability to change it.
    for (const permission of ALL_PERMISSIONS) {
      const isManagement =
        permission.startsWith("MANAGE_") ||
        permission === "KICK_MEMBERS" ||
        permission === "BAN_MEMBERS" ||
        permission === "MENTION_EVERYONE";
      if (isManagement) expect(EVERYONE_PERMISSIONS).not.toContain(permission);
    }
  });

  it("keeps every role's permissions a superset of the one below it", () => {
    for (const permission of EVERYONE_PERMISSIONS) {
      expect(MODERATOR_PERMISSIONS).toContain(permission);
      expect(ADMIN_PERMISSIONS).toContain(permission);
    }
    for (const permission of MODERATOR_PERMISSIONS) {
      expect(ADMIN_PERMISSIONS).toContain(permission);
    }
  });

  it("orders the default roles by position, below the owner", () => {
    expect(DEFAULT_ROLE_POSITIONS.everyone).toBeLessThan(DEFAULT_ROLE_POSITIONS.moderator);
    expect(DEFAULT_ROLE_POSITIONS.moderator).toBeLessThan(DEFAULT_ROLE_POSITIONS.admin);
    expect(DEFAULT_ROLE_POSITIONS.admin).toBeLessThan(OWNER_POSITION);
  });

  it("lets a moderator manage messages and kick, but not roles or the server", () => {
    expect(MODERATOR_PERMISSIONS).toContain("MANAGE_MESSAGES");
    expect(MODERATOR_PERMISSIONS).toContain("KICK_MEMBERS");
    expect(MODERATOR_PERMISSIONS).not.toContain("MANAGE_ROLES");
    expect(MODERATOR_PERMISSIONS).not.toContain("MANAGE_SERVER");
  });
});

describe("permissionSet", () => {
  it("drops unknown keys rather than throwing", () => {
    // A permission renamed in a later deploy must not lock everyone out until
    // every role has been reassigned by hand.
    const set = permissionSet(["KICK_MEMBERS", "LEGACY_PERMISSION", "BAN_MEMBERS"]);
    expect([...set].sort()).toEqual(["BAN_MEMBERS", "KICK_MEMBERS"]);
  });

  it("treats a missing list as no permissions", () => {
    expect(permissionSet(undefined).size).toBe(0);
    expect(permissionSet(null).size).toBe(0);
  });
});

describe("resolvePermissions", () => {
  it("grants the baseline to a member with no roles at all", () => {
    const granted = resolvePermissions(ROLES, [], false);
    expect(granted.has("VIEW_CHANNEL")).toBe(true);
    expect(granted.has("SEND_MESSAGES")).toBe(true);
    expect(granted.has("KICK_MEMBERS")).toBe(false);
  });

  it("unions every role a member holds", () => {
    const granted = resolvePermissions(ROLES, [MOD.id, ADMIN.id], false);
    expect(granted.has("KICK_MEMBERS")).toBe(true);
    expect(granted.has("MANAGE_ROLES")).toBe(true);
  });

  it("grants the owner everything, regardless of roles", () => {
    const granted = resolvePermissions(ROLES, [], true);
    expect(granted.size).toBe(ALL_PERMISSIONS.length);
    for (const permission of ALL_PERMISSIONS) expect(granted.has(permission)).toBe(true);
  });

  it("ignores role ids that no longer exist", () => {
    // A deleted role must not throw; the member simply loses what it granted.
    const granted = resolvePermissions(ROLES, ["role-that-was-deleted"], false);
    expect(granted.has("KICK_MEMBERS")).toBe(false);
    expect(granted.has("VIEW_CHANNEL")).toBe(true);
  });
});

describe("highestPosition", () => {
  it("is the top of the roles held, not the sum", () => {
    expect(highestPosition([MOD.id], ROLES)).toBe(10);
    expect(highestPosition([MOD.id, ADMIN.id], ROLES)).toBe(20);
  });

  it("is zero for a member with no roles", () => {
    expect(highestPosition([], ROLES)).toBe(0);
  });
});

describe("actorPosition and actorCan", () => {
  it("puts the owner above every role", () => {
    const owner = actor({ isOwner: true, position: 0 });
    expect(actorPosition(owner)).toBe(OWNER_POSITION);
    expect(actorPosition(actor({ position: 20 }))).toBe(20);
  });

  it("lets the owner do anything, and an empty role set do nothing", () => {
    expect(actorCan(actor({ isOwner: true }), "MANAGE_SERVER")).toBe(true);
    expect(actorCan(actor({}), "VIEW_CHANNEL")).toBe(false);
  });

  it("honours a resolved permission set", () => {
    const mod = actor({ position: 10, permissions: new Set(MODERATOR_PERMISSIONS) });
    expect(actorCan(mod, "KICK_MEMBERS")).toBe(true);
    expect(actorCan(mod, "MANAGE_SERVER")).toBe(false);
  });
});

describe("assertOutranks", () => {
  const target = (over = {}) => ({ userId: "target-1", position: 0, isOwner: false, ...over });

  it("refuses to act on the owner, whoever is asking", () => {
    expect(() => assertOutranks(actor({ isOwner: true, position: OWNER_POSITION }), target({ isOwner: true })))
      .toThrow(/owner cannot be modified/i);
  });

  it("refuses to act on your own level or above", () => {
    // The rule that stops two admins removing each other.
    expect(() => assertOutranks(actor({ position: 20 }), target({ position: 20 }))).toThrow(/at or above/i);
    expect(() => assertOutranks(actor({ position: 10 }), target({ position: 20 }))).toThrow(/at or above/i);
  });

  it("allows acting on a strictly lower role", () => {
    expect(() => assertOutranks(actor({ position: 20 }), target({ position: 10 }))).not.toThrow();
    expect(() => assertOutranks(actor({ isOwner: true }), target({ position: 20 }))).not.toThrow();
  });

  it("refuses self-targeting with a clear message", () => {
    expect(() => assertOutranks(actor({ userId: "me" }), target({ userId: "me" })))
      .toThrow(/yourself/i);
  });

  it("raises an AppError so it maps onto 403", () => {
    expect(() => assertOutranks(actor({ position: 1 }), target({ position: 5 }))).toThrow(AppError);
  });
});

describe("legacyRoleNames", () => {
  it("maps the old single-role column onto the seeded roles", () => {
    // Servers created before the roles table must not lose their admins.
    expect(legacyRoleNames("owner")).toEqual(["Admin"]);
    expect(legacyRoleNames("admin")).toEqual(["Admin"]);
    expect(legacyRoleNames("moderator")).toEqual(["Moderator"]);
    expect(legacyRoleNames("member")).toEqual([]);
    expect(legacyRoleNames(undefined)).toEqual([]);
    expect(legacyRoleNames("nonsense")).toEqual([]);
  });
});
