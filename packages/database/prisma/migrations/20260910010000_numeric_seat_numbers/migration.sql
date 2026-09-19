ALTER TABLE "Seat" ADD COLUMN "number" INTEGER;

UPDATE "Seat"
SET "number" = "label"::INTEGER
WHERE "label" ~ '^[1-9][0-9]*$';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Seat" WHERE "number" IS NULL) THEN
    RAISE EXCEPTION 'SEAT_NUMBER_MIGRATION_REQUIRED: non-numeric or non-positive historical seat labels must be resolved explicitly';
  END IF;
END $$;

DROP INDEX IF EXISTS "Seat_tableId_label_key";
DROP INDEX IF EXISTS "Seat_rowId_label_key";

ALTER TABLE "Seat"
  ALTER COLUMN "number" SET NOT NULL,
  ADD CONSTRAINT "Seat_number_positive" CHECK ("number" > 0);

CREATE UNIQUE INDEX "Seat_tableId_number_key" ON "Seat"("tableId", "number");
CREATE UNIQUE INDEX "Seat_rowId_number_key" ON "Seat"("rowId", "number");

ALTER TABLE "Ticket" ADD COLUMN "seatLabelSnapshot" VARCHAR(120);

UPDATE "Ticket" AS ticket
SET "seatLabelSnapshot" = CASE
  WHEN seat."tableId" IS NOT NULL THEN 'Стол ' || table_record."number" || ' · Место ' || seat."number"
  WHEN seat."rowId" IS NOT NULL THEN 'Ряд ' || row_record."number" || ' · Место ' || seat."number"
  ELSE NULL
END
FROM "SeatAllocation" AS allocation
JOIN "Seat" AS seat ON seat."id" = allocation."seatId"
LEFT JOIN "Table" AS table_record ON table_record."id" = seat."tableId"
LEFT JOIN "VenueRow" AS row_record ON row_record."id" = seat."rowId"
WHERE allocation."ticketId" = ticket."id";
