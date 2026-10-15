-- AlterTable
-- Wide banner behind the server header. Nullable, so existing servers fall
-- back to the icon (or the initial tile) with no data change.
ALTER TABLE "servers" ADD COLUMN "banner" TEXT;
