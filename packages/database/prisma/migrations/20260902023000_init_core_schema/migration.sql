-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('guest', 'organizer', 'admin');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('draft', 'published', 'cancelled', 'completed');

-- CreateEnum
CREATE TYPE "TicketTypeStatus" AS ENUM ('draft', 'active', 'paused', 'sold_out');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('created', 'pending_payment', 'paid', 'active', 'used', 'cancelled', 'refunded');

-- CreateEnum
CREATE TYPE "TableStatus" AS ENUM ('available', 'held', 'booked');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('pending', 'confirmed', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('ticket', 'table', 'deposit');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'failed', 'cancelled', 'refunded');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('telegram', 'push', 'sms');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'processing', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('draft', 'queued', 'sending', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "ChatSender" AS ENUM ('guest', 'organizer');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'guest',
    "name" TEXT NOT NULL,
    "photoUrl" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" UUID NOT NULL,
    "organizerId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "posterUrl" TEXT,
    "announcement" TEXT,
    "description" TEXT,
    "program" TEXT,
    "rules" TEXT,
    "visitTerms" TEXT,
    "cancellationTerms" TEXT,
    "depositEnabled" BOOLEAN NOT NULL DEFAULT false,
    "depositTerms" TEXT,
    "date" DATE NOT NULL,
    "time" TIME(0) NOT NULL,
    "venueName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketType" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "quantityTotal" INTEGER NOT NULL,
    "quantitySold" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "salesStartAt" TIMESTAMPTZ(3),
    "salesEndAt" TIMESTAMPTZ(3),
    "restrictions" TEXT,
    "status" "TicketTypeStatus" NOT NULL DEFAULT 'draft',

    CONSTRAINT "TicketType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" UUID NOT NULL,
    "ticketTypeId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "ownerUserId" UUID,
    "qrToken" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'created',
    "usedAt" TIMESTAMPTZ(3),
    "appleWalletPassId" TEXT,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenueLayout" (
    "id" UUID NOT NULL,
    "eventId" UUID,
    "organizerId" UUID,
    "layoutJson" JSONB NOT NULL,
    "templateName" TEXT NOT NULL,

    CONSTRAINT "VenueLayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Table" (
    "id" UUID NOT NULL,
    "venueLayoutId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT,
    "seats" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "deposit" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "description" TEXT,
    "status" "TableStatus" NOT NULL DEFAULT 'available',
    "holdToken" TEXT,
    "holdExpiresAt" TIMESTAMPTZ(3),

    CONSTRAINT "Table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" UUID NOT NULL,
    "tableId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "guestContact" JSONB,
    "status" "BookingStatus" NOT NULL DEFAULT 'pending',

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "type" "OrderType" NOT NULL,
    "buyerUserId" UUID,
    "guestContact" JSONB,
    "amount" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "paymentLink" TEXT,
    "paymentProviderId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPaymentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "rawWebhook" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deposit" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "terms" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "paidAt" TIMESTAMPTZ(3),

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "telegramId" BIGINT,
    "channel" "NotificationChannel" NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Broadcast" (
    "id" UUID NOT NULL,
    "organizerId" UUID NOT NULL,
    "eventId" UUID,
    "audience" JSONB NOT NULL,
    "message" TEXT NOT NULL,
    "imageUrl" TEXT,
    "status" "BroadcastStatus" NOT NULL DEFAULT 'draft',
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ(3),

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "organizerId" UUID NOT NULL,
    "guestUserId" UUID,
    "guestContact" JSONB,
    "sender" "ChatSender" NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMPTZ(3),

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "Event_organizerId_status_idx" ON "Event"("organizerId", "status");

-- CreateIndex
CREATE INDEX "Event_status_date_idx" ON "Event"("status", "date");

-- CreateIndex
CREATE INDEX "TicketType_eventId_status_idx" ON "TicketType"("eventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TicketType_eventId_name_key" ON "TicketType"("eventId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_qrToken_key" ON "Ticket"("qrToken");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_appleWalletPassId_key" ON "Ticket"("appleWalletPassId");

-- CreateIndex
CREATE INDEX "Ticket_ticketTypeId_status_idx" ON "Ticket"("ticketTypeId", "status");

-- CreateIndex
CREATE INDEX "Ticket_orderId_idx" ON "Ticket"("orderId");

-- CreateIndex
CREATE INDEX "Ticket_ownerUserId_status_idx" ON "Ticket"("ownerUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "VenueLayout_eventId_key" ON "VenueLayout"("eventId");

-- CreateIndex
CREATE INDEX "VenueLayout_organizerId_idx" ON "VenueLayout"("organizerId");

-- CreateIndex
CREATE UNIQUE INDEX "Table_holdToken_key" ON "Table"("holdToken");

-- CreateIndex
CREATE INDEX "Table_venueLayoutId_status_idx" ON "Table"("venueLayoutId", "status");

-- CreateIndex
CREATE INDEX "Table_holdExpiresAt_idx" ON "Table"("holdExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Table_venueLayoutId_number_key" ON "Table"("venueLayoutId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_orderId_key" ON "Booking"("orderId");

-- CreateIndex
CREATE INDEX "Booking_tableId_status_idx" ON "Booking"("tableId", "status");

-- CreateIndex
CREATE INDEX "Order_buyerUserId_createdAt_idx" ON "Order"("buyerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_paymentStatus_expiresAt_idx" ON "Order"("paymentStatus", "expiresAt");

-- CreateIndex
CREATE INDEX "Order_paymentProviderId_idx" ON "Order"("paymentProviderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "Payment"("providerPaymentId");

-- CreateIndex
CREATE INDEX "Payment_orderId_status_idx" ON "Payment"("orderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_orderId_key" ON "Deposit"("orderId");

-- CreateIndex
CREATE INDEX "Deposit_eventId_status_idx" ON "Deposit"("eventId", "status");

-- CreateIndex
CREATE INDEX "Notification_userId_status_idx" ON "Notification"("userId", "status");

-- CreateIndex
CREATE INDEX "Notification_telegramId_status_idx" ON "Notification"("telegramId", "status");

-- CreateIndex
CREATE INDEX "Notification_status_createdAt_idx" ON "Notification"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Broadcast_organizerId_status_idx" ON "Broadcast"("organizerId", "status");

-- CreateIndex
CREATE INDEX "Broadcast_eventId_idx" ON "Broadcast"("eventId");

-- CreateIndex
CREATE INDEX "ChatMessage_eventId_createdAt_idx" ON "ChatMessage"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_organizerId_readAt_idx" ON "ChatMessage"("organizerId", "readAt");

-- CreateIndex
CREATE INDEX "ChatMessage_guestUserId_readAt_idx" ON "ChatMessage"("guestUserId", "readAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketType" ADD CONSTRAINT "TicketType_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueLayout" ADD CONSTRAINT "VenueLayout_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueLayout" ADD CONSTRAINT "VenueLayout_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Table" ADD CONSTRAINT "Table_venueLayoutId_fkey" FOREIGN KEY ("venueLayoutId") REFERENCES "VenueLayout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_guestUserId_fkey" FOREIGN KEY ("guestUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Domain integrity checks not expressible in Prisma Schema Language
ALTER TABLE "VenueLayout"
  ADD CONSTRAINT "VenueLayout_exactly_one_owner_check"
  CHECK (num_nonnulls("eventId", "organizerId") = 1);

ALTER TABLE "TicketType"
  ADD CONSTRAINT "TicketType_inventory_check"
  CHECK (
    "price" >= 0
    AND "quantityTotal" >= 0
    AND "quantitySold" >= 0
    AND "quantitySold" <= "quantityTotal"
    AND ("salesStartAt" IS NULL OR "salesEndAt" IS NULL OR "salesStartAt" < "salesEndAt")
  );

ALTER TABLE "Table"
  ADD CONSTRAINT "Table_capacity_and_money_check"
  CHECK ("seats" > 0 AND "price" >= 0 AND "deposit" >= 0),
  ADD CONSTRAINT "Table_hold_fields_check"
  CHECK ("status" <> 'held' OR ("holdToken" IS NOT NULL AND "holdExpiresAt" IS NOT NULL));

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_amount_check"
  CHECK ("amount" >= 0);

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_amount_check"
  CHECK ("amount" >= 0);

ALTER TABLE "Deposit"
  ADD CONSTRAINT "Deposit_amount_check"
  CHECK ("amount" >= 0);

ALTER TABLE "Broadcast"
  ADD CONSTRAINT "Broadcast_recipient_count_check"
  CHECK ("recipientCount" >= 0);

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_target_check"
  CHECK ("userId" IS NOT NULL OR "telegramId" IS NOT NULL);

ALTER TABLE "ChatMessage"
  ADD CONSTRAINT "ChatMessage_guest_identity_check"
  CHECK ("guestUserId" IS NOT NULL OR "guestContact" IS NOT NULL);

-- Preserve booking history while allowing only one live booking per table.
CREATE UNIQUE INDEX "Booking_one_live_per_table_key"
  ON "Booking"("tableId")
  WHERE "status" IN ('pending', 'confirmed');
