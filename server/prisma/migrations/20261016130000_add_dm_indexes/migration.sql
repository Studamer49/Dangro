-- CreateIndex
-- The conversation list is `WHERE user1Id = ? OR user2Id = ?` ordered by
-- recency. The unique index below only covers the `user1Id` half of that OR,
-- so every list load scanned the table for the `user2Id` half and sorted it.
CREATE INDEX "conversations_user2Id_idx" ON "conversations"("user2Id");

-- CreateIndex
CREATE INDEX "conversations_lastMessageAt_idx" ON "conversations"("lastMessageAt");

-- CreateIndex
-- A thread's messages are read by `conversationId` ordered by `createdAt`; the
-- unread count reads the same rows filtered by `readAt`. Both were full scans
-- of `direct_messages` before this.
CREATE INDEX "direct_messages_conversationId_createdAt_idx" ON "direct_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "direct_messages_conversationId_readAt_idx" ON "direct_messages"("conversationId", "readAt");
