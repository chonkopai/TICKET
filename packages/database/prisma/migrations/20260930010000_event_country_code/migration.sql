ALTER TABLE "Event" ADD COLUMN "countryCode" VARCHAR(2) NOT NULL DEFAULT 'KZ';

CREATE INDEX "Event_status_countryCode_city_idx" ON "Event"("status", "countryCode", "city");
