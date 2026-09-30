ALTER TYPE "NotificationChannel" ADD VALUE IF NOT EXISTS 'in_app';

ALTER TABLE "Notification"
  ADD COLUMN "eventId" UUID,
  ADD COLUMN "readAt" TIMESTAMPTZ(3),
  ADD COLUMN "dedupeKey" VARCHAR(160);

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");
CREATE INDEX "Notification_userId_channel_createdAt_id_idx" ON "Notification"("userId", "channel", "createdAt", "id");
CREATE INDEX "Notification_userId_channel_readAt_idx" ON "Notification"("userId", "channel", "readAt");

-- Historical outbox entries predate the R2 dispatcher and have no stable event version.
-- They must not trigger a retrospective message to a real guest on deployment.
UPDATE "OutboxEvent" SET "processedAt" = NOW()
WHERE "processedAt" IS NULL
  AND "eventType" IN ('event.updated', 'event.cancelled', 'checkout.paid');
