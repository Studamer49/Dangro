import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../prisma.js";
import { authenticate, AuthRequest, requireUser } from "../middleware/auth.js";
import { AppError, asyncHandler, ok, parseOrThrow } from "../lib/http.js";
import { assertServerMember, findServerOr404, paramId } from "../lib/access.js";
import { requirePermission } from "../lib/permissions.js";
import { createDefaultRoles } from "../lib/permissions.js";
import { inviteState } from "./invites.js";
import { mediaUrl } from "../lib/urls.js";

const router = Router();

const createServerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  icon: mediaUrl().optional(),
  banner: mediaUrl().optional(),
  description: z.string().trim().max(500).optional(),
  /**
   * `true` creates an invite-only server. Defaults to public, which is what the
   * create form offers first and what every server that predates the column is.
   */
  isPrivate: z.boolean().optional().default(false),
});

const listInclude = {
  // Only one channel is needed — the client navigates to it when a server is
  // clicked — but which one matters: an unordered `take: 1` returns an
  // arbitrary channel, and if that happens to be a voice channel the text-chat
  // view is opened for it.
  channels: { where: { type: "text" }, orderBy: { createdAt: "asc" }, take: 1 },
  _count: { select: { members: true } },
} as const;

router.get(
  "/",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const servers = await prisma.server.findMany({
      where: { members: { some: { userId: requireUser(req) } } },
      include: listInclude,
      orderBy: { createdAt: "desc" },
    });

    ok(res, { servers });
  })
);

router.post(
  "/",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const { name, icon, banner, description, isPrivate } = parseOrThrow(createServerSchema, req.body);

    const server = await prisma.server.create({
      data: {
        name,
        icon,
        banner,
        description: description ?? null,
        isPrivate,
        ownerId: userId,
        inviteCode: uuidv4().slice(0, 8),
        members: { create: { userId, role: "owner" } },
        channels: { create: [{ name: "general", type: "text", position: 0 }] },
      },
      include: { channels: true },
    });

    // Discord puts the first channel in a "Text Channels" folder. The category
    // has to exist before #general can point at it, so it is created here and
    // the channel moved into it in a second step.
    const category = await prisma.category.create({
      data: { name: "Text Channels", serverId: server.id, position: 0 },
    });
    await prisma.channel.updateMany({
      where: { serverId: server.id, categoryId: null },
      data: { categoryId: category.id },
    });

    // @everyone / Moderator / Admin, Discord's starting set.
    await createDefaultRoles(server.id);

    const created = await prisma.server.findUnique({
      where: { id: server.id },
      include: {
        channels: { orderBy: { position: "asc" } },
        categories: { orderBy: { position: "asc" } },
        roles: { orderBy: { position: "desc" } },
      },
    });

    ok(res, { server: created }, 201);
  })
);

/**
 * Legacy invite join, kept so `/servers/join/:code` and every link already
 * shared keeps working. It resolves a managed invite first and falls back to
 * the server's permanent `inviteCode`.
 */
const joinHandler = asyncHandler(async (req: AuthRequest, res) => {
  const userId = requireUser(req);
  const raw = String(req.params.inviteCode ?? "").trim().toLowerCase();
  if (!raw) throw AppError.of("BAD_REQUEST", "Invalid invite code");

  const invite = await prisma.invite.findUnique({ where: { code: raw } });
  if (invite) {
    const { expired, exhausted } = inviteState(invite);
    if (expired || exhausted) throw AppError.of("NOT_FOUND", "Invite not found or expired");

    const banned = await prisma.ban.findUnique({
      where: { serverId_userId: { serverId: invite.serverId, userId } },
      select: { id: true },
    });
    if (banned) throw AppError.of("FORBIDDEN", "You are banned from this server");

    const existing = await prisma.member.findUnique({
      where: { userId_serverId: { userId, serverId: invite.serverId } },
    });
    if (!existing) {
      await prisma.member.create({ data: { userId, serverId: invite.serverId } });
      // See routes/invites.ts: the Mongo engine has no atomic `$inc`, so this
      // stays a read-modify-write rather than a Prisma `increment`.
      await prisma.invite.update({ where: { id: invite.id }, data: { uses: invite.uses + 1 } });
    }
    await respondWithServer(res, invite.serverId, !existing, invite.channelId);
    return;
  }

  const server = await prisma.server.findUnique({
    where: { inviteCode: raw },
    select: { id: true },
  });
  if (!server) throw AppError.of("NOT_FOUND", "Invite not found or expired");

  const banned = await prisma.ban.findUnique({
    where: { serverId_userId: { serverId: server.id, userId } },
    select: { id: true },
  });
  if (banned) throw AppError.of("FORBIDDEN", "You are banned from this server");

  const existing = await prisma.member.findUnique({
    where: { userId_serverId: { userId, serverId: server.id } },
  });
  if (!existing) {
    await prisma.member.create({ data: { userId, serverId: server.id } });
  }

  await respondWithServer(res, server.id, !existing, null);
});

/** POST is correct (joining mutates); GET stays for links already in the wild. */
router.post("/join/:inviteCode", authenticate, joinHandler);
router.get("/join/:inviteCode", authenticate, joinHandler);

/** Returns the full sidebar payload so the client can open the channel. */
async function respondWithServer(
  res: Parameters<typeof ok>[0],
  serverId: string,
  joined: boolean,
  channelId: string | null
): Promise<void> {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    include: {
      channels: { orderBy: { position: "asc" } },
      categories: { orderBy: { position: "asc" } },
      _count: { select: { members: true } },
    },
  });
  if (!server) throw AppError.of("NOT_FOUND", "Server not found");

  // An invite bound to a channel sends the joiner straight there; otherwise
  // they land on the first text channel.
  const target =
    (channelId ? server.channels.find((c) => c.id === channelId) : undefined) ??
    server.channels.find((c) => c.type === "text") ??
    server.channels[0];

  ok(res, { server, joined, channelId: target?.id ?? null });
}

/**
 * Explore: the public server directory.
 *
 * Only public servers are ever listed here. `isPrivate: { not: true }` rather
 * than `isPrivate: false` on purpose — MongoDB `$ne` also matches documents
 * where the field is absent, so every server created before the column existed
 * stays discoverable instead of silently vanishing from Explore.
 *
 * `?q=` searches by name, and is filtered to public servers too, so the search
 * box cannot be used to fish out the name of a private one.
 */
router.get(
  "/explore",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const query = String(req.query.q ?? "").trim().slice(0, 100);

    const where = {
      isPrivate: { not: true },
      ...(query
        ? { name: { contains: query, mode: "insensitive" as const } }
        : {}),
    };

    const servers = await prisma.server.findMany({
      where,
      include: { _count: { select: { members: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    ok(res, { servers });
  })
);

router.get(
  "/:id",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const id = paramId(req.params.id, "server id");

    await assertServerMember(id, userId);

    const server = await findServerOr404(id);
    ok(res, { server });
  })
);

/** Rotates the server's permanent invite code. */
router.post(
  "/:id/invite",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const id = paramId(req.params.id, "server id");

    await requirePermission(id, userId, "MANAGE_INVITES");

    const server = await prisma.server.update({
      where: { id },
      data: { inviteCode: uuidv4().slice(0, 8) },
      select: { id: true, inviteCode: true },
    });

    ok(res, { inviteCode: server.inviteCode });
  })
);

router.post(
  "/:id/leave",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const id = paramId(req.params.id, "server id");

    const server = await prisma.server.findUnique({ where: { id }, select: { ownerId: true } });
    if (!server) throw AppError.of("NOT_FOUND", "Server not found");
    if (server.ownerId === userId) {
      throw AppError.of("CONFLICT", "Transfer ownership before leaving the server");
    }

    const existing = await prisma.member.findUnique({
      where: { userId_serverId: { userId, serverId: id } },
      select: { id: true },
    });
    if (!existing) throw AppError.of("FORBIDDEN", "You are not a member of this server");

    await prisma.member.delete({ where: { id: existing.id } });

    ok(res, { message: "Left server" });
  })
);

router.delete(
  "/:id",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const id = paramId(req.params.id, "server id");

    await requirePermission(id, userId, "MANAGE_SERVER");

    await prisma.server.delete({ where: { id } });

    ok(res, { message: "Server deleted" });
  })
);

export default router;
