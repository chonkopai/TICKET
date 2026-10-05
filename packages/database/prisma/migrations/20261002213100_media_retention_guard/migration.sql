BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
CREATE FUNCTION "retain_linked_media"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "MediaAsset" SET "publishedAt"=coalesce("publishedAt",now())
  WHERE id=NEW."assetId" AND "deletingAt" IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cannot reference media being collected' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "EventMedia_retain_asset" BEFORE INSERT OR UPDATE OF "assetId" ON "EventMedia"
FOR EACH ROW EXECUTE FUNCTION "retain_linked_media"();
COMMIT;
