import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticate, AuthRequest, requireUser } from "../middleware/auth.js";
import { AppError, asyncHandler, ok, parseOrThrow } from "../lib/http.js";
import { paramId } from "../lib/access.js";
import { requireServerPermission } from "../lib/permissions.js";

/**
 * Channel categories — the Discord sidebar folder.
 *
 * A channel belongs to at most one category; `categoryId: null` means the
 * uncategorised group Discord renders at the top.
 */

const router = Router();

const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(100),
  serverId: z.string().uuid(),
});

const updateCategorySchema = z.object({ name: z.string().trim().min(1).max(100) });

const reorderSchema = z.object({
  categoryId: z.string().uuid(),
  position: z.number().int().min(0).max(10000),
});

async function nextCategoryPosition(serverId: string): Promise<number> {
  const last = await prisma.category.findFirst({
    where: { serverId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return (last?.position ?? -1) + 1;
}

router.get(
  "/servers/:id/categories",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const serverId = String(req.params.id ?? "");

    await requireServerPermission(serverId, userId, "manageCategories");

    const categories = await prisma.category.findMany({
      where: { serverId },
      orderBy: { position: "asc" },
      include: { channels: { orderBy: { position: "asc" }, select: { id: true, name: true, type: true } } },
    });

    ok(res, { categories });
  })
);

router.post(
  "/servers/:id/categories",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const serverId = String(req.params.id ?? "");
    const input = parseOrThrow(createCategorySchema, { ...req.body, serverId });

    await requireServerPermission(serverId, userId, "manageCategories");

    const category = await prisma.category.create({
      data: { name: input.name, serverId, position: await nextCategoryPosition(serverId) },
    });

    ok(res, { category }, 201);
  })
);

router.patch(
  "/categories/:categoryId",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const categoryId = paramId(req.params.categoryId, "category id");
    const input = parseOrThrow(updateCategorySchema, req.body);

    const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { serverId: true } });
    if (!category) throw AppError.of("NOT_FOUND", "Category not found");

    await requireServerPermission(category.serverId, userId, "manageCategories");

    const updated = await prisma.category.update({ where: { id: categoryId }, data: { name: input.name } });

    ok(res, { category: updated });
  })
);

/** Deleting a category keeps its channels — they fall back to uncategorised. */
router.delete(
  "/categories/:categoryId",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const categoryId = paramId(req.params.categoryId, "category id");

    const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { serverId: true } });
    if (!category) throw AppError.of("NOT_FOUND", "Category not found");

    await requireServerPermission(category.serverId, userId, "manageCategories");

    await prisma.category.delete({ where: { id: categoryId } });

    ok(res, { message: "Category deleted" });
  })
);

router.post(
  "/categories/:categoryId/move",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const categoryId = paramId(req.params.categoryId, "category id");
    const input = parseOrThrow(reorderSchema, req.body);

    const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { serverId: true } });
    if (!category) throw AppError.of("NOT_FOUND", "Category not found");

    await requireServerPermission(category.serverId, userId, "manageCategories");

    const updated = await prisma.category.update({
      where: { id: categoryId },
      data: { position: input.position },
    });

    ok(res, { category: updated });
  })
);

export default router;
