-- Additive only. Abort rather than wait indefinitely for a busy legacy table.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
-- CreateEnum
CREATE TYPE "EventSaleMode" AS ENUM ('free', 'paid_general', 'paid_seated');

-- CreateEnum
CREATE TYPE "EventV2State" AS ENUM ('legacy', 'reconciled', 'review', 'dirty');

-- CreateEnum
CREATE TYPE "EventDraftState" AS ENUM ('active', 'claimed', 'publishing', 'published', 'deleted', 'expired');

-- CreateEnum
CREATE TYPE "MediaAssetKind" AS ENUM ('image', 'video', 'unknown');

-- CreateEnum
CREATE TYPE "MediaAssetState" AS ENUM ('uploading', 'processing', 'ready', 'failed', 'legacy');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "currency" CHAR(3),
ADD COLUMN     "endsAt" TIMESTAMPTZ(3),
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "legacyFingerprint" VARCHAR(64),
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "refundPolicyRevision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "refundsAvailable" BOOLEAN,
ADD COLUMN     "reviewReasons" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "saleMode" "EventSaleMode",
ADD COLUMN     "startsAt" TIMESTAMPTZ(3),
ADD COLUMN     "v2State" "EventV2State" NOT NULL DEFAULT 'legacy';

-- AlterTable
ALTER TABLE "TicketType" ADD COLUMN     "tariffId" UUID;

-- AlterTable
ALTER TABLE "Table" ADD COLUMN     "tariffId" UUID;

-- AlterTable
ALTER TABLE "VenueRow" ADD COLUMN     "tariffId" UUID;

-- CreateTable
CREATE TABLE "EventContent" (
    "eventId" UUID NOT NULL,
    "locale" VARCHAR(2) NOT NULL,
    "title" TEXT,
    "summary" TEXT,
    "description" TEXT,
    "venueName" TEXT,
    "address" TEXT,
    "refundConditions" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "fieldMetadata" JSONB NOT NULL DEFAULT '{}',
    "managedBy" VARCHAR(16) NOT NULL DEFAULT 'editor',
    "legacyHash" VARCHAR(64),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EventContent_pkey" PRIMARY KEY ("eventId","locale")
);

-- CreateTable
CREATE TABLE "TicketTypeContent" (
    "ticketTypeId" UUID NOT NULL,
    "locale" VARCHAR(2) NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "fieldMetadata" JSONB NOT NULL DEFAULT '{}',
    "managedBy" VARCHAR(16) NOT NULL DEFAULT 'editor',
    "legacyHash" VARCHAR(64),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TicketTypeContent_pkey" PRIMARY KEY ("ticketTypeId","locale")
);

-- CreateTable
CREATE TABLE "TableContent" (
    "tableId" UUID NOT NULL,
    "locale" VARCHAR(2) NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "fieldMetadata" JSONB NOT NULL DEFAULT '{}',
    "managedBy" VARCHAR(16) NOT NULL DEFAULT 'editor',
    "legacyHash" VARCHAR(64),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TableContent_pkey" PRIMARY KEY ("tableId","locale")
);

-- CreateTable
CREATE TABLE "VenueRowContent" (
    "rowId" UUID NOT NULL,
    "locale" VARCHAR(2) NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "fieldMetadata" JSONB NOT NULL DEFAULT '{}',
    "managedBy" VARCHAR(16) NOT NULL DEFAULT 'editor',
    "legacyHash" VARCHAR(64),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "VenueRowContent_pkey" PRIMARY KEY ("rowId","locale")
);

-- CreateTable
CREATE TABLE "HallTariff" (
    "id" UUID NOT NULL,
    "venueLayoutId" UUID NOT NULL,
    "price" INTEGER,
    "currency" CHAR(3),
    "managedBy" VARCHAR(16) NOT NULL DEFAULT 'editor',
    "legacyHash" VARCHAR(64),

    CONSTRAINT "HallTariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HallTariffContent" (
    "tariffId" UUID NOT NULL,
    "locale" VARCHAR(2) NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "fieldMetadata" JSONB NOT NULL DEFAULT '{}',
    "managedBy" VARCHAR(16) NOT NULL DEFAULT 'editor',
    "legacyHash" VARCHAR(64),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HallTariffContent_pkey" PRIMARY KEY ("tariffId","locale")
);

-- CreateTable
CREATE TABLE "EventCreationDraft" (
    "id" UUID NOT NULL,
    "ownerId" UUID,
    "capabilityHash" VARCHAR(64),
    "capabilityExpiresAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "state" "EventDraftState" NOT NULL DEFAULT 'active',
    "aggregate" JSONB NOT NULL,
    "resultEventId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EventCreationDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventPublishIntent" (
    "id" UUID NOT NULL,
    "draftId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "aggregateHash" VARCHAR(64) NOT NULL,
    "browserHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "resultEventId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventPublishIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "draftId" UUID,
    "eventId" UUID,
    "kind" "MediaAssetKind" NOT NULL,
    "state" "MediaAssetState" NOT NULL DEFAULT 'uploading',
    "storageKey" TEXT,
    "contentType" TEXT,
    "bytes" BIGINT,
    "width" INTEGER,
    "height" INTEGER,
    "durationSeconds" DOUBLE PRECISION,
    "checksum" VARCHAR(64),
    "derivatives" JSONB NOT NULL DEFAULT '{}',
    "legacyReference" TEXT,
    "errorCode" VARCHAR(80),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAssetContent" (
    "assetId" UUID NOT NULL,
    "locale" VARCHAR(2) NOT NULL,
    "caption" TEXT,
    "fieldMetadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "MediaAssetContent_pkey" PRIMARY KEY ("assetId","locale")
);

-- CreateTable
CREATE TABLE "EventMedia" (
    "eventId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "slot" INTEGER NOT NULL,
    "galleryVisible" BOOLEAN NOT NULL DEFAULT true,
    "isCard" BOOLEAN NOT NULL DEFAULT false,
    "isBackground" BOOLEAN NOT NULL DEFAULT false,
    "crops" JSONB NOT NULL DEFAULT '{}',
    "managedBy" VARCHAR(16) NOT NULL DEFAULT 'editor',

    CONSTRAINT "EventMedia_pkey" PRIMARY KEY ("eventId","assetId")
);

-- CreateTable
CREATE TABLE "LegacyEventSnapshot" (
    "eventId" UUID NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "original" JSONB NOT NULL,
    "capturedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyEventSnapshot_pkey" PRIMARY KEY ("eventId","fingerprint")
);

-- CreateTable
CREATE TABLE "EventBackfillCheckpoint" (
    "key" VARCHAR(120) NOT NULL,
    "version" INTEGER NOT NULL,
    "cursor" UUID,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EventBackfillCheckpoint_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "EventContent_locale_title_idx" ON "EventContent"("locale", "title");

-- CreateIndex
CREATE INDEX "HallTariff_venueLayoutId_idx" ON "HallTariff"("venueLayoutId");

-- CreateIndex
CREATE UNIQUE INDEX "EventCreationDraft_capabilityHash_key" ON "EventCreationDraft"("capabilityHash");

-- CreateIndex
CREATE UNIQUE INDEX "EventCreationDraft_resultEventId_key" ON "EventCreationDraft"("resultEventId");

-- CreateIndex
CREATE INDEX "EventCreationDraft_state_expiresAt_idx" ON "EventCreationDraft"("state", "expiresAt");

-- CreateIndex
CREATE INDEX "EventCreationDraft_ownerId_updatedAt_idx" ON "EventCreationDraft"("ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "EventPublishIntent_expiresAt_idx" ON "EventPublishIntent"("expiresAt");

-- CreateIndex
CREATE INDEX "EventPublishIntent_resultEventId_idx" ON "EventPublishIntent"("resultEventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventPublishIntent_draftId_revision_key" ON "EventPublishIntent"("draftId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");

-- CreateIndex
CREATE INDEX "MediaAsset_draftId_state_idx" ON "MediaAsset"("draftId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_id_eventId_key" ON "MediaAsset"("id", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_eventId_legacyReference_key" ON "MediaAsset"("eventId", "legacyReference");

-- CreateIndex
CREATE UNIQUE INDEX "EventMedia_eventId_slot_key" ON "EventMedia"("eventId", "slot");

-- AddForeignKey
ALTER TABLE "TicketType" ADD CONSTRAINT "TicketType_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "HallTariff"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "Table" ADD CONSTRAINT "Table_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "HallTariff"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "VenueRow" ADD CONSTRAINT "VenueRow_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "HallTariff"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "EventContent" ADD CONSTRAINT "EventContent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTypeContent" ADD CONSTRAINT "TicketTypeContent_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableContent" ADD CONSTRAINT "TableContent_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueRowContent" ADD CONSTRAINT "VenueRowContent_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "VenueRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HallTariff" ADD CONSTRAINT "HallTariff_venueLayoutId_fkey" FOREIGN KEY ("venueLayoutId") REFERENCES "VenueLayout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HallTariffContent" ADD CONSTRAINT "HallTariffContent_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "HallTariff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCreationDraft" ADD CONSTRAINT "EventCreationDraft_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCreationDraft" ADD CONSTRAINT "EventCreationDraft_resultEventId_fkey" FOREIGN KEY ("resultEventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPublishIntent" ADD CONSTRAINT "EventPublishIntent_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "EventCreationDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPublishIntent" ADD CONSTRAINT "EventPublishIntent_resultEventId_fkey" FOREIGN KEY ("resultEventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "EventCreationDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAssetContent" ADD CONSTRAINT "MediaAssetContent_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventMedia" ADD CONSTRAINT "EventMedia_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventMedia" ADD CONSTRAINT "EventMedia_assetId_eventId_fkey" FOREIGN KEY ("assetId", "eventId") REFERENCES "MediaAsset"("id", "eventId") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- SQL invariants not expressible in Prisma; overlength legacy text stays intact.
ALTER TABLE "Event" ADD CONSTRAINT "Event_v2_values_check" CHECK (
  "revision" > 0 AND "refundPolicyRevision" >= 0
  AND ("currency" IS NULL OR "currency" ~ '^[A-Z]{3}$')
  AND ("endsAt" IS NULL OR ("startsAt" IS NOT NULL AND "endsAt" > "startsAt"))
  AND (("latitude" IS NULL AND "longitude" IS NULL) OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180))
  AND jsonb_typeof("reviewReasons") = 'array'
  AND ("v2State" <> 'reconciled' OR ("saleMode" IS NOT NULL AND "currency" IS NOT NULL AND "startsAt" IS NOT NULL AND "endsAt" IS NOT NULL AND "refundsAvailable" IS NOT NULL AND "refundPolicyRevision" > 0))
) NOT VALID;

DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['EventContent','TicketTypeContent','TableContent','VenueRowContent','HallTariffContent'] LOOP
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (locale IN (''ru'',''en'',''kk'') AND revision > 0 AND "managedBy" IN (''editor'',''legacy'') AND jsonb_typeof("fieldMetadata") = ''object'')',tab,tab||'_locale_metadata_check');
  END LOOP;
END $$;
ALTER TABLE "MediaAssetContent" ADD CONSTRAINT "MediaAssetContent_locale_check" CHECK (locale IN ('ru','en','kk'));
ALTER TABLE "HallTariff" ADD CONSTRAINT "HallTariff_money_check" CHECK ((price IS NULL OR price >= 0) AND (currency IS NULL OR currency ~ '^[A-Z]{3}$') AND "managedBy" IN ('editor','legacy'));
ALTER TABLE "EventCreationDraft" ADD CONSTRAINT "EventCreationDraft_state_check" CHECK (
  revision > 0 AND "expiresAt" > "createdAt" AND jsonb_typeof(aggregate)='object' AND aggregate ? 'version' AND aggregate->>'version'='2'
  AND ("capabilityHash" IS NULL OR ("capabilityHash" ~ '^[a-f0-9]{64}$' AND "capabilityExpiresAt" IS NOT NULL AND "capabilityExpiresAt" > "createdAt" AND "capabilityExpiresAt" <= "expiresAt"))
  AND ("ownerId" IS NOT NULL OR "capabilityHash" IS NOT NULL OR state IN ('published','deleted','expired'))
  AND (state <> 'claimed' OR ("ownerId" IS NOT NULL AND "capabilityHash" IS NULL))
  AND ((state='published') = ("resultEventId" IS NOT NULL))
);
ALTER TABLE "EventPublishIntent" ADD CONSTRAINT "EventPublishIntent_consumption_check" CHECK (
  revision > 0 AND "aggregateHash" ~ '^[a-f0-9]{64}$' AND "browserHash" ~ '^[a-f0-9]{64}$' AND "expiresAt" > "createdAt"
  AND (("consumedAt" IS NULL) = ("resultEventId" IS NULL))
);
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_ready_check" CHECK (
  (bytes IS NULL OR bytes > 0) AND (width IS NULL OR width > 0) AND (height IS NULL OR height > 0)
  AND ("durationSeconds" IS NULL OR ("durationSeconds" > 0 AND "durationSeconds" < 'Infinity'::float8))
  AND (state <> 'ready' OR (kind <> 'unknown' AND "storageKey" IS NOT NULL AND checksum IS NOT NULL AND "contentType" IS NOT NULL AND checksum ~ '^[a-f0-9]{64}$'
    AND bytes IS NOT NULL AND width IS NOT NULL AND height IS NOT NULL
    AND ((kind='image' AND "contentType" IN ('image/jpeg','image/png','image/webp')) OR (kind='video' AND "contentType" IN ('video/mp4','video/webm') AND "durationSeconds" IS NOT NULL))))
);
ALTER TABLE "EventMedia" ADD CONSTRAINT "EventMedia_slot_check" CHECK (slot BETWEEN 0 AND 4);
CREATE UNIQUE INDEX "EventMedia_one_card" ON "EventMedia"("eventId") WHERE "isCard";
CREATE UNIQUE INDEX "EventMedia_one_background" ON "EventMedia"("eventId") WHERE "isBackground";

-- Legacy writes (including older binaries) explicitly invalidate compatibility reads.
CREATE FUNCTION event_v2_legacy_event_dirty() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF ROW(NEW."sourceLocale",NEW.title,NEW.announcement,NEW.description,NEW.program,NEW.rules,NEW."visitTerms",NEW."cancellationTerms",NEW."extraConditions",NEW."depositTerms",NEW."paymentMode",NEW."posterUrl",NEW."galleryUrls",NEW.date,NEW.time,NEW.timezone,NEW."venueName",NEW.address,NEW.city,NEW.category,NEW."countryCode",NEW."ageRestriction",NEW."showFullAmountForDeposit")
    IS DISTINCT FROM ROW(OLD."sourceLocale",OLD.title,OLD.announcement,OLD.description,OLD.program,OLD.rules,OLD."visitTerms",OLD."cancellationTerms",OLD."extraConditions",OLD."depositTerms",OLD."paymentMode",OLD."posterUrl",OLD."galleryUrls",OLD.date,OLD.time,OLD.timezone,OLD."venueName",OLD.address,OLD.city,OLD.category,OLD."countryCode",OLD."ageRestriction",OLD."showFullAmountForDeposit") THEN
    NEW."v2State":='dirty'; NEW."legacyFingerprint":=NULL; NEW.revision:=OLD.revision+1;
  END IF; RETURN NEW;
END $$;
CREATE TRIGGER "Event_v2_legacy_dirty" BEFORE UPDATE ON "Event" FOR EACH ROW EXECUTE FUNCTION event_v2_legacy_event_dirty();
CREATE FUNCTION event_v2_resource_dirty() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE data jsonb; eid uuid; BEGIN
  data:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  IF TG_TABLE_NAME IN ('TicketType','EventTranslation') THEN eid:=(data->>'eventId')::uuid;
  ELSIF TG_TABLE_NAME='VenueLayout' THEN eid:=(data->>'eventId')::uuid;
  ELSE SELECT "eventId" INTO eid FROM "VenueLayout" WHERE id=(data->>'venueLayoutId')::uuid;
  END IF;
  UPDATE "Event" SET "v2State"='dirty',"legacyFingerprint"=NULL,revision=revision+1 WHERE id=eid;
  RETURN NULL;
END $$;
CREATE TRIGGER "TicketType_v2_dirty" AFTER INSERT OR DELETE OR UPDATE OF name,description,price,deposit,currency,"quantityTotal",status ON "TicketType" FOR EACH ROW EXECUTE FUNCTION event_v2_resource_dirty();
CREATE TRIGGER "EventTranslation_v2_dirty" AFTER INSERT OR UPDATE OR DELETE ON "EventTranslation" FOR EACH ROW EXECUTE FUNCTION event_v2_resource_dirty();
CREATE TRIGGER "VenueLayout_v2_dirty" AFTER INSERT OR DELETE OR UPDATE OF "layoutJson" ON "VenueLayout" FOR EACH ROW EXECUTE FUNCTION event_v2_resource_dirty();
CREATE TRIGGER "Table_v2_dirty" AFTER INSERT OR DELETE OR UPDATE OF name,description,"shortDescription",price,deposit,currency,seats,"saleMode" ON "Table" FOR EACH ROW EXECUTE FUNCTION event_v2_resource_dirty();
CREATE TRIGGER "VenueRow_v2_dirty" AFTER INSERT OR DELETE OR UPDATE OF name,"shortDescription",price,deposit,currency ON "VenueRow" FOR EACH ROW EXECUTE FUNCTION event_v2_resource_dirty();
CREATE TRIGGER "Seat_v2_dirty" AFTER INSERT OR DELETE OR UPDATE OF "ticketTypeId","rowId","tableId",status ON "Seat" FOR EACH ROW EXECUTE FUNCTION event_v2_resource_dirty();

CREATE FUNCTION event_v2_card_kind_check() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW."isCard" AND EXISTS (SELECT 1 FROM "MediaAsset" WHERE id=NEW."assetId" AND kind='video') THEN RAISE EXCEPTION 'CARD_MUST_BE_IMAGE' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "EventMedia_card_kind" BEFORE INSERT OR UPDATE ON "EventMedia" FOR EACH ROW EXECUTE FUNCTION event_v2_card_kind_check();
CREATE FUNCTION event_v2_asset_kind_check() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.kind='video' AND EXISTS (SELECT 1 FROM "EventMedia" WHERE "assetId"=NEW.id AND "isCard") THEN RAISE EXCEPTION 'CARD_MUST_BE_IMAGE' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER "MediaAsset_card_kind" BEFORE UPDATE OF kind ON "MediaAsset" FOR EACH ROW EXECUTE FUNCTION event_v2_asset_kind_check();
CREATE FUNCTION event_v2_publication_check() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE eid uuid; e "Event"; BEGIN
  eid:=CASE WHEN TG_TABLE_NAME='Event' THEN (CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END) ELSE (CASE WHEN TG_OP='DELETE' THEN OLD."eventId" ELSE NEW."eventId" END) END;
  SELECT * INTO e FROM "Event" WHERE id=eid FOR UPDATE;
  IF e.status='published' AND e."v2State"='reconciled' THEN
    IF (SELECT count(*) FROM "EventMedia" WHERE "eventId"=eid AND "isCard")<>1
      OR (SELECT count(*) FROM "EventMedia" WHERE "eventId"=eid AND "isBackground")<>1
      OR EXISTS (SELECT 1 FROM "EventMedia" m JOIN "MediaAsset" a ON a.id=m."assetId" WHERE m."eventId"=eid AND a.state<>'ready')
      OR NOT EXISTS (SELECT 1 FROM "EventContent" c WHERE c."eventId"=eid AND c.locale=e."sourceLocale" AND nullif(btrim(c.title),'') IS NOT NULL AND nullif(btrim(c.summary),'') IS NOT NULL AND nullif(btrim(c.description),'') IS NOT NULL AND nullif(btrim(c."venueName"),'') IS NOT NULL AND nullif(btrim(c.address),'') IS NOT NULL)
    THEN RAISE EXCEPTION 'EVENT_V2_PUBLICATION_INCOMPLETE' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "Event_v2_publication_complete" AFTER INSERT OR UPDATE ON "Event" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION event_v2_publication_check();
CREATE CONSTRAINT TRIGGER "EventMedia_v2_publication_complete" AFTER INSERT OR UPDATE OR DELETE ON "EventMedia" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION event_v2_publication_check();
CREATE CONSTRAINT TRIGGER "MediaAsset_v2_publication_complete" AFTER UPDATE OF state,kind ON "MediaAsset" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION event_v2_publication_check();
CREATE CONSTRAINT TRIGGER "EventContent_v2_publication_complete" AFTER INSERT OR UPDATE OR DELETE ON "EventContent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION event_v2_publication_check();
COMMIT;
