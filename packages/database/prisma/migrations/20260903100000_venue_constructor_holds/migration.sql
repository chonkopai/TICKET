/*
  Warnings:

  - Added the required column `updatedAt` to the `Table` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `VenueLayout` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TableHoldStatus" AS ENUM ('active', 'released', 'expired', 'confirmed');

-- AlterEnum
ALTER TYPE "TableStatus" ADD VALUE 'unavailable';

-- AlterTable
ALTER TABLE "Table" ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "holdRequestKey" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Ticket" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TicketType" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "VenueLayout" ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "TableHold" (
    "id" UUID NOT NULL,
    "tableId" UUID NOT NULL,
    "requestKey" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "TableHoldStatus" NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TableHold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TableHold_token_key" ON "TableHold"("token");

-- CreateIndex
CREATE INDEX "TableHold_status_expiresAt_idx" ON "TableHold"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TableHold_tableId_requestKey_key" ON "TableHold"("tableId", "requestKey");

-- PostgreSQL remains authoritative even if application processes restart or an optional cache is down.
CREATE UNIQUE INDEX "TableHold_one_active_per_table_key"
ON "TableHold"("tableId") WHERE "status" = 'active';

ALTER TABLE "Table"
DROP CONSTRAINT "Table_hold_fields_check",
ADD CONSTRAINT "Table_hold_fields_check" CHECK (
  (
    "status" = 'held'
    AND "holdToken" IS NOT NULL
    AND "holdRequestKey" IS NOT NULL
    AND "holdExpiresAt" IS NOT NULL
  ) OR (
    "status" <> 'held'
    AND "holdToken" IS NULL
    AND "holdRequestKey" IS NULL
    AND "holdExpiresAt" IS NULL
  )
);

ALTER TABLE "TableHold"
ADD CONSTRAINT "TableHold_request_key_check" CHECK (char_length("requestKey") BETWEEN 8 AND 128),
ADD CONSTRAINT "TableHold_expiry_check" CHECK ("expiresAt" > "createdAt");

-- AddForeignKey
ALTER TABLE "TableHold" ADD CONSTRAINT "TableHold_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;
