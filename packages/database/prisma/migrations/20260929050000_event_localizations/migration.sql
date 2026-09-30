ALTER TABLE "Event" ADD COLUMN "sourceLocale" VARCHAR(2) NOT NULL DEFAULT 'ru';

CREATE TABLE "EventTranslation" (
    "eventId" UUID NOT NULL,
    "locale" VARCHAR(2) NOT NULL,
    "title" TEXT NOT NULL,
    "venueName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "announcement" TEXT,
    "description" TEXT,
    "program" TEXT,
    "rules" TEXT,
    "visitTerms" TEXT,
    "cancellationTerms" TEXT,
    "depositTerms" TEXT,
    "extraConditions" TEXT,
    "origin" VARCHAR(16) NOT NULL DEFAULT 'manual',
    "translatedFrom" VARCHAR(2),
    "sourceHash" VARCHAR(64),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "EventTranslation_pkey" PRIMARY KEY ("eventId", "locale")
);

CREATE INDEX "EventTranslation_locale_title_idx" ON "EventTranslation"("locale", "title");
ALTER TABLE "EventTranslation" ADD CONSTRAINT "EventTranslation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
