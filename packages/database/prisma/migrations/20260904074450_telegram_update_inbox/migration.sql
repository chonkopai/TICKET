-- CreateEnum
CREATE TYPE "TelegramUpdateStatus" AS ENUM ('processing', 'completed', 'failed');

-- CreateTable
CREATE TABLE "TelegramUpdate" (
    "id" UUID NOT NULL,
    "botId" TEXT NOT NULL,
    "updateId" BIGINT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" "TelegramUpdateStatus" NOT NULL DEFAULT 'processing',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "leaseUntil" TIMESTAMPTZ(3),
    "processedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelegramUpdate_status_leaseUntil_idx" ON "TelegramUpdate"("status", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramUpdate_botId_updateId_key" ON "TelegramUpdate"("botId", "updateId");
