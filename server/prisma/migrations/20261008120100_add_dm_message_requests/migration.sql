ALTER TABLE "conversations" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "conversations" ADD COLUMN "requestSenderId" TEXT;