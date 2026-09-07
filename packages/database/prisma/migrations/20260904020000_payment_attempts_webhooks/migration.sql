-- Payment attempts are provider-scoped. Existing Payment rows are empty in the
-- development database, so the request key can be made authoritative here.
CREATE TYPE "WebhookEventStatus" AS ENUM ('processing', 'processed', 'ignored');

DROP INDEX "Payment_providerPaymentId_key";

ALTER TABLE "Payment"
  ADD COLUMN "payloadHash" TEXT,
  ADD COLUMN "paymentLink" TEXT,
  ADD COLUMN "providerRequestKey" TEXT,
  ADD COLUMN "webhookReceivedAt" TIMESTAMPTZ(3),
  ALTER COLUMN "providerPaymentId" DROP NOT NULL;

UPDATE "Payment"
SET "providerRequestKey" = 'legacy:' || "id"::text
WHERE "providerRequestKey" IS NULL;

ALTER TABLE "Payment" ALTER COLUMN "providerRequestKey" SET NOT NULL;

CREATE TABLE "WebhookEvent" (
  "id" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "paymentId" UUID,
  "orderId" UUID,
  "eventType" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "status" "WebhookEventStatus" NOT NULL DEFAULT 'processing',
  "metadata" JSONB,
  "processedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebhookEvent_paymentId_idx" ON "WebhookEvent"("paymentId");
CREATE INDEX "WebhookEvent_orderId_createdAt_idx" ON "WebhookEvent"("orderId", "createdAt");
CREATE UNIQUE INDEX "WebhookEvent_provider_providerEventId_key" ON "WebhookEvent"("provider", "providerEventId");
CREATE INDEX "Payment_provider_providerPaymentId_idx" ON "Payment"("provider", "providerPaymentId");
CREATE UNIQUE INDEX "Payment_provider_providerRequestKey_key" ON "Payment"("provider", "providerRequestKey");
CREATE UNIQUE INDEX "Payment_provider_providerPaymentId_key" ON "Payment"("provider", "providerPaymentId");

ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
