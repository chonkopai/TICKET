CREATE TABLE "DraftTranslationCache" (
  key CHAR(64) PRIMARY KEY,
  "sourceLocale" VARCHAR(2) NOT NULL,
  "targetLocale" VARCHAR(2) NOT NULL,
  "sourceHash" CHAR(64) NOT NULL,
  text TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DraftTranslationCache_valid_pair" CHECK ("sourceLocale" IN ('ru','en','kk') AND "targetLocale" IN ('ru','en','kk') AND "sourceLocale"<>"targetLocale"),
  CONSTRAINT "DraftTranslationCache_valid_hashes" CHECK (key ~ '^[a-f0-9]{64}$' AND "sourceHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "DraftTranslationCache_valid_expiry" CHECK ("expiresAt">"createdAt")
);
CREATE INDEX "DraftTranslationCache_expiresAt_idx" ON "DraftTranslationCache"("expiresAt");
