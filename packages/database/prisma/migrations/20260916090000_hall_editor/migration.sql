ALTER TABLE "TicketType" ADD COLUMN "venueObjectId" UUID;
CREATE UNIQUE INDEX "TicketType_venueObjectId_key" ON "TicketType"("venueObjectId");
ALTER TABLE "Seat" DROP CONSTRAINT "Seat_exactly_one_parent_check";
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_at_most_one_parent_check" CHECK (num_nonnulls("tableId", "rowId") <= 1);
ALTER TABLE "Table" DROP CONSTRAINT "Table_capacity_and_money_check";
ALTER TABLE "Table" ADD CONSTRAINT "Table_capacity_and_money_check" CHECK ("seats" >= 0 AND "price" >= 0 AND "deposit" >= 0);
