CREATE TYPE "TableSaleMode" AS ENUM ('whole_table', 'per_seat');
CREATE TYPE "SeatStatus" AS ENUM ('available', 'disabled');
CREATE TYPE "SeatAllocationStatus" AS ENUM ('active', 'released', 'consumed');
CREATE TYPE "GroupPassStatus" AS ENUM ('active', 'used', 'cancelled');

ALTER TABLE "Table"
  ADD COLUMN "typeLabel" VARCHAR(40),
  ADD COLUMN "shortDescription" VARCHAR(200),
  ADD COLUMN "saleMode" "TableSaleMode" NOT NULL DEFAULT 'whole_table';

CREATE TABLE "VenueRow" (
  "id" UUID NOT NULL,
  "venueLayoutId" UUID NOT NULL,
  "number" INTEGER NOT NULL,
  "name" TEXT,
  "typeLabel" VARCHAR(40),
  "shortDescription" VARCHAR(200),
  "price" INTEGER NOT NULL DEFAULT 0,
  "deposit" INTEGER NOT NULL DEFAULT 0,
  "currency" CHAR(3) NOT NULL,
  "status" "TableStatus" NOT NULL DEFAULT 'available',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "VenueRow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Seat" (
  "id" UUID NOT NULL,
  "venueLayoutId" UUID NOT NULL,
  "tableId" UUID,
  "rowId" UUID,
  "label" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "status" "SeatStatus" NOT NULL DEFAULT 'available',
  "ticketTypeId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Seat_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Seat_exactly_one_parent_check" CHECK (("tableId" IS NOT NULL) <> ("rowId" IS NOT NULL)
  )
);

CREATE TABLE "SeatAllocation" (
  "id" UUID NOT NULL,
  "seatId" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "ticketId" UUID,
  "status" "SeatAllocationStatus" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMPTZ(3),
  "consumedAt" TIMESTAMPTZ(3),
  CONSTRAINT "SeatAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GroupPass" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "tableId" UUID NOT NULL,
  "token" TEXT NOT NULL,
  "totalSeats" INTEGER NOT NULL,
  "status" "GroupPassStatus" NOT NULL DEFAULT 'active',
  "usedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupPass_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VenueRow_venueLayoutId_number_key" ON "VenueRow"("venueLayoutId", "number");
CREATE INDEX "VenueRow_venueLayoutId_status_idx" ON "VenueRow"("venueLayoutId", "status");
CREATE UNIQUE INDEX "Seat_tableId_label_key" ON "Seat"("tableId", "label");
CREATE UNIQUE INDEX "Seat_rowId_label_key" ON "Seat"("rowId", "label");
CREATE INDEX "Seat_venueLayoutId_status_idx" ON "Seat"("venueLayoutId", "status");
CREATE INDEX "Seat_ticketTypeId_status_idx" ON "Seat"("ticketTypeId", "status");
CREATE INDEX "SeatAllocation_seatId_status_idx" ON "SeatAllocation"("seatId", "status");
CREATE INDEX "SeatAllocation_orderId_status_idx" ON "SeatAllocation"("orderId", "status");
CREATE UNIQUE INDEX "SeatAllocation_ticketId_key" ON "SeatAllocation"("ticketId");
CREATE UNIQUE INDEX "SeatAllocation_live_seat_key" ON "SeatAllocation"("seatId") WHERE "status" IN ('active', 'consumed');
CREATE UNIQUE INDEX "GroupPass_orderId_key" ON "GroupPass"("orderId");
CREATE UNIQUE INDEX "GroupPass_token_key" ON "GroupPass"("token");
CREATE INDEX "GroupPass_tableId_status_idx" ON "GroupPass"("tableId", "status");

ALTER TABLE "VenueRow" ADD CONSTRAINT "VenueRow_venueLayoutId_fkey"
  FOREIGN KEY ("venueLayoutId") REFERENCES "VenueLayout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_venueLayoutId_fkey"
  FOREIGN KEY ("venueLayoutId") REFERENCES "VenueLayout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_tableId_fkey"
  FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_rowId_fkey"
  FOREIGN KEY ("rowId") REFERENCES "VenueRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_ticketTypeId_fkey"
  FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SeatAllocation" ADD CONSTRAINT "SeatAllocation_seatId_fkey"
  FOREIGN KEY ("seatId") REFERENCES "Seat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SeatAllocation" ADD CONSTRAINT "SeatAllocation_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeatAllocation" ADD CONSTRAINT "SeatAllocation_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GroupPass" ADD CONSTRAINT "GroupPass_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupPass" ADD CONSTRAINT "GroupPass_tableId_fkey"
  FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
