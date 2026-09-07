-- Batch 4 ticketing metadata and concurrency-safe inventory reservations.
CREATE TYPE "TicketReservationStatus" AS ENUM ('active', 'released', 'consumed');

ALTER TABLE "TicketType"
ADD COLUMN "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Ticket"
ALTER COLUMN "qrToken" DROP DEFAULT,
ADD COLUMN "paidAt" TIMESTAMPTZ(3),
ADD COLUMN "activatedAt" TIMESTAMPTZ(3),
ADD COLUMN "cancelledAt" TIMESTAMPTZ(3),
ADD COLUMN "refundedAt" TIMESTAMPTZ(3),
ADD COLUMN "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "TicketReservation" (
    "id" UUID NOT NULL,
    "ticketTypeId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "TicketReservationStatus" NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TicketReservation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TicketReservation"
ADD CONSTRAINT "TicketReservation_quantity_check" CHECK ("quantity" > 0),
ADD CONSTRAINT "TicketReservation_expiry_check" CHECK ("expiresAt" > "createdAt"),
ADD CONSTRAINT "TicketReservation_ticketTypeId_fkey"
FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "TicketReservation_token_key" ON "TicketReservation"("token");
CREATE INDEX "TicketReservation_ticketTypeId_status_expiresAt_idx"
ON "TicketReservation"("ticketTypeId", "status", "expiresAt");
