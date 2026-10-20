-- Public / private servers.
--
-- A private server is invite-only: it is hidden from Explore and from server
-- search, and can only be reached through an invite link.
--
-- DEFAULT false, NOT NULL: every server that already exists stays public, and
-- a document written by an older API that has no `isPrivate` field at all is
-- read as public by the Explore query (`isPrivate != true`), so nothing
-- disappears the moment this deploys.

-- AlterTable
ALTER TABLE "servers" ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;