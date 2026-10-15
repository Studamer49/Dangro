import { Router } from "express";
import { prisma } from "../prisma.js";
import { authenticate, AuthRequest, requireUser } from "../middleware/auth.js";
import { AppError, asyncHandler, ok } from "../lib/http.js";
import { paramId } from "../lib/access.js";

const router = Router();

const blockedUserSelect = {
  id: true,
  username: true,
  avatar: true,
  status: true,
} as const;

/** Everyone the caller has blocked, newest first. */
router.get(
  "/",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);

    const blocks = await prisma.block.findMany({
      where: { userId },
      include: { blocked: { select: blockedUserSelect } },
      orderBy: { createdAt: "desc" },
    });

    ok(res, {
      blocked: blocks.map((block) => block.blocked),
      blockedIds: blocks.map((block) => block.blockedId),
    });
  })
);

/** Toggles a block on `:userId`. Blocking is one-directional in storage but a
 * wall in effect: either side blocking is enough to stop messages and follows. */
router.post(
  "/:userId",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const targetUserId = paramId(req.params.userId, "user id");

    if (userId === targetUserId) {
      throw AppError.of("BAD_REQUEST", "You cannot block yourself");
    }

    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });
    if (!target) throw AppError.of("NOT_FOUND", "User not found");

    const existing = await prisma.block.findUnique({
      where: { userId_blockedId: { userId, blockedId: targetUserId } },
    });

    if (existing) {
      await prisma.block.delete({ where: { id: existing.id } });
    } else {
      await prisma.block.create({ data: { userId, blockedId: targetUserId } });
    }

    ok(res, { blocked: !existing, userId: targetUserId });
  })
);

export default router;
