ALTER TABLE "ChatMessage" ADD COLUMN "anonymousSessionId" UUID;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_anonymousSessionId_fkey"
  FOREIGN KEY ("anonymousSessionId") REFERENCES "AnonymousCheckoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "ChatMessage_anonymousSessionId_createdAt_idx" ON "ChatMessage"("anonymousSessionId", "createdAt");
ALTER TABLE "ChatMessage" DROP CONSTRAINT "ChatMessage_guest_identity_check";
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_guest_identity_check"
  CHECK ("guestUserId" IS NOT NULL OR "guestContact" IS NOT NULL OR "anonymousSessionId" IS NOT NULL);
