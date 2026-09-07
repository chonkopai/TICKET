-- Add the complete event-content fields established in Batch 3.
ALTER TABLE "Event"
ADD COLUMN "extraConditions" TEXT,
ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Almaty';

ALTER TABLE "Event"
ADD CONSTRAINT "Event_timezone_not_blank_check"
CHECK (length(btrim("timezone")) > 0);

-- Durable transactional outbox. Consumers arrive in later batches; producers write now.
CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OutboxEvent"
ADD CONSTRAINT "OutboxEvent_attempts_check"
CHECK ("attempts" >= 0);

CREATE INDEX "OutboxEvent_processedAt_occurredAt_idx"
ON "OutboxEvent"("processedAt", "occurredAt");

CREATE INDEX "OutboxEvent_aggregateType_aggregateId_occurredAt_idx"
ON "OutboxEvent"("aggregateType", "aggregateId", "occurredAt");

CREATE INDEX "OutboxEvent_eventType_occurredAt_idx"
ON "OutboxEvent"("eventType", "occurredAt");
