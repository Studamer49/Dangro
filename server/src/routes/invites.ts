import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticate, AuthRequest, requireUser } from "../middleware/auth.js";
import { AppError, asyncHandler, ok, parseOrThrow } from "../lib/http.js";
import { requireServerPermission } from "../lib/permissions.js";

/**
 * Server invites, Discord-style.
 *
 * A server keeps one permanent `Server.inviteCode` (the link that predates
 * this router and is still what `/invite/:code` resolves) plus any number of
 * managed invites with their own expiry and use cap. Each can be revoked
 * without touching the others, which is the point: one leaked link should not
 * cost you the server.
 */

const router = Router();

/** Discord-style invites: 1h / 24h / 7d / never. */
const MAX_AGE_CHOICES = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  never: null,
} as const;

const createInviteSchema = z.object({
  maxAge: z.enum(["1h", "24h", "7d", "never"]).default("24h"),
  maxUses: z.number().int().min(1).max(1000).nullish(),
  channelId: z.string().uuid().nullish(),
});

/** Invite codes are user-visible, so keep them short and unambiguous. */
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function generateCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const byte of bytes) {
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return code;
}

/** Strips characters that are easy to misread when a code is read aloud. */
const CODE_RE = /^[a-z0-9]{4,32}$/;

function normalizeCode(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface InviteState {
  expired: boolean;
  exhausted: boolean;
}

/** Whether an invite can still be redeemed, computed from its own fields. */
export function inviteState(invite: { uses: number; maxUses?: number | null; expiresAt?: Date | null }): InviteState {
  const expired = Boolean(invite.expiresAt && invite.expiresAt.getTime() <= Date.now());
  const exhausted = invite.maxUses !== null && invite.maxUses !== undefined && invite.uses >= invite.maxUses;
  return { expired, exhausted };
}

/** List the server's managed invites with their inviter, newest first. */
router.get(
  "/servers/:id/invites",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const serverId = String(req.params.id ?? "");
    await requireServerPermission(serverId, userId, "manageInvites");

    const invites = await prisma.invite.findMany({
      where: { serverId },
      include: {
        channel: { select: { id: true, name: true } },
        inviter: { select: { id: true, username: true, avatar: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    ok(res, {
      invites: invites.map((invite) => ({
        ...invite,
        ...inviteState(invite as never),
        url: `/invite/${invite.code}`,
      })),
    });
  })
);

router.post(
  "/servers/:id/invites",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const serverId = String(req.params.id ?? "");
    const input = parseOrThrow(createInviteSchema, req.body ?? {});

    await requireServerPermission(serverId, userId, "manageInvites");

    if (input.channelId) {
      // The channel must belong to *this* server, otherwise an invite could
      // drop joiners into an arbitrary channel elsewhere.
      const channel = await prisma.channel.findUnique({
        where: { id: input.channelId },
        select: { serverId: true },
      });
      if (!channel || channel.serverId !== serverId) {
        throw AppError.of("BAD_REQUEST", "That channel is not in this server");
      }
    }

    const maxAgeMs = MAX_AGE_CHOICES[input.maxAge];
    const expiresAt = maxAgeMs ? new Date(Date.now() + maxAgeMs) : null;

    // A unique-index violation here just means two people generated the same
    // 8-character code, which is astronomically unlikely but cheap to retry.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const invite = await prisma.invite.create({
          data: {
            code: generateCode(),
            serverId,
            channelId: input.channelId ?? null,
            inviterId: userId,
            maxUses: input.maxUses ?? null,
            expiresAt,
          },
          include: {
            channel: { select: { id: true, name: true } },
            inviter: { select: { id: true, username: true, avatar: true } },
          },
        });

        ok(res, { invite: { ...invite, expired: false, exhausted: false, url: `/invite/${invite.code}` } }, 201);
        return;
      } catch (err) {
        const duplicate = (err as { code?: number; message?: string })?.code === 11000 ||
          String((err as { message?: string })?.message).includes("E11000");
        if (!duplicate) throw err;
      }
    }

    throw new AppError("Could not allocate a unique invite code. Try again.", 503, "INTERNAL_ERROR");
  })
);

router.delete(
  "/servers/:id/invites/:code",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const serverId = String(req.params.id ?? "");
    const code = normalizeCode(String(req.params.code ?? ""));

    await requireServerPermission(serverId, userId, "manageInvites");

    // Scoped to the server so an admin cannot revoke another server's invite
    // by guessing a code.
    const deleted = await prisma.invite.deleteMany({ where: { code, serverId } });
    if (deleted.count === 0) throw AppError.of("NOT_FOUND", "Invite not found");

    ok(res, { message: "Invite revoked" });
  })
);

/** Public preview so the join screen can show who invited you and where. */
router.get(
  "/invites/:code",
  asyncHandler(async (req: Request, res) => {
    const code = normalizeCode(String(req.params.code ?? ""));
    if (!CODE_RE.test(code)) throw AppError.of("BAD_REQUEST", "Invalid invite code");

    const invite = await prisma.invite.findUnique({
      where: { code },
      include: {
        server: {
          select: { id: true, name: true, icon: true, description: true, _count: { select: { members: true } } },
        },
        channel: { select: { id: true, name: true } },
        inviter: { select: { id: true, username: true, avatar: true } },
      },
    });

    // A dead invite is reported exactly like a missing one, so the endpoint
    // cannot be used to test whether a code ever existed.
    if (!invite) throw AppError.of("NOT_FOUND", "Invite not found or expired");

    const { expired, exhausted } = inviteState(invite);
    if (expired || exhausted) throw AppError.of("NOT_FOUND", "Invite not found or expired");

    ok(res, {
      invite: {
        code: invite.code,
        server: invite.server,
        channel: invite.channel,
        inviter: invite.inviter,
        expiresAt: invite.expiresAt,
        uses: invite.uses,
        maxUses: invite.maxUses,
      },
    });
  })
);

/** Redeem an invite. Same shape as the legacy `GET /servers/join/:code`. */
router.post(
  "/invites/:code",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const code = normalizeCode(String(req.params.code ?? ""));
    if (!CODE_RE.test(code)) throw AppError.of("BAD_REQUEST", "Invalid invite code");

    const invite = await prisma.invite.findUnique({ where: { code } });
    if (!invite) throw AppError.of("NOT_FOUND", "Invite not found or expired");

    const { expired, exhausted } = inviteState(invite);
    if (expired || exhausted) throw AppError.of("NOT_FOUND", "Invite not found or expired");

    const existingMember = await prisma.member.findUnique({
      where: { userId_serverId: { userId, serverId: invite.serverId } },
    });

    if (!existingMember) {
      try {
        await prisma.member.create({ data: { userId, serverId: invite.serverId } });
      } catch (err) {
        // Two clicks on the same invite race; the second join is a no-op, not
        // an error.
        const duplicate = (err as { code?: number })?.code === 11000;
        if (!duplicate) throw err;
      }

      await prisma.invite.update({
        where: { id: invite.id },
        data: { uses: invite.uses + 1 },
      });
    }

    const server = await prisma.server.findUnique({
      where: { id: invite.serverId },
      include: {
        channels: { orderBy: { position: "asc" } },
        categories: { orderBy: { position: "asc" } },
        _count: { select: { members: true } },
      },
    });
    if (!server) throw AppError.of("NOT_FOUND", "Server not found");

    ok(res, { server, joined: !existingMember });
  })
);

export default router;
