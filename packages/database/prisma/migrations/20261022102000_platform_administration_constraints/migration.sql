-- Only one unsettled staff refund may reserve an order's refundable balance.
CREATE UNIQUE INDEX "StaffRefund_active_order" ON "StaffRefund" ("orderId") WHERE status IN ('requested','processing');

-- Lock the buyer as well as event/organizer so concurrent blocking and checkout
-- cannot observe an old account state and commit a new sale after the block.
CREATE OR REPLACE FUNCTION platform_order_sale_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ev "Event"%ROWTYPE; owner "User"%ROWTYPE; buyer "User"%ROWTYPE; commission integer; event_key text;
BEGIN
  IF NEW."buyerUserId" IS NOT NULL THEN
    SELECT * INTO buyer FROM "User" WHERE id=NEW."buyerUserId" FOR SHARE;
    IF buyer."blockedAt" IS NOT NULL THEN RAISE EXCEPTION 'ACCOUNT_RESTRICTED' USING ERRCODE='P0001'; END IF;
  ELSIF NEW."guestContact"->>'channel'='telegram' THEN
    SELECT * INTO buyer FROM "User" WHERE "telegramId"::text=NEW."guestContact"->>'telegramId' FOR SHARE;
    IF buyer."blockedAt" IS NOT NULL THEN RAISE EXCEPTION 'ACCOUNT_RESTRICTED' USING ERRCODE='P0001'; END IF;
  ELSIF NEW."guestContact"->>'channel'='email' THEN
    SELECT u.* INTO buyer FROM "User" u JOIN "ContactIdentity" c ON c."userId"=u.id WHERE c.method='email' AND c."normalizedIdentifier"=lower(NEW."guestContact"->>'email') FOR SHARE OF u;
    IF buyer."blockedAt" IS NOT NULL THEN RAISE EXCEPTION 'ACCOUNT_RESTRICTED' USING ERRCODE='P0001'; END IF;
  END IF;
  event_key:=NEW."checkoutSnapshot"->>'eventId';
  SELECT * INTO ev FROM "Event" WHERE id::text=event_key FOR SHARE;
  IF FOUND THEN
    SELECT * INTO owner FROM "User" WHERE id=ev."organizerId" FOR SHARE;
    IF owner."blockedAt" IS NOT NULL OR ev."moderationStatus" NOT IN ('clear','approved') OR ev.status<>'published' THEN RAISE EXCEPTION 'EVENT_SALES_PAUSED' USING ERRCODE='P0001'; END IF;
    commission:=COALESCE(owner."commissionBps",(SELECT value FROM "PlatformSetting" WHERE key='commission.default'));
    NEW."commissionBps":=commission;
    NEW."commissionAmount":=CASE WHEN commission IS NULL THEN NULL ELSE floor(NEW.amount::bigint*commission/10000.0)::integer END;
  END IF;
  RETURN NEW;
END $$;
