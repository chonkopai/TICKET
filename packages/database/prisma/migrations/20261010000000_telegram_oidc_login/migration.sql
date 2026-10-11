CREATE TABLE "TelegramLoginAttempt" (
    "id" UUID NOT NULL,
    "stateHash" VARCHAR(64) NOT NULL,
    "browserProofHash" VARCHAR(64) NOT NULL,
    "nonce" VARCHAR(64) NOT NULL,
    "codeVerifier" VARCHAR(128) NOT NULL,
    "redirectUri" VARCHAR(2048) NOT NULL,
    "returnTo" VARCHAR(2048) NOT NULL,
    "locale" VARCHAR(2) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "claimedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelegramLoginAttempt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TelegramLoginAttempt_stateHash_key" ON "TelegramLoginAttempt"("stateHash");
CREATE INDEX "TelegramLoginAttempt_expiresAt_idx" ON "TelegramLoginAttempt"("expiresAt");
