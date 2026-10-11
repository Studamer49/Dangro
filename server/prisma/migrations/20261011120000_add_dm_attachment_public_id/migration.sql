-- AlterTable
-- Canonical Cloudinary asset id for a DM attachment. Nullable, so existing
-- rows (including messages without any attachment) are untouched.
ALTER TABLE "direct_messages" ADD COLUMN "attachmentPublicId" TEXT;