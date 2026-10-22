ALTER TABLE "User" ADD COLUMN "defaultCountry" VARCHAR(2), ADD COLUMN "preferredCurrency" VARCHAR(3);
ALTER TYPE "EventCategory" ADD VALUE IF NOT EXISTS 'children';
ALTER TYPE "EventCategory" ADD VALUE IF NOT EXISTS 'adults';
ALTER TYPE "EventCategory" ADD VALUE IF NOT EXISTS 'cinema';
ALTER TYPE "EventCategory" ADD VALUE IF NOT EXISTS 'exhibitions';
ALTER TYPE "EventCategory" ADD VALUE IF NOT EXISTS 'excursions';
