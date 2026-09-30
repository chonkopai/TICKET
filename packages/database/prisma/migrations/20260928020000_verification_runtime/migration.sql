CREATE TABLE "VerificationGrant" (
  "id" UUID NOT NULL,
  "challengeId" UUID NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL,
  "purpose" "VerificationPurpose" NOT NULL,
  "method" "ContactMethod" NOT NULL,
  "normalizedTarget" VARCHAR(320) NOT NULL,
  "userId" UUID,
  "sessionFamilyId" UUID,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerificationGrant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VerificationGrant_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "VerificationChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VerificationGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "VerificationGrant_challengeId_key" ON "VerificationGrant"("challengeId");
CREATE UNIQUE INDEX "VerificationGrant_tokenHash_key" ON "VerificationGrant"("tokenHash");
CREATE INDEX "VerificationGrant_expiresAt_idx" ON "VerificationGrant"("expiresAt");
CREATE INDEX "VerificationGrant_userId_purpose_consumedAt_idx" ON "VerificationGrant"("userId", "purpose", "consumedAt");

CREATE TABLE "VerificationRateLimit" (
  "scopeKey" VARCHAR(80) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "windowEnd" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "VerificationRateLimit_pkey" PRIMARY KEY ("scopeKey"),
  CONSTRAINT "VerificationRateLimit_count_check" CHECK ("count" >= 0)
);
CREATE INDEX "VerificationRateLimit_windowEnd_idx" ON "VerificationRateLimit"("windowEnd");
