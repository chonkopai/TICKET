-- Separate scans from additive DDL. Retry if a lock/statement timeout expires.
SET lock_timeout = '2s';
SET statement_timeout = '3min';
ALTER TABLE "Event" VALIDATE CONSTRAINT "Event_v2_values_check";
ALTER TABLE "TicketType" VALIDATE CONSTRAINT "TicketType_tariffId_fkey";
ALTER TABLE "Table" VALIDATE CONSTRAINT "Table_tariffId_fkey";
ALTER TABLE "VenueRow" VALIDATE CONSTRAINT "VenueRow_tariffId_fkey";
RESET lock_timeout;
RESET statement_timeout;
