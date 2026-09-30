ALTER TYPE "NotificationStatus" ADD VALUE IF NOT EXISTS 'uncertain';

ALTER TABLE "Broadcast"
  ADD COLUMN "requestKey" UUID,
  ADD COLUMN "type" VARCHAR(40),
  ADD COLUMN "audienceCount" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "Broadcast_requestKey_key" ON "Broadcast"("requestKey");

ALTER TABLE "Notification"
  ADD COLUMN "broadcastId" UUID,
  ADD COLUMN "recipientKey" VARCHAR(100),
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextAttemptAt" TIMESTAMPTZ(3),
  ADD COLUMN "claimedAt" TIMESTAMPTZ(3),
  ADD COLUMN "lastError" VARCHAR(100),
  ADD COLUMN "providerMessageId" VARCHAR(100);
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_broadcastId_fkey"
  FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Notification_broadcastId_recipientKey_key" ON "Notification"("broadcastId", "recipientKey");
CREATE INDEX "Notification_status_nextAttemptAt_idx" ON "Notification"("status", "nextAttemptAt");
