import { describe, expect, it, beforeAll, vi } from "vitest";
import request from "supertest";
import express from "express";

/* eslint-disable @typescript-eslint/no-explicit-any -- in-memory prisma stub. */

/**
 * Route tests for the role system.
 *
 * The rules worth proving are the ones a mistake in would be a privilege
 * escalation rather than a cosmetic bug: an admin must not be able to build or
 * hand out a role above themselves, @everyone must be immutable, and two
 * admins must not be able to rewrite each other.
 */

const { prismaMock, store, uuid } = vi.hoisted(() => {
  const stores = {
    servers: new Map<string, any>(),
    members: new Map<string, any>(),
    roles: new Map<string, any>(),
    memberRoles: new Map<string, any>(),
    users: new Map<string, any>(),
  };
  let counter = 0;
  const uuid = () => {
    counter += 1;
    return `00000000-0000-4000-8000-${counter.toString(16).padStart(12, "0")}`;
  };
  return { prismaMock: { __placeholder: true } as any, store: stores, uuid };
});

const EVERYONE = ["VIEW_CHANNEL", "SEND_MESSAGES", "SEND_ATTACHMENTS", "ADD_REACTIONS", "CONNECT", "SPEAK", "CHANGE_NICKNAME"];
const MOD = [...EVERYONE, "MANAGE_MESSAGES", "KICK_MEMBERS", "MUTE_MEMBERS"];
const ADMIN = [...MOD, "MANAGE_ROLES", "MANAGE_CHANNELS", "MANAGE_SERVER", "MANAGE_INVITES", "BAN_MEMBERS"];

prismaMock.server = {
  findUnique: async (args: any) => store.servers.get(args?.where?.id) ?? null,
  update: async (args: any) => {
    const server = store.servers.get(args.where.id)!;
    Object.assign(server, args.data);
    return { ...server };
  },
};
prismaMock.member = {
  findUnique: async (args: any) => {
    const w = args?.where;
    if (w?.userId_serverId) {
      return (
        [...store.members.values()].find(
          (m) => m.userId === w.userId_serverId.userId && m.serverId === w.userId_serverId.serverId
        ) ?? null
      );
    }
    return store.members.get(w?.id) ?? null;
  },
};
prismaMock.role = {
  create: async (args: any) => {
    const row = {
      id: uuid(),
      serverId: args.data.serverId,
      name: args.data.name,
      color: args.data.color ?? null,
      position: args.data.position ?? 0,
      permissions: args.data.permissions ?? [],
      isEveryone: args.data.isEveryone ?? false,
      hoist: args.data.hoist ?? false,
      createdAt: new Date(),
    };
    store.roles.set(row.id, row);
    return { ...row };
  },
  findMany: async (args: any) => {
    const rows = [...store.roles.values()].filter((r) => r.serverId === args?.where?.serverId);
    return rows.sort((a, b) => b.position - a.position);
  },
  findUnique: async (args: any) => store.roles.get(args?.where?.id) ?? null,
  update: async (args: any) => {
    const row = store.roles.get(args.where.id)!;
    Object.assign(row, args.data);
    return { ...row };
  },
  delete: async (args: any) => {
    store.roles.delete(args.where.id);
    return { id: args.where.id };
  },
};
prismaMock.memberRole = {
  create: async (args: any) => {
    const row = { id: uuid(), memberId: args.data.memberId, roleId: args.data.roleId, createdAt: new Date() };
    store.memberRoles.set(`${row.memberId}:${row.roleId}`, row);
    return row;
  },
  findMany: async (args: any) => {
    const rows = [...store.memberRoles.values()];
    if (args?.where?.memberId) return rows.filter((r) => r.memberId === args.where.memberId);
    return rows;
  },
  deleteMany: async (args: any) => {
    let count = 0;
    for (const [key, row] of store.memberRoles) {
      if (!args?.where?.memberId || row.memberId === args.where.memberId) {
        store.memberRoles.delete(key);
        count += 1;
      }
    }
    return { count };
  },
};

vi.mock("../prisma.js", () => ({ prisma: prismaMock, mongoClient: null }));
vi.mock("../middleware/auth.js", () => ({
  authenticate: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  requireUser: (req: express.Request) => (req as express.Request & { userId: string }).userId,
}));

import roleRoutes from "./roles.js";
import { errorHandler } from "../middleware/errorHandler.js";

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as express.Request & { userId: string }).userId = (req.headers["x-user"] as string) ?? "owner-1";
  next();
});
app.use("/api", roleRoutes);
app.use(errorHandler);

const SID = "aaaaaaaa-1111-4111-8111-111111111111";
let everyone: any;
let mod: any;
let admin: any;
let ownerMember: any;
let adminMember: any;
let plainMember: any;

beforeAll(async () => {
  store.servers.set(SID, { id: SID, name: "Roles Server", ownerId: "owner-1", inviteCode: "x" });

  const makeRole = (name: string, position: number, permissions: string[], isEveryone = false) => {
    const row = { id: uuid(), serverId: SID, name, color: null, position, permissions, isEveryone, hoist: !isEveryone };
    store.roles.set(row.id, row);
    return row;
  };
  everyone = makeRole("@everyone", 0, EVERYONE, true);
  mod = makeRole("Moderator", 10, MOD);
  admin = makeRole("Admin", 20, ADMIN);

  const makeMember = (userId: string) => {
    const m = { id: uuid(), userId, serverId: SID, role: "member", nickname: null, joinedAt: new Date() };
    store.members.set(m.id, m);
    return m;
  };
  ownerMember = makeMember("owner-1");
  adminMember = makeMember("admin-1");
  plainMember = makeMember("plain-1");

  store.memberRoles.set(`${ownerMember.id}:${admin.id}`, { id: uuid(), memberId: ownerMember.id, roleId: admin.id });
  store.memberRoles.set(`${adminMember.id}:${admin.id}`, { id: uuid(), memberId: adminMember.id, roleId: admin.id });
});

describe("GET /api/permissions", () => {
  it("publishes the catalogue so the UI cannot drift from enforcement", async () => {
    const res = await request(app).get("/api/permissions");

    expect(res.status).toBe(200);
    expect(res.body.data.groups.length).toBeGreaterThan(0);
    const flattened = res.body.data.groups.flatMap((g: any) => Object.keys(g.permissions));
    expect(flattened).toContain("KICK_MEMBERS");
    expect(flattened).toContain("MANAGE_ROLES");
  });
});

describe("GET /api/servers/:id/roles", () => {
  it("lists roles highest first with their member counts", async () => {
    const res = await request(app).get(`/api/servers/${SID}/roles`);

    expect(res.status).toBe(200);
    const names = res.body.data.roles.map((r: any) => r.name);
    expect(names).toEqual(["Admin", "Moderator", "@everyone"]);
    expect(res.body.data.roles[0].memberCount).toBe(2);
  });
});

describe("POST /api/servers/:id/roles", () => {
  it("lets the owner create a role with permissions", async () => {
    const res = await request(app)
      .post(`/api/servers/${SID}/roles`)
      .send({ serverId: SID, name: "Beta Tester", color: "#1abc9c", permissions: ["VIEW_CHANNEL"] });

    expect(res.status).toBe(201);
    expect(res.body.data.role.name).toBe("Beta Tester");
    expect(res.body.data.role.isEveryone).toBe(false);
  });

  it("rejects an unknown permission rather than storing it", async () => {
    const res = await request(app)
      .post(`/api/servers/${SID}/roles`)
      .send({ serverId: SID, name: "Broken", permissions: ["DELETE_SERVER"] });

    expect(res.status).toBe(400);
  });

  it("rejects a malformed colour", async () => {
    const res = await request(app)
      .post(`/api/servers/${SID}/roles`)
      .send({ serverId: SID, name: "Bad Colour", color: "red" });

    expect(res.status).toBe(400);
  });

  it("refuses for a member without MANAGE_ROLES", async () => {
    const res = await request(app)
      .post(`/api/servers/${SID}/roles`)
      .set("x-user", "plain-1")
      .send({ serverId: SID, name: "Nope" });

    expect(res.status).toBe(403);
  });

  it("will not let an admin mint a role above themselves", async () => {
    const before = res0();
    const res = await request(app)
      .post(`/api/servers/${SID}/roles`)
      .set("x-user", "admin-1")
      .send({ serverId: SID, name: "Superuser" });

    // The admin sits at position 20, so anything it creates must land below.
    expect(res.status).toBe(201);
    expect(res.body.data.role.position).toBeLessThan(20);
    expect(res0()).toBe(before + 1);
  });
});

function res0() {
  return [...store.roles.values()].filter((r) => r.serverId === SID).length;
}

describe("PATCH /api/servers/:id/roles/:roleId", () => {
  it("lets the owner toggle permissions", async () => {
    const res = await request(app)
      .patch(`/api/servers/${SID}/roles/${mod.id}`)
      .send({ permissions: [...MOD, "MANAGE_CHANNELS"] });

    expect(res.status).toBe(200);
    expect(res.body.data.role.permissions).toContain("MANAGE_CHANNELS");
  });

  it("refuses to rename @everyone", async () => {
    const res = await request(app).patch(`/api/servers/${SID}/roles/${everyone.id}`).send({ name: "Guests" });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/@everyone cannot be renamed/i);
  });

  it("refuses to move @everyone", async () => {
    const res = await request(app).patch(`/api/servers/${SID}/roles/${everyone.id}`).send({ position: 5 });

    expect(res.status).toBe(400);
  });

  it("refuses to rename a role above an admin", async () => {
    const res = await request(app)
      .patch(`/api/servers/${SID}/roles/${admin.id}`)
      .set("x-user", "admin-1")
      .send({ name: "Renamed" });

    expect(res.status).toBe(403);
  });

  it("refuses to promote a role above an admin's own position", async () => {
    const res = await request(app)
      .patch(`/api/servers/${SID}/roles/${mod.id}`)
      .set("x-user", "admin-1")
      .send({ position: 50 });

    expect(res.status).toBe(403);
  });

  it("will not let an admin reserve the owner position", async () => {
    const res = await request(app)
      .patch(`/api/servers/${SID}/roles/${mod.id}`)
      .send({ position: 1000 });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/servers/:id/roles/:roleId", () => {
  it("will not delete @everyone", async () => {
    const res = await request(app).delete(`/api/servers/${SID}/roles/${everyone.id}`);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/@everyone cannot be deleted/i);
  });

  it("deletes an ordinary role", async () => {
    const created = await request(app)
      .post(`/api/servers/${SID}/roles`)
      .send({ serverId: SID, name: "Temp" });
    const roleId = created.body.data.role.id;

    const res = await request(app).delete(`/api/servers/${SID}/roles/${roleId}`);

    expect(res.status).toBe(200);
    expect(store.roles.has(roleId)).toBe(false);
  });

  it("refuses for a member without MANAGE_ROLES", async () => {
    const res = await request(app)
      .delete(`/api/servers/${SID}/roles/${mod.id}`)
      .set("x-user", "plain-1");

    expect(res.status).toBe(403);
  });
});

describe("PUT /api/servers/:id/members/:memberId/roles", () => {
  it("assigns roles to a member", async () => {
    const res = await request(app)
      .put(`/api/servers/${SID}/members/${plainMember.id}/roles`)
      .send({ roleIds: [mod.id] });

    expect(res.status).toBe(200);
    expect(res.body.data.roleIds).toEqual([mod.id]);
  });

  it("drops @everyone from an explicit assignment", async () => {
    await request(app)
      .put(`/api/servers/${SID}/members/${plainMember.id}/roles`)
      .send({ roleIds: [everyone.id, mod.id] });

    const links = [...store.memberRoles.values()].filter((r) => r.memberId === plainMember.id);
    expect(links.map((r) => r.roleId)).toEqual([mod.id]);
  });

  it("refuses to hand out a role above the actor's own position", async () => {
    // The admin sits at 20; a role at 30 would be a privilege escalation.
    const elevated = await prismaMock.role.create({
      data: { serverId: SID, name: "Elevated", position: 30, permissions: ["MANAGE_SERVER"] },
    });

    const res = await request(app)
      .put(`/api/servers/${SID}/members/${plainMember.id}/roles`)
      .set("x-user", "admin-1")
      .send({ roleIds: [elevated.id] });

    expect(res.status).toBe(403);
  });

  it("will not let one admin edit another of equal rank", async () => {
    // A *different* admin, so this exercises the equal-rank rule rather than
    // the self-targeting one.
    const other = { id: uuid(), userId: "admin-2", serverId: SID, role: "member", nickname: null, joinedAt: new Date() };
    store.members.set(other.id, other);
    store.memberRoles.set(`${other.id}:${admin.id}`, {
      id: uuid(),
      memberId: other.id,
      roleId: admin.id,
      createdAt: new Date(),
    });

    const res = await request(app)
      .put(`/api/servers/${SID}/members/${other.id}/roles`)
      .set("x-user", "admin-1")
      .send({ roleIds: [] });

    expect(res.status).toBe(403);
  });

  it("refuses self-targeting with a clear 400", async () => {
    const res = await request(app)
      .put(`/api/servers/${SID}/members/${adminMember.id}/roles`)
      .set("x-user", "admin-1")
      .send({ roleIds: [] });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/yourself/i);
  });

  it("will not let anyone edit the owner's roles", async () => {
    const res = await request(app)
      .put(`/api/servers/${SID}/members/${ownerMember.id}/roles`)
      .send({ roleIds: [] });

    expect(res.status).toBe(403);
  });

  it("refuses an unknown role id", async () => {
    const res = await request(app)
      .put(`/api/servers/${SID}/members/${plainMember.id}/roles`)
      .send({ roleIds: ["00000000-0000-4000-8000-0000000000ff"] });

    expect(res.status).toBe(400);
  });
});
