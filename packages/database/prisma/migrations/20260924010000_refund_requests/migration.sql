CREATE TYPE "RefundStatus" AS ENUM ('requested', 'processing', 'succeeded', 'failed');

CREATE TABLE "RefundRequest" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "organizerId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRefundId" TEXT,
    "requestKey" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'requested',
    "lastError" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RefundRequest_orderId_key" ON "RefundRequest"("orderId");
CREATE UNIQUE INDEX "RefundRequest_requestKey_key" ON "RefundRequest"("requestKey");
CREATE INDEX "RefundRequest_status_createdAt_idx" ON "RefundRequest"("status", "createdAt");
CREATE INDEX "RefundRequest_organizerId_status_idx" ON "RefundRequest"("organizerId", "status");
CREATE INDEX "RefundRequest_paymentId_idx" ON "RefundRequest"("paymentId");

ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
