-- Existing Telegram users retain their UUIDs, roles, orders, and sessions.
-- Historical profile email/phone values deliberately receive no identity backfill.
ALTER TABLE "User"
  ALTER COLUMN "telegramId" DROP NOT NULL,
  ADD COLUMN "firstName" VARCHAR(100),
  ADD COLUMN "lastName" VARCHAR(100),
  ADD COLUMN "passwordHash" VARCHAR(255),
  ADD COLUMN "credentialVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TYPE "ContactMethod" AS ENUM ('email', 'phone');
CREATE TYPE "VerificationPurpose" AS ENUM ('register', 'link', 'password_reset', 'checkout_email');

CREATE TABLE "ContactIdentity" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "method" "ContactMethod" NOT NULL,
  "normalizedIdentifier" VARCHAR(320) NOT NULL,
  "verifiedAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactIdentity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContactIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ContactIdentity_method_normalizedIdentifier_key" ON "ContactIdentity"("method", "normalizedIdentifier");
CREATE UNIQUE INDEX "ContactIdentity_userId_method_key" ON "ContactIdentity"("userId", "method");
CREATE INDEX "ContactIdentity_userId_idx" ON "ContactIdentity"("userId");

CREATE TABLE "VerificationChallenge" (
  "id" UUID NOT NULL,
  "purpose" "VerificationPurpose" NOT NULL,
  "method" "ContactMethod" NOT NULL,
  "normalizedTarget" VARCHAR(320) NOT NULL,
  "userId" UUID,
  "sessionFamilyId" UUID,
  "secretVerifier" VARCHAR(64) NOT NULL,
  "generation" INTEGER NOT NULL DEFAULT 1,
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "sendCount" INTEGER NOT NULL DEFAULT 0,
  "lastSentAt" TIMESTAMPTZ(3),
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "VerificationChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VerificationChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VerificationChallenge_attempts_check" CHECK ("failedAttempts" >= 0 AND "generation" >= 1 AND "sendCount" >= 0)
);
CREATE INDEX "VerificationChallenge_purpose_method_normalizedTarget_consumedAt_expiresAt_idx" ON "VerificationChallenge"("purpose", "method", "normalizedTarget", "consumedAt", "expiresAt");
CREATE INDEX "VerificationChallenge_userId_purpose_consumedAt_idx" ON "VerificationChallenge"("userId", "purpose", "consumedAt");
CREATE INDEX "VerificationChallenge_expiresAt_idx" ON "VerificationChallenge"("expiresAt");
