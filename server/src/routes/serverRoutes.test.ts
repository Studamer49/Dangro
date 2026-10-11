import { describe, expect, it, beforeAll, vi } from "vitest";
import request from "supertest";
import express from "express";

/* eslint-disable @typescript-eslint/no-explicit-any -- test stub; the Prisma
   surface is too wide to type here and the routes are what is under test. */

/**
 * Route-level smoke test: the new invite, category and settings endpoints must
 * mount, validate, and enforce the permission helper.
 *
 * `prisma` is replaced with an in-memory stub so the whole request path runs
 * without a live database.
 */

// vi.mock factories are hoisted above module-level declarations, so the stub
// has to be created through vi.hoisted to exist by the time the factory runs.
const { prismaMock, store, uuid } = vi.hoisted(() => {
  const stores = {
    servers: new Map<string, any>(),
    serversByCode: new Map<string, any>(),
    members: new Map<string, any>(),
    invites: new Map<string, any>(),
    categories: new Map<string, any>(),
    channels: new Map<string, any>(),
    users: new Map<string, any>([["owner-1", { id: "owner-1", username: "owner" }]]),
  };

  /**
   * Real UUIDs, because the routes validate path params with `paramId` before
   * they reach the database — a stub id like "cat-1" would be rejected as
   * "Invalid id" and mask whatever the test was actually checking.
   */
  let counter = 0;
  const uuid = () => {
    counter += 1;
    return `00000000-0000-4000-8000-${counter.toString(16).padStart(12, "0")}`;
  };

  return { prismaMock: { __placeholder: true } as any, store: stores, uuid };
});

prismaMock.server = {
  create: async (args: any) => {
    const data = args?.data ?? {};
    const server = {
      id: data.id ?? uuid(),
      name: data.name,
      icon: data.icon ?? null,
      description: data.description ?? null,
      ownerId: data.ownerId,
      inviteCode: data.inviteCode ?? "code123",
      createdAt: new Date(),
      updatedAt: new Date(),
      channels: [],
      categories: [],
      members: [],
      _count: { members: 0 },
    };
    store.servers.set(server.id, server);
    store.serversByCode.set(server.inviteCode, server);
    return server;
  },
  findUnique: async (args: any) => {
    if (args?.where?.inviteCode) return store.serversByCode.get(args.where.inviteCode) ?? null;
    return store.servers.get(args?.where?.id) ?? null;
  },
  findMany: async () => [],
  findFirst: async () => null,
  update: async (args: any) => {
    const server = store.servers.get(args.where.id)!;
    Object.assign(server, args.data);
    return { ...server };
  },
  delete: async (args: any) => {
    store.servers.delete(args.where.id);
    return { id: args.where.id };
  },
  deleteMany: async () => ({ count: 0 }),
  count: async () => 0,
};

prismaMock.member = {
  create: async (args: any) => {
    const member = {
      id: uuid(),
      userId: args.data.userId,
      serverId: args.data.serverId,
      role: args.data.role ?? "member",
      nickname: null,
      joinedAt: new Date(),
    };
    store.members.set(member.id, member);
    return member;
  },
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
  findFirst: async () => null,
  findMany: async (args: any) =>
    [...store.members.values()].filter((m) => !args?.where?.serverId || m.serverId === args.where.serverId),
  update: async (args: any) => {
    const member = store.members.get(args.where.id)!;
    Object.assign(member, args.data);
    return { ...member, user: store.users.get(member.userId) ?? null };
  },
  delete: async (args: any) => {
    store.members.delete(args.where.id);
    return { id: args.where.id };
  },
  deleteMany: async () => ({ count: 0 }),
  updateMany: async () => ({ count: 0 }),
};

prismaMock.invite = {
  create: async (args: any) => {
    const invite = {
      id: uuid(),
      code: args.data.code,
      serverId: args.data.serverId,
      channelId: args.data.channelId ?? null,
      inviterId: args.data.inviterId,
      maxUses: args.data.maxUses ?? null,
      uses: 0,
      expiresAt: args.data.expiresAt ?? null,
      createdAt: new Date(),
      channel: null,
      inviter: store.users.get(args.data.inviterId) ?? null,
    };
    store.invites.set(invite.code, invite);
    return invite;
  },
  findUnique: async (args: any) => {
    const invite = store.invites.get(args?.where?.code);
    if (!invite) return null;
    // The preview endpoint includes `server`/`channel`/`inviter`; the stub
    // resolves them the way the Mongo engine's relation loader would.
    return {
      ...invite,
      server: store.servers.get(invite.serverId) ?? null,
      channel: null,
      inviter: store.users.get(invite.inviterId) ?? null,
    };
  },
  findMany: async (args: any) =>
    [...store.invites.values()].filter((i) => !args?.where?.serverId || i.serverId === args.where.serverId),
  update: async (args: any) => {
    const invite = [...store.invites.values()].find((i) => i.id === args.where.id)!;
    Object.assign(invite, args.data);
    return invite;
  },
  deleteMany: async (args: any) => {
    const code = args.where.code;
    const invite = store.invites.get(code);
    if (invite && (!args.where.serverId || invite.serverId === args.where.serverId)) {
      store.invites.delete(code);
      return { count: 1 };
    }
    return { count: 0 };
  },
};

prismaMock.category = {
  create: async (args: any) => {
    const category = {
      id: uuid(),
      name: args.data.name,
      serverId: args.data.serverId,
      position: args.data.position ?? 0,
      createdAt: new Date(),
    };
    store.categories.set(category.id, category);
    return category;
  },
  findUnique: async (args: any) => store.categories.get(args?.where?.id) ?? null,
  findFirst: async () => null,
  findMany: async (args: any) =>
    [...store.categories.values()].filter((c) => !args?.where?.serverId || c.serverId === args.where.serverId),
  update: async (args: any) => {
    const category = store.categories.get(args.where.id)!;
    Object.assign(category, args.data);
    return category;
  },
  delete: async (args: any) => {
    store.categories.delete(args.where.id);
    return { id: args.where.id };
  },
};

prismaMock.channel = {
  create: async (args: any) => ({
    id: uuid(),
    name: args.data.name,
    type: args.data.type ?? "text",
    topic: null,
    serverId: args.data.serverId,
    categoryId: args.data.categoryId ?? null,
    position: args.data.position ?? 0,
    createdAt: new Date(),
  }),
  findUnique: async (args: any) => store.channels.get(args?.where?.id) ?? null,
  findFirst: async () => null,
  findMany: async () => [],
  update: async (args: any) => {
    const channel = store.channels.get(args.where.id)!;
    Object.assign(channel, args.data);
    return channel;
  },
  delete: async (args: any) => {
    store.channels.delete(args.where.id);
    return { id: args.where.id };
  },
  count: async () => 1,
  updateMany: async () => ({ count: 0 }),
};

prismaMock.user = { findUnique: async () => null, update: async () => ({}) };
prismaMock.$transaction = async (ops: any[]) => Promise.all(ops);

vi.mock("../prisma.js", () => ({ prisma: prismaMock, mongoClient: null }));

/** Mirrors middleware/auth.ts's contract with the rest of the app. */
vi.mock("../middleware/auth.js", () => ({
  authenticate: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  requireUser: (req: express.Request) => (req as express.Request & { userId: string }).userId,
}));

// Imported statically: the package is CommonJS, so top-level await — which
// vi.mock's hoisting would otherwise require — is not an option. vi.mock is
// hoisted above this, so the mocks still apply.
import { errorHandler } from "../middleware/errorHandler.js";
import inviteRoutes from "./invites.js";
import categoryRoutes from "./categories.js";
import serverSettingsRoutes from "./serverSettings.js";
import channelRoutes from "./channels.js";

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const userId = (req.headers["x-user"] as string) ?? "owner-1";
  (req as express.Request & { userId: string }).userId = userId;
  next();
});
app.use("/api", inviteRoutes);
app.use("/api", categoryRoutes);
app.use("/api", serverSettingsRoutes);
app.use("/api/channels", channelRoutes);
app.use(errorHandler);

const UUID = "aaaaaaaa-1111-4111-8111-111111111111";

async function seedOwnerServer() {
  const server = await prismaMock.server.create({
    data: { id: UUID, name: "Owner Server", ownerId: "owner-1", inviteCode: "perm123" },
  });
  await prismaMock.member.create({ data: { userId: "owner-1", serverId: UUID, role: "owner" } });
  return server;
}

beforeAll(async () => {
  await seedOwnerServer();
});

describe("POST /api/servers/:id/invites", () => {
  it("creates an invite with the requested lifetime", async () => {
    const res = await request(app).post(`/api/servers/${UUID}/invites`).send({ maxAge: "1h" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.invite.expiresAt).toBeTruthy();
    expect(res.body.data.invite.uses).toBe(0);
  });

  it("creates a never-expiring invite with no expiry", async () => {
    const res = await request(app).post(`/api/servers/${UUID}/invites`).send({ maxAge: "never" });

    expect(res.status).toBe(201);
    expect(res.body.data.invite.expiresAt).toBeNull();
  });

  it("refuses a channel from another server", async () => {
    const res = await request(app)
      .post(`/api/servers/${UUID}/invites`)
      .send({ channelId: "bbbbbbbb-2222-4222-8222-222222222222" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });

  it("is forbidden for a non-member", async () => {
    const res = await request(app)
      .post(`/api/servers/${UUID}/invites`)
      .set("x-user", "stranger")
      .send({});

    expect(res.status).toBe(403);
  });
});

describe("GET /api/invites/:code", () => {
  it("previews a live invite without joining", async () => {
    const created = await request(app).post(`/api/servers/${UUID}/invites`).send({ maxAge: "24h" });
    const code = created.body.data.invite.code;

    const res = await request(app).get(`/api/invites/${code}`);

    expect(res.status).toBe(200);
    expect(res.body.data.invite.server.name).toBe("Owner Server");
  });

  it("reports an expired invite exactly like a missing one", async () => {
    const created = await request(app).post(`/api/servers/${UUID}/invites`).send({ maxAge: "1h" });
    const code = created.body.data.invite.code;
    // Age it out behind the route's back.
    store.invites.get(code)!.expiresAt = new Date(Date.now() - 1000);

    const res = await request(app).get(`/api/invites/${code}`);

    expect(res.status).toBe(404);
    expect(res.body.error.message).toMatch(/not found or expired/i);
  });

  it("reports a used-up invite as gone", async () => {
    const created = await request(app)
      .post(`/api/servers/${UUID}/invites`)
      .send({ maxAge: "never", maxUses: 1 });
    const code = created.body.data.invite.code;
    store.invites.get(code)!.uses = 1;

    const res = await request(app).get(`/api/invites/${code}`);

    expect(res.status).toBe(404);
  });

  it("rejects a malformed code", async () => {
    const res = await request(app).get("/api/invites/!!");
    expect(res.status).toBe(400);
  });
});

describe("POST /api/invites/:code", () => {
  it("joins the server and counts the use", async () => {
    const created = await request(app).post(`/api/servers/${UUID}/invites`).send({ maxAge: "never" });
    const code = created.body.data.invite.code;

    const res = await request(app).post(`/api/invites/${code}`).set("x-user", "newcomer");

    expect(res.status).toBe(200);
    expect(res.body.data.joined).toBe(true);
    expect(store.invites.get(code)!.uses).toBe(1);
  });

  it("is a no-op for someone already in the server", async () => {
    const created = await request(app).post(`/api/servers/${UUID}/invites`).send({ maxAge: "never" });
    const code = created.body.data.invite.code;

    const res = await request(app).post(`/api/invites/${code}`);

    expect(res.status).toBe(200);
    expect(res.body.data.joined).toBe(false);
    // A re-redeem must not burn a use from the cap.
    expect(store.invites.get(code)!.uses).toBe(0);
  });

  it("refuses once the cap is spent", async () => {
    const created = await request(app)
      .post(`/api/servers/${UUID}/invites`)
      .send({ maxAge: "never", maxUses: 1 });
    const code = created.body.data.invite.code;

    await request(app).post(`/api/invites/${code}`).set("x-user", "first-joiner");
    const second = await request(app).post(`/api/invites/${code}`).set("x-user", "second-joiner");

    expect(second.status).toBe(404);
  });
});

describe("DELETE /api/servers/:id/invites/:code", () => {
  it("revokes an invite belonging to that server", async () => {
    const created = await request(app).post(`/api/servers/${UUID}/invites`).send({ maxAge: "never" });
    const code = created.body.data.invite.code;

    const res = await request(app).delete(`/api/servers/${UUID}/invites/${code}`);

    expect(res.status).toBe(200);
    expect(store.invites.has(code)).toBe(false);
  });

  it("will not revoke an invite from another server", async () => {
    const created = await request(app).post(`/api/servers/${UUID}/invites`).send({ maxAge: "never" });
    const code = created.body.data.invite.code;

    const res = await request(app).delete(
      `/api/servers/bbbbbbbb-2222-4222-8222-222222222222/invites/${code}`
    );

    // The server does not exist, so this is a 404 rather than a cross-server
    // revoke.
    expect(res.status).toBe(404);
    expect(store.invites.has(code)).toBe(true);
  });
});

describe("categories", () => {
  it("creates, renames and deletes", async () => {
    const created = await request(app).post(`/api/servers/${UUID}/categories`).send({ name: "Media" });
    expect(created.status).toBe(201);
    const id = created.body.data.category.id;

    const renamed = await request(app).patch(`/api/categories/${id}`).send({ name: "Pictures" });
    expect(renamed.body.data.category.name).toBe("Pictures");

    const removed = await request(app).delete(`/api/categories/${id}`);
    expect(removed.status).toBe(200);
  });

  it("is forbidden for a non-manager", async () => {
    const res = await request(app)
      .post(`/api/servers/${UUID}/categories`)
      .set("x-user", "stranger")
      .send({ name: "Nope" });

    expect(res.status).toBe(403);
  });
});

describe("channels", () => {
  it("creates a channel at the bottom of its category", async () => {
    const category = await request(app).post(`/api/servers/${UUID}/categories`).send({ name: "Text" });

    const res = await request(app).post("/api/channels").send({
      name: "random",
      type: "text",
      serverId: UUID,
      categoryId: category.body.data.category.id,
    });

    expect(res.status).toBe(201);
  });

  it("rejects a channel name with illegal characters", async () => {
    const res = await request(app)
      .post("/api/channels")
      .send({ name: "bad#name", type: "text", serverId: UUID });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("refuses a category from another server", async () => {
    const res = await request(app).post("/api/channels").send({
      name: "fine",
      type: "text",
      serverId: UUID,
      categoryId: "cccccccc-3333-4333-8333-333333333333",
    });

    expect(res.status).toBe(400);
  });

  it("will not delete the last remaining text channel", async () => {
    // A server with no text channel cannot be opened: the sidebar has nothing
    // to navigate to, so the last one is protected.
    const id = uuid();
    store.channels.set(id, {
      id,
      name: "general",
      type: "text",
      serverId: UUID,
      categoryId: null,
      position: 0,
    });

    // Only this channel matches, so removing it would leave none.
    prismaMock.channel.count = (async (args: any) =>
      args?.where?.id?.not ? 0 : 1) as never;

    const res = await request(app).delete(`/api/channels/${id}`);

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/at least one text channel/i);
  });
});

describe("server settings", () => {
  it("lets the owner save the name and description", async () => {
    const res = await request(app)
      .patch(`/api/servers/${UUID}`)
      .send({ name: "Renamed", description: "Now with a description" });

    expect(res.status).toBe(200);
    expect(res.body.data.server.name).toBe("Renamed");
  });

  it("refuses a javascript: icon", async () => {
    const res = await request(app).patch(`/api/servers/${UUID}`).send({ icon: "javascript:alert(1)" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("refuses to assign the owner role directly", async () => {
    const member = await prismaMock.member.create({ data: { userId: "somebody", serverId: UUID } });

    const res = await request(app)
      .patch(`/api/servers/${UUID}/members/${member.id}`)
      .send({ role: "owner" });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/transfer ownership/i);
  });

  it("will not let the owner kick themselves through the member route", async () => {
    const ownerMember = [...store.members.values()].find((m) => m.userId === "owner-1")!;

    const res = await request(app).delete(`/api/servers/${UUID}/members/${ownerMember.id}`);

    expect(res.status).toBe(403);
  });

  it("rejects an unknown role", async () => {
    const member = await prismaMock.member.create({ data: { userId: "somebody2", serverId: UUID } });

    const res = await request(app)
      .patch(`/api/servers/${UUID}/members/${member.id}`)
      .send({ role: "overlord" });

    expect(res.status).toBe(400);
  });
});
