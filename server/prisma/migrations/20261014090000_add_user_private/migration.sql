-- AlterTable
-- Whether a profile hides its posts from people who do not follow it.
ALTER TABLE "users" ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;
