-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('support', 'moderator');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "blockedAt" TIMESTAMPTZ(3),
ADD COLUMN     "blockedReason" VARCHAR(500),
ADD COLUMN     "commissionBps" INTEGER,
ADD COLUMN     "organizerVerifiedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "moderationReason" VARCHAR(500),
ADD COLUMN     "moderationStatus" VARCHAR(20) NOT NULL DEFAULT 'clear';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "commissionAmount" INTEGER,
ADD COLUMN     "commissionBps" INTEGER;

-- CreateTable
CREATE TABLE "StaffAccount" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "role" "StaffRole" NOT NULL,
    "passwordHash" TEXT,
    "mfaSecret" TEXT,
    "mfaConfirmedAt" TIMESTAMPTZ(3),
    "mfaLastStep" INTEGER NOT NULL DEFAULT -1,
    "recoveryHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "disabledAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffSession" (
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfHash" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "authenticated" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffToken" (
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" VARCHAR(20) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffAudit" (
    "id" UUID NOT NULL,
    "staffId" UUID,
    "role" VARCHAR(20) NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "targetType" VARCHAR(40) NOT NULL,
    "targetId" VARCHAR(200) NOT NULL,
    "caseId" UUID,
    "reason" VARCHAR(500),
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformCase" (
    "id" UUID NOT NULL,
    "ownerId" UUID,
    "anonymousSessionId" UUID,
    "subject" VARCHAR(160) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'new',
    "assignedStaffId" UUID,
    "eventId" UUID,
    "orderId" UUID,
    "ticketId" UUID,
    "ownerReadAt" TIMESTAMPTZ(3),
    "staffReadAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PlatformCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformMessage" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "clientKey" UUID NOT NULL,
    "authorKind" VARCHAR(20) NOT NULL,
    "staffId" UUID,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "text" VARCHAR(4000) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizerVerification" (
    "id" UUID NOT NULL,
    "organizerId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'pending',
    "legalName" VARCHAR(200) NOT NULL,
    "entityType" VARCHAR(20) NOT NULL,
    "countryCode" VARCHAR(2) NOT NULL,
    "registrationId" VARCHAR(120) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "phone" VARCHAR(40) NOT NULL,
    "caseId" UUID NOT NULL,
    "reviewedBy" UUID,
    "reviewReason" VARCHAR(500),
    "reviewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizerVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivateUpload" (
    "id" UUID NOT NULL,
    "ownerId" UUID,
    "anonymousSessionId" UUID,
    "staffId" UUID,
    "name" VARCHAR(150) NOT NULL,
    "mime" VARCHAR(80) NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "caseId" UUID,
    "messageId" UUID,
    "verificationId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrivateUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffOperation" (
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "key" UUID NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "resourceId" UUID NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "response" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffRefund" (
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "requestKey" UUID NOT NULL,
    "ticketIds" TEXT[],
    "amount" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "exceptional" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT NOT NULL,
    "providerRefundId" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'requested',
    "lastError" VARCHAR(200),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizerPayout" (
    "id" UUID NOT NULL,
    "organizerId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "reference" VARCHAR(120) NOT NULL,
    "paidAt" TIMESTAMPTZ(3) NOT NULL,
    "testOnly" BOOLEAN NOT NULL DEFAULT false,
    "reversedAt" TIMESTAMPTZ(3),
    "reversalReason" VARCHAR(500),
    "requestKey" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizerPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "StaffRateBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StaffRateBucket_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffAccount_email_key" ON "StaffAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "StaffSession_tokenHash_key" ON "StaffSession"("tokenHash");

-- CreateIndex
CREATE INDEX "StaffSession_staffId_expiresAt_idx" ON "StaffSession"("staffId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StaffToken_tokenHash_key" ON "StaffToken"("tokenHash");

-- CreateIndex
CREATE INDEX "StaffAudit_createdAt_id_idx" ON "StaffAudit"("createdAt", "id");

-- CreateIndex
CREATE INDEX "StaffAudit_targetType_targetId_createdAt_idx" ON "StaffAudit"("targetType", "targetId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformCase_ownerId_updatedAt_idx" ON "PlatformCase"("ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "PlatformCase_anonymousSessionId_updatedAt_idx" ON "PlatformCase"("anonymousSessionId", "updatedAt");

-- CreateIndex
CREATE INDEX "PlatformCase_status_assignedStaffId_updatedAt_idx" ON "PlatformCase"("status", "assignedStaffId", "updatedAt");

-- CreateIndex
CREATE INDEX "PlatformMessage_caseId_createdAt_id_idx" ON "PlatformMessage"("caseId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformMessage_caseId_clientKey_key" ON "PlatformMessage"("caseId", "clientKey");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizerVerification_caseId_key" ON "OrganizerVerification"("caseId");

-- CreateIndex
CREATE INDEX "OrganizerVerification_status_createdAt_idx" ON "OrganizerVerification"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizerVerification_organizerId_version_key" ON "OrganizerVerification"("organizerId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PrivateUpload_storageKey_key" ON "PrivateUpload"("storageKey");

-- CreateIndex
CREATE INDEX "PrivateUpload_ownerId_createdAt_idx" ON "PrivateUpload"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "StaffOperation_resourceId_kind_createdAt_idx" ON "StaffOperation"("resourceId", "kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StaffOperation_kind_key_key" ON "StaffOperation"("kind", "key");

-- CreateIndex
CREATE UNIQUE INDEX "StaffRefund_requestKey_key" ON "StaffRefund"("requestKey");

-- CreateIndex
CREATE INDEX "StaffRefund_orderId_status_idx" ON "StaffRefund"("orderId", "status");

-- CreateIndex
CREATE INDEX "StaffRefund_status_createdAt_idx" ON "StaffRefund"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizerPayout_requestKey_key" ON "OrganizerPayout"("requestKey");

-- CreateIndex
CREATE INDEX "OrganizerPayout_organizerId_currency_paidAt_idx" ON "OrganizerPayout"("organizerId", "currency", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizerPayout_organizerId_currency_reference_key" ON "OrganizerPayout"("organizerId", "currency", "reference");

-- AddForeignKey
ALTER TABLE "StaffSession" ADD CONSTRAINT "StaffSession_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffToken" ADD CONSTRAINT "StaffToken_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAudit" ADD CONSTRAINT "StaffAudit_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformMessage" ADD CONSTRAINT "PlatformMessage_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "PlatformCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateUpload" ADD CONSTRAINT "PrivateUpload_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "PlatformMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateUpload" ADD CONSTRAINT "PrivateUpload_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "OrganizerVerification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database invariants for staff access, support ownership, and financial history.
ALTER TABLE "StaffAccount" ADD CONSTRAINT "staff_email_normalized" CHECK (email = lower(trim(email))), ADD CONSTRAINT "staff_recovery_limit" CHECK (cardinality("recoveryHashes") <= 12);
ALTER TABLE "PlatformCase" ADD CONSTRAINT "case_participant" CHECK (num_nonnulls("ownerId", "anonymousSessionId") = 1), ADD CONSTRAINT "case_status" CHECK (status IN ('new','in_progress','closed'));
ALTER TABLE "PlatformCase" ADD FOREIGN KEY ("ownerId") REFERENCES "User"(id), ADD FOREIGN KEY ("anonymousSessionId") REFERENCES "AnonymousCheckoutSession"(id), ADD FOREIGN KEY ("assignedStaffId") REFERENCES "StaffAccount"(id), ADD FOREIGN KEY ("orderId") REFERENCES "Order"(id), ADD FOREIGN KEY ("eventId") REFERENCES "Event"(id), ADD FOREIGN KEY ("ticketId") REFERENCES "Ticket"(id);
ALTER TABLE "PlatformMessage" ADD CONSTRAINT "message_author" CHECK (("authorKind" IN ('support','moderator') AND "staffId" IS NOT NULL) OR ("authorKind" IN ('customer','organizer') AND "staffId" IS NULL AND NOT internal)), ADD FOREIGN KEY ("staffId") REFERENCES "StaffAccount"(id);
ALTER TABLE "OrganizerVerification" ADD FOREIGN KEY ("organizerId") REFERENCES "User"(id), ADD FOREIGN KEY ("caseId") REFERENCES "PlatformCase"(id), ADD FOREIGN KEY ("reviewedBy") REFERENCES "StaffAccount"(id), ADD CONSTRAINT "verification_status" CHECK (status IN ('pending','changes_requested','verified','rejected','revoked'));
CREATE UNIQUE INDEX "verification_one_pending" ON "OrganizerVerification" ("organizerId") WHERE status = 'pending';
ALTER TABLE "PrivateUpload" ADD CONSTRAINT "upload_actor" CHECK (num_nonnulls("ownerId","anonymousSessionId","staffId") = 1), ADD CONSTRAINT "upload_size" CHECK (size > 0 AND size <= 10485760), ADD FOREIGN KEY ("caseId") REFERENCES "PlatformCase"(id);
ALTER TABLE "StaffRefund" ADD FOREIGN KEY ("orderId") REFERENCES "Order"(id), ADD FOREIGN KEY ("paymentId") REFERENCES "Payment"(id), ADD FOREIGN KEY ("staffId") REFERENCES "StaffAccount"(id), ADD CONSTRAINT "staff_refund_amount" CHECK (amount > 0);
ALTER TABLE "OrganizerPayout" ADD FOREIGN KEY ("organizerId") REFERENCES "User"(id), ADD FOREIGN KEY ("staffId") REFERENCES "StaffAccount"(id), ADD CONSTRAINT "payout_positive" CHECK (amount > 0);
ALTER TABLE "User" ADD CONSTRAINT "organizer_commission_range" CHECK ("commissionBps" BETWEEN 0 AND 10000);
ALTER TABLE "Order" ADD CONSTRAINT "order_commission_range" CHECK ("commissionBps" BETWEEN 0 AND 10000 AND "commissionAmount" BETWEEN 0 AND amount);
CREATE FUNCTION protect_staff_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Staff audit entries are append-only'; END $$;
CREATE TRIGGER staff_audit_immutable BEFORE UPDATE OR DELETE ON "StaffAudit" FOR EACH ROW EXECUTE FUNCTION protect_staff_audit();
