CREATE TABLE "GoogleIdentity" (
  "subject" VARCHAR(255) PRIMARY KEY,
  "userId" UUID NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "email" VARCHAR(320) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "GoogleLoginProof" (
  "nonce" VARCHAR(64) PRIMARY KEY,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "GoogleLoginProof_expiresAt_idx" ON "GoogleLoginProof"("expiresAt");
