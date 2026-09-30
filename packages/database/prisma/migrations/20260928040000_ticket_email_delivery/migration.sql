ALTER TABLE "Order"
  ADD COLUMN "emailDeliveryAddress" TEXT,
  ADD COLUMN "emailDeliveryRequestedAt" TIMESTAMPTZ(3);

ALTER TABLE "AnonymousCheckoutSession"
  ADD COLUMN "verifiedEmail" TEXT;

CREATE TABLE "TicketEmailDelivery" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "recipient" TEXT NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'queued',
  "generation" INTEGER NOT NULL DEFAULT 1,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMPTZ(3),
  "acceptedAt" TIMESTAMPTZ(3),
  "providerMessageId" TEXT,
  "lastErrorCode" TEXT,
  "capabilityHash" TEXT NOT NULL,
  "capabilityExpiresAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "TicketEmailDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TicketEmailDelivery_orderId_key" ON "TicketEmailDelivery"("orderId");
CREATE UNIQUE INDEX "TicketEmailDelivery_capabilityHash_key" ON "TicketEmailDelivery"("capabilityHash");
CREATE INDEX "TicketEmailDelivery_status_nextAttemptAt_leaseUntil_idx" ON "TicketEmailDelivery"("status", "nextAttemptAt", "leaseUntil");
ALTER TABLE "TicketEmailDelivery" ADD CONSTRAINT "TicketEmailDelivery_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A paid order can request at most one initial delivery. Historical paid
-- orders have no event of this type and never receive an automatic backfill.
CREATE UNIQUE INDEX "OutboxEvent_ticket_email_requested_once"
  ON "OutboxEvent"("aggregateId") WHERE "eventType" = 'ticket.email_requested';
