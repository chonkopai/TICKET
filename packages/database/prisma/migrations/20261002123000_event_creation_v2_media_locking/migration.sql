-- Serialize card assignment with asset-kind changes and validate both owners
-- when a content/media row moves. No legacy index or constraint is removed.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
CREATE OR REPLACE FUNCTION event_v2_card_kind_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE asset_kind "MediaAssetKind";
BEGIN
  IF NEW."isCard" THEN
    SELECT kind INTO asset_kind FROM "MediaAsset" WHERE id=NEW."assetId" FOR UPDATE;
    IF asset_kind='video' THEN RAISE EXCEPTION 'CARD_MUST_BE_IMAGE' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
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
        OR NOT EXISTS (SELECT 1 FROM "EventContent" c WHERE c."eventId"=eid AND c.locale=e."sourceLocale" AND nullif(btrim(c.title),'') IS NOT NULL AND nullif(btrim(c.summary),'') IS NOT NULL AND nullif(btrim(c.description),'') IS NOT NULL AND nullif(btrim(c."venueName"),'') IS NOT NULL AND nullif(btrim(c.address),'') IS NOT NULL)
      THEN RAISE EXCEPTION 'EVENT_V2_PUBLICATION_INCOMPLETE' USING ERRCODE='23514'; END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END $$;
COMMIT;
