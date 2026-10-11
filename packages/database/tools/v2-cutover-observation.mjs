import { pg, financialEvidence } from './v2-rehearsal-lib.mjs';

/** Read-only monitoring. Existing historical exceptions are reported, never corrected. */
export async function cutoverObservation(connection) {
  const client=new pg.Client({connectionString:connection,options:'-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=2000'});
  await client.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const counts=(await client.query(`SELECT count(*)::int AS events,
      count(*) FILTER (WHERE "creationVersion"=2)::int AS created_v2,
      count(*) FILTER (WHERE "v2State"<>'reconciled')::int AS unresolved_events,
      count(*) FILTER (WHERE "endsAt" IS NULL)::int AS unknown_ends,
      count(*) FILTER (WHERE "paymentMode"='deposit' AND status='published')::int AS legacy_deposit_sales,
      count(*) FILTER (WHERE "creationVersion"=2 AND ("saleMode" IS NULL OR "startsAt" IS NULL OR "endsAt" IS NULL OR currency IS NULL OR "v2State"<>'reconciled'))::int AS invalid_new_events FROM "Event"`)).rows[0];
    const reasons=(await client.query(`SELECT reason,count(*)::int AS events FROM "Event",jsonb_array_elements_text("reviewReasons") AS reason GROUP BY reason ORDER BY reason`)).rows;
    const orders=(await client.query(`SELECT type::text,"paymentStatus"::text AS status,count(*)::int AS orders,btrim(currency) AS currency,sum(amount)::text AS minor_total FROM "Order" GROUP BY 1,2,4 ORDER BY 1,2,4`)).rows;
    const pending=(await client.query(`SELECT coalesce("checkoutSnapshot"->>'version','legacy') AS snapshot_version,type::text,btrim(currency) AS currency,count(*)::int AS orders,sum(amount)::text AS minor_total,count(*) FILTER (WHERE "expiresAt"<=now())::int AS expired FROM "Order" WHERE "paymentStatus"='pending' GROUP BY 1,2,3 ORDER BY 1,2,3`)).rows;
    const anomalies=(await client.query(`SELECT 'payment_order_money_mismatch' AS kind,count(*)::int AS count FROM "Payment" p JOIN "Order" o ON o.id=p."orderId" WHERE p.amount<>o.amount OR p.currency<>o.currency
      UNION ALL SELECT 'missing_order_snapshot',count(*)::int FROM "Order" WHERE "checkoutSnapshot" IS NULL
      UNION ALL SELECT 'new_format_deposit',count(*)::int FROM "Deposit" d JOIN "Order" o ON o.id=d."orderId" WHERE o."checkoutSnapshot"->>'version'='2'
      UNION ALL SELECT 'new_snapshot_money_mismatch',count(*)::int FROM "Order" WHERE "checkoutSnapshot"->>'version'='2' AND (CASE WHEN "checkoutSnapshot"->>'amount' ~ '^[0-9]+$' THEN ("checkoutSnapshot"->>'amount')::numeric IS DISTINCT FROM amount ELSE true END OR "checkoutSnapshot"->>'currency' IS DISTINCT FROM btrim(currency))
      UNION ALL SELECT 'invalid_new_media',count(*)::int FROM "EventMedia" m JOIN "Event" e ON e.id=m."eventId" JOIN "MediaAsset" a ON a.id=m."assetId" WHERE e."creationVersion"=2 AND (a.state IS DISTINCT FROM 'ready' OR a."eventId" IS DISTINCT FROM m."eventId" OR (m."isCard" AND a.kind<>'image'))
      UNION ALL SELECT 'new_event_missing_card',count(*)::int FROM "Event" e WHERE e."creationVersion"=2 AND e.status='published' AND NOT EXISTS (SELECT 1 FROM "EventMedia" m WHERE m."eventId"=e.id AND m."isCard")
      UNION ALL SELECT 'negative_or_oversold_inventory',count(*)::int FROM "TicketType" WHERE "quantitySold"<0 OR "quantitySold">"quantityTotal"
      UNION ALL SELECT 'unvalidated_constraints',count(*)::int FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND NOT c.convalidated`)).rows;
    return {at:new Date().toISOString(),database:new URL(connection).pathname.slice(1),readOnly:true,counts,reasons,orders,pending,anomalies,financial:await financialEvidence(client),contraction:{eligible:false,blockers:['No authorized deployed-consumer inventory or completed cutover observation.','Legacy content/media and active-sale review must be resolved before dropping live projections.','Historical Deposit/OrderType archive and reader migration are not proven.']}};
  } finally {await client.query('ROLLBACK');await client.end();}
}
