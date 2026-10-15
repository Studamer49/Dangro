-- CreateTable
CREATE TABLE "direct_reactions" (
    "id" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "directMessageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "direct_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "direct_reactions_userId_directMessageId_emoji_key" ON "direct_reactions"("userId", "directMessageId", "emoji");

-- AddForeignKey
ALTER TABLE "direct_reactions" ADD CONSTRAINT "direct_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_reactions" ADD CONSTRAINT "direct_reactions_directMessageId_fkey" FOREIGN KEY ("directMessageId") REFERENCES "direct_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
