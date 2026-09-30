ALTER TABLE "TelegramLinkToken"
  ADD COLUMN "sessionFamilyId" UUID,
  ADD COLUMN "pendingTelegramId" BIGINT,
  ADD COLUMN "pendingChatId" BIGINT,
  ADD COLUMN "pendingAt" TIMESTAMPTZ(3),
  ADD COLUMN "confirmedAt" TIMESTAMPTZ(3);
CREATE INDEX "TelegramLinkToken_userId_pendingAt_confirmedAt_idx" ON "TelegramLinkToken"("userId", "pendingAt", "confirmedAt");
