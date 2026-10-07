import { Router } from "express";
import { prisma } from "../prisma.js";
import { authenticate, AuthRequest, requireUser } from "../middleware/auth.js";
import { AppError, asyncHandler, ok } from "../lib/http.js";
import { paramId } from "../lib/access.js";

const router = Router();

const include = {
  fromUser: { select: { id: true, username: true, avatar: true } },
} as const;

router.get(
  "/",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        include,
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.notification.count({ where: { userId, read: false } }),
    ]);

    ok(res, { notifications, unreadCount });
  })
);

router.post(
  "/read-all",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);

    const result = await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });

    ok(res, { updated: result.count, unreadCount: 0 });
  })
);

router.post(
  "/:id/read",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const id = paramId(req.params.id, "notification id");

    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.userId !== userId) {
      throw AppError.of("NOT_FOUND", "Notification not found");
    }

    if (!notification.read) {
      await prisma.notification.update({ where: { id }, data: { read: true } });
    }

    const unreadCount = await prisma.notification.count({ where: { userId, read: false } });

    ok(res, { id, unreadCount });
  })
);

export default router;
