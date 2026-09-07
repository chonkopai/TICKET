CREATE TABLE "AnonymousCheckoutSession" (
  "id" UUID NOT NULL PRIMARY KEY,
  "sessionHash" TEXT NOT NULL UNIQUE,
  "accessHash" TEXT NOT NULL UNIQUE,
  "verificationHash" TEXT UNIQUE,
  "name" TEXT NOT NULL,
  "telegramId" BIGINT,
  "chatId" BIGINT,
  "deliveryMessageId" INTEGER,
  "deliveredAt" TIMESTAMPTZ(3),
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "accessExpiresAt" TIMESTAMPTZ(3) NOT NULL,
  "orderId" UUID UNIQUE REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "requestKey" TEXT,
  "requestHash" TEXT,
  "response" JSONB,
  "claimHash" TEXT UNIQUE,
  "claimExpiresAt" TIMESTAMPTZ(3),
  "claimedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AnonymousCheckoutSession_expiresAt_idx" ON "AnonymousCheckoutSession"("expiresAt");
CREATE UNIQUE INDEX "AnonymousCheckoutSession_id_requestKey_key" ON "AnonymousCheckoutSession"("id", "requestKey");
