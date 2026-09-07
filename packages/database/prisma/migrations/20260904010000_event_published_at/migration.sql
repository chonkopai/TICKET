ALTER TABLE "Event" ADD COLUMN "publishedAt" TIMESTAMPTZ(3);

UPDATE "Event"
SET "publishedAt" = "updatedAt"
WHERE "status" = 'published' AND "publishedAt" IS NULL;

CREATE INDEX "Event_status_publishedAt_idx" ON "Event"("status", "publishedAt");
