BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
ALTER TABLE "MediaAsset" ADD COLUMN "uploadExpiresAt" timestamptz(3), ADD COLUMN "publishedAt" timestamptz(3), ADD COLUMN "deletingAt" timestamptz(3);
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_publication_retention_check" CHECK ("publishedAt" IS NULL OR "deletingAt" IS NULL);
CREATE INDEX "MediaAsset_state_uploadExpiresAt_idx" ON "MediaAsset" (state,"uploadExpiresAt");
COMMIT;
