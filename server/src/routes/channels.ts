import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticate, AuthRequest, requireUser } from "../middleware/auth.js";
import { AppError, asyncHandler, ok, parseOrThrow } from "../lib/http.js";
import { assertServerMember, findServerOr404, paramId } from "../lib/access.js";

const router = Router();

const createChannelSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9 _-]+$/i, "Channel names may only contain letters, numbers, spaces, _ and -"),
  type: z.enum(["text", "voice"]),
  serverId: z.string().uuid(),
});

router.post(
  "/",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const { name, type, serverId } = parseOrThrow(createChannelSchema, req.body);

    await assertServerMember(serverId, userId, ["owner", "admin"]);

    const channel = await prisma.channel.create({ data: { name, type, serverId } });

    ok(res, { channel }, 201);
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

    await assertServerMember(channel.serverId, userId);

    const server = await findServerOr404(channel.serverId);

    ok(res, { server });
  })
);

export default router;
