-- These historic changes have no R2 recipient snapshot; avoid retrospective sends.
UPDATE "OutboxEvent" SET "processedAt" = NOW()
WHERE "processedAt" IS NULL
  AND "eventType" IN ('booking.cancelled', 'ticket.cancelled', 'refund.succeeded');
