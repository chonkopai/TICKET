ALTER TABLE "ChatMessage" ADD COLUMN "clientMessageId" UUID;
CREATE UNIQUE INDEX "ChatMessage_clientMessageId_key" ON "ChatMessage"("clientMessageId");
