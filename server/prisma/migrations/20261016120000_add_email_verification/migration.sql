-- Email verification, password reset and session revocation.
--
-- The verification columns are NULLABLE AND UNDEFAULTED on purpose. A row
-- written before this migration reads back as NULL, and every route treats
-- NULL as "legacy account, already trusted" — so shipping verification does
-- NOT lock every existing account out. Only POST /auth/register writes an
-- explicit `false`, and that is the only thing that makes an account
-- unverified.
--
-- Do not "tidy" this into NOT NULL DEFAULT false: that single change signs
-- every pre-existing user out until they can click a link they never
-- received. That would be a different, deliberate migration decision.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "emailVerified" BOOLEAN;
ALTER TABLE "users" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "emailVerificationTokenHash" TEXT;
ALTER TABLE "users" ADD COLUMN "emailVerificationExpiresAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "emailVerificationSentAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "emailVerificationUsedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "passwordResetTokenHash" TEXT;
ALTER TABLE "users" ADD COLUMN "passwordResetExpiresAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "passwordResetUsedAt" TIMESTAMP(3);

-- 0 for every existing row, matching what the MongoDB registry defaults to.
ALTER TABLE "users" ADD COLUMN "authSessionVersion" INTEGER NOT NULL DEFAULT 0;