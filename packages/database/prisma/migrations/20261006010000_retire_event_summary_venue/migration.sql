-- Archive retired values before removing them from the active event schema.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE SCHEMA IF NOT EXISTS event_field_archive;
CREATE TABLE event_field_archive.retired_content (
  entity text NOT NULL, id uuid NOT NULL, locale text NOT NULL DEFAULT '',
  values jsonb NOT NULL, archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity, id, locale)
);
INSERT INTO event_field_archive.retired_content(entity,id,values)
SELECT 'Event',id,jsonb_build_object('announcement',announcement,'venueName',"venueName") FROM "Event";
INSERT INTO event_field_archive.retired_content(entity,id,locale,values)
SELECT 'EventTranslation',"eventId",locale,jsonb_build_object('announcement',announcement,'venueName',"venueName") FROM "EventTranslation";
INSERT INTO event_field_archive.retired_content(entity,id,locale,values)
SELECT 'EventContent',"eventId",locale,jsonb_build_object('summary',summary,'venueName',"venueName",'fieldMetadata',"fieldMetadata") FROM "EventContent";
INSERT INTO event_field_archive.retired_content(entity,id,values)
SELECT 'EventCreationDraft',id,aggregate FROM "EventCreationDraft";
CREATE OR REPLACE FUNCTION event_v2_legacy_event_dirty() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF ROW(NEW."sourceLocale",NEW.title,NEW.description,NEW.program,NEW.rules,NEW."visitTerms",NEW."cancellationTerms",NEW."extraConditions",NEW."depositTerms",NEW."paymentMode",NEW."posterUrl",NEW."galleryUrls",NEW.date,NEW.time,NEW.timezone,NEW.address,NEW.city,NEW.category,NEW."countryCode",NEW."ageRestriction",NEW."showFullAmountForDeposit")
    IS DISTINCT FROM ROW(OLD."sourceLocale",OLD.title,OLD.description,OLD.program,OLD.rules,OLD."visitTerms",OLD."cancellationTerms",OLD."extraConditions",OLD."depositTerms",OLD."paymentMode",OLD."posterUrl",OLD."galleryUrls",OLD.date,OLD.time,OLD.timezone,OLD.address,OLD.city,OLD.category,OLD."countryCode",OLD."ageRestriction",OLD."showFullAmountForDeposit") THEN
    NEW."v2State":='dirty'; NEW."legacyFingerprint":=NULL; NEW.revision:=OLD.revision+1;
  END IF; RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION event_v2_publication_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE eid uuid; e "Event"; prior jsonb; current_row jsonb; field_name text;
BEGIN
  field_name:=CASE WHEN TG_TABLE_NAME='Event' THEN 'id' ELSE 'eventId' END;
  IF TG_OP<>'INSERT' THEN prior:=to_jsonb(OLD); END IF;
  IF TG_OP<>'DELETE' THEN current_row:=to_jsonb(NEW); END IF;
  FOR eid IN SELECT DISTINCT value FROM unnest(ARRAY[(prior->>field_name)::uuid,(current_row->>field_name)::uuid]) AS value WHERE value IS NOT NULL ORDER BY value LOOP
    SELECT * INTO e FROM "Event" WHERE id=eid FOR UPDATE;
    IF e.status='published' AND e."v2State"='reconciled' THEN
      IF (SELECT count(*) FROM "EventMedia" WHERE "eventId"=eid AND "isCard")<>1
        OR (SELECT count(*) FROM "EventMedia" WHERE "eventId"=eid AND "isBackground")<>1
        OR EXISTS (SELECT 1 FROM "EventMedia" m JOIN "MediaAsset" a ON a.id=m."assetId" WHERE m."eventId"=eid AND (a.state<>'ready' OR (m."isCard" AND a.kind<>'image')))
        OR NOT EXISTS (SELECT 1 FROM "EventContent" c WHERE c."eventId"=eid AND c.locale=e."sourceLocale" AND nullif(btrim(c.title),'') IS NOT NULL AND nullif(btrim(c.description),'') IS NOT NULL AND nullif(btrim(c.address),'') IS NOT NULL)
      THEN RAISE EXCEPTION 'EVENT_V2_PUBLICATION_INCOMPLETE' USING ERRCODE='23514'; END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END $$;

ALTER TABLE "Event" DROP COLUMN "announcement", DROP COLUMN "venueName";
ALTER TABLE "EventTranslation" DROP COLUMN "announcement", DROP COLUMN "venueName";
ALTER TABLE "EventContent" DROP COLUMN "summary", DROP COLUMN "venueName";
UPDATE "EventContent" SET "fieldMetadata"="fieldMetadata" - 'summary' - 'venueName';
-- Strip retired fields from saved drafts, preserving every other field and upload.
-- Advancing revision invalidates pending publish intents and stale browser saves.
UPDATE "EventCreationDraft" d SET aggregate=jsonb_set(jsonb_set(d.aggregate,
 '{content}', coalesce((SELECT jsonb_object_agg(key, value - 'summary' - 'venueName') FROM jsonb_each(d.aggregate->'content')), '{}'::jsonb)),
 '{metadata}', coalesce((SELECT jsonb_object_agg(key, value - 'summary' - 'venueName') FROM jsonb_each(d.aggregate->'metadata')), '{}'::jsonb)),
 revision=revision+1, "updatedAt"=now();
COMMIT;
