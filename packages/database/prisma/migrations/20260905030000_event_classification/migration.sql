CREATE TYPE "EventCategory" AS ENUM ('music', 'nightlife', 'festival', 'comedy', 'theatre', 'business', 'education', 'workshop', 'sport', 'family', 'food', 'other');

ALTER TABLE "Event"
  ADD COLUMN "category" "EventCategory" NOT NULL DEFAULT 'other',
  ADD COLUMN "city" TEXT NOT NULL DEFAULT 'Алматы';

CREATE INDEX "Event_status_category_city_idx" ON "Event"("status", "category", "city");
