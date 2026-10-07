import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../prisma.js";
import { authenticate, AuthRequest, requireUser } from "../middleware/auth.js";
import { AppError, asyncHandler, ok, parseOrThrow } from "../lib/http.js";
import { assertServerMember, findServerOr404, paramId } from "../lib/access.js";

const router = Router();

const createServerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  icon: z.string().url().max(500).optional(),
});

const updateServerSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    icon: z.string().url().max(500).nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

const listInclude = {
  channels: { take: 1 },
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
    const { name, icon } = parseOrThrow(createServerSchema, req.body);

    const server = await prisma.server.create({
      data: {
        name,
        icon,
        ownerId: userId,
        inviteCode: uuidv4().slice(0, 8),
        members: { create: { userId, role: "owner" } },
        channels: { create: [{ name: "general", type: "text" }] },
      },
      include: { channels: true },
    });

    ok(res, { server }, 201);
  })
);

router.get(
  "/join/:inviteCode",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const inviteCode = String(req.params.inviteCode ?? "").trim().slice(0, 32);
    if (!inviteCode) throw AppError.of("BAD_REQUEST", "Invalid invite code");

    const server = await prisma.server.findUnique({
      where: { inviteCode },
      include: { channels: true, _count: { select: { members: true } } },
    });
    if (!server) throw AppError.of("NOT_FOUND", "Invite not found or expired");

    const existingMember = await prisma.member.findUnique({
      where: { userId_serverId: { userId, serverId: server.id } },
    });

    if (!existingMember) {
      await prisma.member.create({ data: { userId, serverId: server.id } });
    }

    ok(res, { server });
  })
);

router.get(
  "/explore",
  authenticate,
  asyncHandler(async (_req: AuthRequest, res) => {
    const servers = await prisma.server.findMany({
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

router.patch(
  "/:id",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const id = paramId(req.params.id, "server id");
    const input = parseOrThrow(updateServerSchema, req.body);

    await assertServerMember(id, userId, ["owner", "admin"]);

    const server = await prisma.server.update({
      where: { id },
      data: {
        name: input.name,
        icon: input.icon === undefined ? undefined : input.icon ?? null,
      },
      include: { channels: true, _count: { select: { members: true } } },
    });

    ok(res, { server });
  })
);

/** Owner/admin can rotate the invite link. */
router.post(
  "/:id/invite",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const id = paramId(req.params.id, "server id");

    await assertServerMember(id, userId, ["owner", "admin"]);

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
      throw AppError.of("CONFLICT", "Owners must delete the server instead of leaving it");
    }

    await prisma.member.deleteMany({ where: { serverId: id, userId } });

    ok(res, { message: "Left server" });
  })
);

router.delete(
  "/:id",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const id = paramId(req.params.id, "server id");

    const server = await prisma.server.findUnique({ where: { id }, select: { ownerId: true } });
    if (!server) throw AppError.of("NOT_FOUND", "Server not found");
    if (server.ownerId !== userId) throw AppError.of("FORBIDDEN", "Only the owner can delete this server");

    await prisma.server.delete({ where: { id } });

    ok(res, { message: "Server deleted" });
  })
);

export default router;
