import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticate, AuthRequest, requireUser } from "../middleware/auth.js";
import { AppError, asyncHandler, ok, parseOrThrow } from "../lib/http.js";
import { assertServerMember, findServerOr404, paramId } from "../lib/access.js";
import { requireServerPermission } from "../lib/permissions.js";

const router = Router();

const CHANNEL_NAME_RE = /^[a-z0-9 _-]+$/i;
const CHANNEL_NAME_MESSAGE = "Channel names may only contain letters, numbers, spaces, _ and -";

const createChannelSchema = z.object({
  name: z.string().trim().min(1).max(100).regex(CHANNEL_NAME_RE, CHANNEL_NAME_MESSAGE),
  type: z.enum(["text", "voice"]),
  serverId: z.string().uuid(),
  categoryId: z.string().uuid().nullish(),
  topic: z.string().trim().max(1024).nullish(),
});

const updateChannelSchema = z
  .object({
    name: z.string().trim().min(1).max(100).regex(CHANNEL_NAME_RE, CHANNEL_NAME_MESSAGE).optional(),
    topic: z.string().trim().max(1024).nullish(),
    type: z.enum(["text", "voice"]).optional(),
    /** Sent explicitly as null to move a channel out of its category. */
    categoryId: z.string().uuid().nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update" });

const reorderSchema = z.object({
  channelId: z.string().uuid(),
  position: z.number().int().min(0).max(10000),
  categoryId: z.string().uuid().nullish().optional(),
});

/** A channel's category must belong to the same server, or be cleared. */
async function assertCategoryInServer(categoryId: string | null | undefined, serverId: string): Promise<void> {
  if (!categoryId) return;
  const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { serverId: true } });
  if (!category || category.serverId !== serverId) {
    throw AppError.of("BAD_REQUEST", "That category is not in this server");
  }
}

/** New channels go to the bottom of their category (or of the server). */
async function nextPosition(categoryId: string | null): Promise<number> {
  const where = categoryId ? { categoryId } : { categoryId: null };
  const last = await prisma.channel.findFirst({ where, orderBy: { position: "desc" }, select: { position: true } });
  return (last?.position ?? -1) + 1;
}

router.post(
  "/",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const input = parseOrThrow(createChannelSchema, req.body);

    await requireServerPermission(input.serverId, userId, "manageChannels");
    await assertCategoryInServer(input.categoryId, input.serverId);

    const channel = await prisma.channel.create({
      data: {
        name: input.name,
        type: input.type,
        serverId: input.serverId,
        categoryId: input.categoryId ?? null,
        topic: input.topic ?? null,
        position: await nextPosition(input.categoryId ?? null),
      },
    });

    ok(res, { channel }, 201);
  })
);

router.patch(
  "/:channelId",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const channelId = paramId(req.params.channelId, "channel id");
    const input = parseOrThrow(updateChannelSchema, req.body);

    const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { serverId: true } });
    if (!channel) throw AppError.of("NOT_FOUND", "Channel not found");

    await requireServerPermission(channel.serverId, userId, "manageChannels");

    if (input.categoryId !== undefined) {
      await assertCategoryInServer(input.categoryId, channel.serverId);
    }

    const updated = await prisma.channel.update({
      where: { id: channelId },
      data: {
        name: input.name,
        type: input.type,
        topic: input.topic === undefined ? undefined : input.topic ?? null,
        categoryId: input.categoryId === undefined ? undefined : input.categoryId ?? null,
      },
    });

    ok(res, { channel: updated });
  })
);

router.delete(
  "/:channelId",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const channelId = paramId(req.params.channelId, "channel id");

    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { serverId: true, type: true },
    });
    if (!channel) throw AppError.of("NOT_FOUND", "Channel not found");

    await requireServerPermission(channel.serverId, userId, "manageChannels");

    // Deleting the last channel would leave a server nobody can open: the
    // sidebar navigates to a text channel, and with none the page is empty and
    // unusable.
    if (channel.type === "text") {
      const remaining = await prisma.channel.count({
        where: { serverId: channel.serverId, type: "text", id: { not: channelId } },
      });
      if (remaining === 0) {
        throw AppError.of("CONFLICT", "A server needs at least one text channel");
      }
    }

    // Cascade takes the channel's messages, reactions and attachments with it.
    await prisma.channel.delete({ where: { id: channelId } });

    ok(res, { message: "Channel deleted" });
  })
);

/** Move a channel to a position, and optionally into another category. */
router.post(
  "/:channelId/move",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const channelId = paramId(req.params.channelId, "channel id");
    const input = parseOrThrow(reorderSchema, req.body);

    const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { serverId: true } });
    if (!channel) throw AppError.of("NOT_FOUND", "Channel not found");

    await requireServerPermission(channel.serverId, userId, "manageChannels");
    await assertCategoryInServer(input.categoryId, channel.serverId);

    const updated = await prisma.channel.update({
      where: { id: channelId },
      data: {
        position: input.position,
        categoryId: input.categoryId === undefined ? undefined : input.categoryId ?? null,
      },
    });

    ok(res, { channel: updated });
  })
);

router.get(
  "/:channelId/server",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const channelId = paramId(req.params.channelId, "channel id");

    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { serverId: true },
    });
    if (!channel) throw AppError.of("NOT_FOUND", "Channel not found");

    // Plain membership, not a management permission: the client calls this on
    // every channel switch, for every member.
    await assertServerMember(channel.serverId, userId);

    const server = await findServerOr404(channel.serverId);

    ok(res, { server });
  })
);

export default router;
