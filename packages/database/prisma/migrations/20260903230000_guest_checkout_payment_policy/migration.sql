-- Event payment policy replaces the legacy boolean with one explicit authority.
CREATE TYPE "EventPaymentMode" AS ENUM ('deposit', 'full_payment');

ALTER TABLE "Event"
ADD COLUMN "paymentMode" "EventPaymentMode" NOT NULL DEFAULT 'full_payment',
ADD COLUMN "showFullAmountForDeposit" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Event"
SET "paymentMode" = CASE WHEN "depositEnabled" THEN 'deposit'::"EventPaymentMode" ELSE 'full_payment'::"EventPaymentMode" END;

ALTER TABLE "Event" DROP COLUMN "depositEnabled";

ALTER TABLE "TicketType"
ADD COLUMN "deposit" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "TicketType"
ADD CONSTRAINT "TicketType_deposit_check" CHECK ("deposit" >= 0);

ALTER TABLE "Order"
ADD COLUMN "checkoutSnapshot" JSONB,
ADD COLUMN "termsAcceptedAt" TIMESTAMPTZ(3);

ALTER TABLE "TicketReservation"
ADD COLUMN "orderId" UUID;

ALTER TABLE "Booking"
ADD COLUMN "tableHoldId" UUID;

CREATE UNIQUE INDEX "Booking_tableHoldId_key" ON "Booking"("tableHoldId");
CREATE INDEX "TicketReservation_orderId_idx" ON "TicketReservation"("orderId");

CREATE TABLE "IdempotencyRecord" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "operation" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "resourceId" UUID,
  "response" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IdempotencyRecord_userId_operation_key_key"
ON "IdempotencyRecord"("userId", "operation", "key");
CREATE INDEX "IdempotencyRecord_resourceId_idx" ON "IdempotencyRecord"("resourceId");

ALTER TABLE "TicketReservation"
ADD CONSTRAINT "TicketReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_tableHoldId_fkey" FOREIGN KEY ("tableHoldId") REFERENCES "TableHold"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IdempotencyRecord"
ADD CONSTRAINT "IdempotencyRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Event"
ADD CONSTRAINT "Event_deposit_display_check" CHECK (
  "paymentMode" = 'deposit' OR "showFullAmountForDeposit" = false
);

ALTER TABLE "IdempotencyRecord"
ADD CONSTRAINT "IdempotencyRecord_key_check" CHECK (char_length("key") BETWEEN 8 AND 128),
ADD CONSTRAINT "IdempotencyRecord_operation_check" CHECK (char_length("operation") BETWEEN 1 AND 80);
