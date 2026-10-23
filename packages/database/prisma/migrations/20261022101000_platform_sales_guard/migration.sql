-- Enforce the same sale/block rules for every checkout path, including anonymous purchases.
CREATE FUNCTION platform_order_sale_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ev "Event"%ROWTYPE; owner "User"%ROWTYPE; commission integer; event_key text;
BEGIN
  IF NEW."buyerUserId" IS NOT NULL AND EXISTS(SELECT 1 FROM "User" WHERE id=NEW."buyerUserId" AND "blockedAt" IS NOT NULL) THEN RAISE EXCEPTION 'ACCOUNT_RESTRICTED' USING ERRCODE='P0001'; END IF;
  IF NEW."guestContact"->>'channel'='telegram' AND EXISTS(SELECT 1 FROM "User" WHERE "telegramId"::text=NEW."guestContact"->>'telegramId' AND "blockedAt" IS NOT NULL) THEN RAISE EXCEPTION 'ACCOUNT_RESTRICTED' USING ERRCODE='P0001'; END IF;
  IF NEW."guestContact"->>'channel'='email' AND EXISTS(SELECT 1 FROM "User" u JOIN "ContactIdentity" c ON c."userId"=u.id WHERE c.method='email' AND c."normalizedIdentifier"=lower(NEW."guestContact"->>'email') AND u."blockedAt" IS NOT NULL) THEN RAISE EXCEPTION 'ACCOUNT_RESTRICTED' USING ERRCODE='P0001'; END IF;
  event_key:=NEW."checkoutSnapshot"->>'eventId';
  SELECT * INTO ev FROM "Event" WHERE id::text=event_key FOR SHARE;
  IF FOUND THEN
    SELECT * INTO owner FROM "User" WHERE id=ev."organizerId" FOR SHARE;
    IF owner."blockedAt" IS NOT NULL OR ev."moderationStatus" NOT IN ('clear','approved') THEN RAISE EXCEPTION 'EVENT_SALES_PAUSED' USING ERRCODE='P0001'; END IF;
    commission:=COALESCE(owner."commissionBps",(SELECT value FROM "PlatformSetting" WHERE key='commission.default'));
    NEW."commissionBps":=commission;
    NEW."commissionAmount":=CASE WHEN commission IS NULL THEN NULL ELSE floor(NEW.amount::bigint*commission/10000.0)::integer END;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER platform_order_sale_guard BEFORE INSERT ON "Order" FOR EACH ROW EXECUTE FUNCTION platform_order_sale_guard();
