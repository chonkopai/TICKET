ALTER TABLE "OrganizerProfile"
  ADD COLUMN "address" VARCHAR(300),
  ADD COLUMN "showContactInfo" BOOLEAN NOT NULL DEFAULT false;
