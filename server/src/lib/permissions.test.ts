import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_RANK, assertOutranks, isRole, roleHas } from "./permissions.js";
import { AppError } from "./http.js";
import type { Role, ServerActor } from "./permissions.js";

/**
 * The role hierarchy is the one place that decides who may act on whom, so it
 * needs to hold on its own. Before it, each route passed its own ad-hoc role
 * list, which meant an admin could not be prevented from demoting another
 * admin — nothing compared the two actors.
 */

const actor = (role: Role, userId = "actor"): ServerActor => ({
  serverId: "s1",
  userId,
  role,
  isOwner: role === "owner",
});

describe("role ranks", () => {
  it("orders owner above admin above moderator above member", () => {
    expect(ROLE_RANK.owner).toBeGreaterThan(ROLE_RANK.admin);
    expect(ROLE_RANK.admin).toBeGreaterThan(ROLE_RANK.moderator);
    expect(ROLE_RANK.moderator).toBeGreaterThan(ROLE_RANK.member);
  });

  it("recognises the declared roles and nothing else", () => {
    expect(isRole("owner")).toBe(true);
    expect(isRole("member")).toBe(true);
    expect(isRole("superuser")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });

  it("treats an unknown stored role as no permissions at all", () => {
    expect(roleHas("wizard", "manageChannels")).toBe(false);
  });
});

describe("roleHas", () => {
  it("matches the permission table", () => {
    expect(roleHas("owner", "manageServer")).toBe(true);
    expect(roleHas("admin", "manageServer")).toBe(false);

    expect(roleHas("moderator", "manageChannels")).toBe(true);
    expect(roleHas("moderator", "manageCategories")).toBe(false);

    expect(roleHas("member", "manageChannels")).toBe(false);
    expect(roleHas("member", "kickMembers")).toBe(false);
  });

  it("grants every permission to the owner", () => {
    for (const permission of Object.keys(PERMISSIONS) as Array<keyof typeof PERMISSIONS>) {
      expect(roleHas("owner", permission)).toBe(true);
    }
  });
});

describe("assertOutranks", () => {
  it("refuses to act on the owner, whoever is asking", () => {
    // Even another owner-level actor cannot touch the owner. The single owner
    // row is only changed through /transfer.
    expect(() => assertOutranks(actor("owner", "a"), "admin", true)).toThrow(/owner cannot be modified/i);
  });

  it("refuses to act on your own level or above", () => {
    // Discord's rule: strictly below. This is what stops two admins from
    // demoting or removing each other.
    expect(() => assertOutranks(actor("admin", "a"), "admin", false)).toThrow(/cannot act on/i);
    expect(() => assertOutranks(actor("moderator", "a"), "admin", false)).toThrow(/cannot act on/i);
    expect(() => assertOutranks(actor("admin", "a"), "owner", false)).toThrow(/cannot act on/i);
  });

  it("allows acting on a strictly lower role", () => {
    expect(() => assertOutranks(actor("owner", "a"), "admin", false)).not.toThrow();
    expect(() => assertOutranks(actor("admin", "a"), "moderator", false)).not.toThrow();
    expect(() => assertOutranks(actor("moderator", "a"), "member", false)).not.toThrow();
  });

  it("refuses everything from a plain member", () => {
    // A member never reaches this helper in practice (the permission check
    // fails first) but the guard is cheap and makes the rule total.
    expect(() => assertOutranks(actor("member", "a"), "member", false)).toThrow(AppError);
  });

  it("treats an unknown stored role as the lowest rank", () => {
    // A corrupt `role` value must not accidentally outrank anyone, so it
    // collapses to `member` — which a moderator may still act on.
    expect(() => assertOutranks(actor("moderator", "a"), "wizard", false)).not.toThrow();
    expect(() => assertOutranks(actor("member", "a"), "wizard", false)).toThrow(AppError);
  });
});
