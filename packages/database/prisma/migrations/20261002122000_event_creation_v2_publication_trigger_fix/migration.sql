-- Forward repair found by rollback-only cross-event attachment rehearsal.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
CREATE OR REPLACE FUNCTION event_v2_publication_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE eid uuid; e "Event"; data jsonb;
BEGIN
  -- Event has id; link/content records have eventId. A generic trigger must not
  -- dereference absent record fields, even inside a conditional expression.
  data:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  eid:=(data->>(CASE WHEN TG_TABLE_NAME='Event' THEN 'id' ELSE 'eventId' END))::uuid;
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
COMMIT;
