BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE "RefundRequest" ADD COLUMN "acceptedSnapshot" jsonb;
COMMIT;
