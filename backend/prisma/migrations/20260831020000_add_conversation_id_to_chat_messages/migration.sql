-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN "conversationId" TEXT NOT NULL DEFAULT gen_random_uuid();

-- CreateIndex
CREATE INDEX "ChatMessage_runId_conversationId_idx" ON "ChatMessage"("runId", "conversationId");
