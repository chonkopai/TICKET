// Batch 0 only: one consistent, read-only snapshot; no application workers/providers.
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const pg = require(require.resolve("pg", { paths: [dirname(require.resolve("@prisma/adapter-pg"))] }));
const root = fileURLToPath(new URL("../../../", import.meta.url));
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
if (!args.includes("--expected-database") || !args.includes("--output") || !process.env.DATABASE_URL) {
  throw new Error("Use node --env-file=.env packages/database/tools/event-creation-v2-inventory.mjs --expected-database NAME --output PATH");
}
const target = new URL(process.env.DATABASE_URL);
const expected = option("--expected-database");
if (decodeURIComponent(target.pathname.slice(1)) !== expected) throw new Error("Database identity does not match --expected-database");
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5_000,
  // Server rejects writes even if this tool accidentally issues one later.
  options: "-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=60000",
});
const report = {
  formatVersion: 1,
  scope: "Authorized local database only; not production/cutover evidence",
  target: { host: target.hostname, port: target.port || "5432", database: expected },
  limitations: [
    "No legacy media URLs fetched; missing, external and untyped references need storage/decoded-media review.",
    "No legacy end field exists; every existing end stays unknown/null.",
    "Merged-description length is a conservative sum plus separator allowance, not a finalized backfill.",
    "Inventory/sums describe this snapshot only; concurrent application activity can change later snapshots.",
    "Money is recorded per currency/status with decimal-string sums; payment attempts must not be summed as order revenue.",
    "Financial/link fingerprints hash database row digests in ID order; raw contacts, tokens, snapshots and content are not exported.",
  ],
  queries: {},
};
let phase = "connect";
async function query(name, sql) {
  phase = name;
  report.queries[name] = (await client.query(sql)).rows;
}

try {
  await client.connect();
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await query("identity", `SELECT current_database() AS database, current_setting('server_version') AS server_version,
    current_setting('transaction_read_only') AS read_only, current_setting('transaction_isolation') AS isolation,
    transaction_timestamp() AS snapshot_at, pg_is_in_recovery() AS is_replica`);
  if (report.queries.identity[0].database !== expected || report.queries.identity[0].read_only !== "on") throw new Error("Read-only/identity assertion failed");
  const tables = "'Event','EventTranslation','TicketType','Ticket','TicketReservation','VenueLayout','Table','VenueRow','Seat','SeatAllocation','GroupPass','TableHold','Booking','Order','Payment','Deposit','RefundRequest','OutboxEvent','Notification','AnonymousCheckoutSession','TicketEmailDelivery','IdempotencyRecord'";
  await query("columns", `SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns WHERE table_schema='public' AND table_name IN (${tables}) ORDER BY table_name, ordinal_position`);
  await query("constraints", `SELECT c.relname AS table_name, p.conname AS name, p.contype AS type,
    p.convalidated AS validated, pg_get_constraintdef(p.oid) AS definition
    FROM pg_constraint p JOIN pg_class c ON c.oid=p.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN (${tables}) ORDER BY c.relname,p.conname`);
  await query("indexes", `SELECT c.relname AS table_name, i.relname AS name, x.indisvalid AS valid,
    x.indisready AS ready, pg_get_indexdef(x.indexrelid) AS definition
    FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN (${tables}) ORDER BY c.relname,i.relname`);
  await query("triggers", `SELECT c.relname AS table_name,t.tgname AS name, pg_get_triggerdef(t.oid) AS definition
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal AND c.relname IN (${tables}) ORDER BY c.relname,t.tgname`);
  await query("migrations", `SELECT migration_name, checksum, started_at, finished_at, rolled_back_at, applied_steps_count
    FROM "_prisma_migrations" ORDER BY migration_name,started_at`);
  const migrationRoot = resolve(root, "packages/database/prisma/migrations");
  report.migrationFiles = [];
  for (const name of (await readdir(migrationRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()) {
    const checksum = createHash("sha256").update(await readFile(resolve(migrationRoot, name, "migration.sql"))).digest("hex");
    const applied = report.queries.migrations.filter((row) => row.migration_name === name && row.finished_at && !row.rolled_back_at);
    report.migrationFiles.push({ name, checksum, applied: applied.length === 1, checksumMatches: applied.length === 1 && applied[0].checksum === checksum });
  }
  await query("events", `SELECT status,"paymentMode","sourceLocale",count(*)::text AS count FROM "Event" GROUP BY 1,2,3 ORDER BY 1,2,3`);
  await query("legacyExceptions", `WITH resources AS (
    SELECT "eventId",currency FROM "TicketType" UNION ALL
    SELECT v."eventId",t.currency FROM "Table" t JOIN "VenueLayout" v ON v.id=t."venueLayoutId" WHERE v."eventId" IS NOT NULL UNION ALL
    SELECT v."eventId",r.currency FROM "VenueRow" r JOIN "VenueLayout" v ON v.id=r."venueLayoutId" WHERE v."eventId" IS NOT NULL
  ) SELECT e.id,e.status,
    e."paymentMode"='deposit' AS deposit_mode,
    e."paymentMode"='deposit' AND e.status='published' AS published_deposit,
    true AS unknown_end,
    nullif(btrim(e."posterUrl"),'') IS NULL AS missing_card_reference,
    (SELECT count(DISTINCT btrim(currency))>1 FROM resources r WHERE r."eventId"=e.id) AS mixed_resource_currencies,
    (EXISTS(SELECT 1 FROM "TicketType" t WHERE t."eventId"=e.id AND NOT t."isInternal" AND t."venueObjectId" IS NULL AND NOT EXISTS(SELECT 1 FROM "Seat" s WHERE s."ticketTypeId"=t.id))
      AND EXISTS(SELECT 1 FROM "VenueLayout" v WHERE v."eventId"=e.id AND (EXISTS(SELECT 1 FROM "Table" t WHERE t."venueLayoutId"=v.id) OR EXISTS(SELECT 1 FROM "Seat" s WHERE s."venueLayoutId"=v.id)))) AS hybrid_mode_candidate,
    (EXISTS(SELECT 1 FROM "TicketType" t WHERE t."eventId"=e.id AND (t."quantityTotal"<=0 OR t."quantitySold">t."quantityTotal"))
      OR EXISTS(SELECT 1 FROM "Table" t JOIN "VenueLayout" v ON v.id=t."venueLayoutId" WHERE v."eventId"=e.id AND t.seats<=0)) AS missing_capacity_candidate,
    e."sourceLocale" NOT IN ('ru','en','kk') AS invalid_source_locale,
    NOT EXISTS(SELECT 1 FROM pg_timezone_names z WHERE z.name=e.timezone) AS invalid_timezone
    FROM "Event" e ORDER BY e.id`);
  await query("inventory", `SELECT t."eventId",t.id,t.status,t."isInternal",t.price,t.deposit,btrim(t.currency) AS currency,t."quantityTotal",t."quantitySold",
    (SELECT coalesce(sum(r.quantity),0)::text FROM "TicketReservation" r WHERE r."ticketTypeId"=t.id AND r.status='active' AND r."expiresAt">transaction_timestamp()) AS live_reserved,
    (SELECT count(*)::text FROM "Seat" s WHERE s."ticketTypeId"=t.id) AS linked_seats,
    (SELECT count(*)::text FROM "Ticket" x WHERE x."ticketTypeId"=t.id AND x.status IN ('paid','active','used')) AS live_issued
    FROM "TicketType" t ORDER BY t."eventId",t.id`);
  await query("liveReservations", `SELECT t."eventId",r.status,r."expiresAt">transaction_timestamp() AS unexpired,
    count(*)::text AS count,sum(r.quantity)::text AS quantity FROM "TicketReservation" r JOIN "TicketType" t ON t.id=r."ticketTypeId" GROUP BY 1,2,3 ORDER BY 1,2,3`);
  await query("tableHolds", `SELECT v."eventId",h.status,h."expiresAt">transaction_timestamp() AS unexpired,count(*)::text AS count
    FROM "TableHold" h JOIN "Table" t ON t.id=h."tableId" JOIN "VenueLayout" v ON v.id=t."venueLayoutId" GROUP BY 1,2,3 ORDER BY 1,2,3`);
  await query("seatAllocations", `SELECT v."eventId",a.status,o."paymentStatus",count(*)::text AS count FROM "SeatAllocation" a
    JOIN "Seat" s ON s.id=a."seatId" JOIN "VenueLayout" v ON v.id=s."venueLayoutId" JOIN "Order" o ON o.id=a."orderId" GROUP BY 1,2,3 ORDER BY 1,2,3`);
  await query("tableInventory", `SELECT v."eventId",t.id,t.status,t."saleMode",t.seats,t.price,t.deposit,btrim(t.currency) AS currency,
    t."holdExpiresAt",(SELECT count(*)::text FROM "Seat" s WHERE s."tableId"=t.id) AS seat_records FROM "Table" t JOIN "VenueLayout" v ON v.id=t."venueLayoutId" ORDER BY v."eventId",t.id`);
  await query("hallJson", `SELECT id,"eventId",revision,jsonb_typeof("layoutJson") AS json_type,"layoutJson"->>'version' AS version,
    jsonb_typeof("layoutJson"->'editor'->'objects') AS objects_type,jsonb_typeof("layoutJson"->'editor'->'tariffs') AS tariffs_type,
    "layoutJson"::text ~ '"deposit"\\s*:' AS has_deposit_keys,md5("layoutJson"::text) AS legacy_json_digest FROM "VenueLayout" ORDER BY id`);
  await query("snapshotShapes", `SELECT jsonb_typeof("checkoutSnapshot") AS json_type,"checkoutSnapshot"->>'version' AS version,
    "checkoutSnapshot"->>'paymentMode' AS mode,"checkoutSnapshot"->>'itemKind' AS kind,"paymentStatus",count(*)::text AS count
    FROM "Order" GROUP BY 1,2,3,4,5 ORDER BY 1,2,3,4,5`);
  await query("snapshotKeys", `SELECT k AS key,count(*)::text AS count FROM "Order" o
    CROSS JOIN LATERAL jsonb_object_keys(CASE WHEN jsonb_typeof(o."checkoutSnapshot")='object' THEN o."checkoutSnapshot" ELSE '{}'::jsonb END) k GROUP BY k ORDER BY k`);
  await query("money", `SELECT 'Order' AS source,type::text AS kind,"paymentStatus"::text AS status,btrim(currency) AS currency,count(*)::text AS count,sum(amount::numeric)::text AS amount_minor FROM "Order" GROUP BY 2,3,4
    UNION ALL SELECT 'Payment',provider,status::text,btrim(currency),count(*)::text,sum(amount::numeric)::text FROM "Payment" GROUP BY 2,3,4
    UNION ALL SELECT 'Deposit','deposit',status::text,btrim(currency),count(*)::text,sum(amount::numeric)::text FROM "Deposit" GROUP BY 3,4
    UNION ALL SELECT 'RefundRequest',provider,status::text,btrim(currency),count(*)::text,sum(amount::numeric)::text FROM "RefundRequest" GROUP BY 2,3,4 ORDER BY 1,2,3,4`);
  await query("moneyLinkExceptions", `SELECT 'payment_order_amount_or_currency' AS category,count(*)::text AS count FROM "Payment" p JOIN "Order" o ON o.id=p."orderId" WHERE p.amount<>o.amount OR btrim(p.currency)<>btrim(o.currency)
    UNION ALL SELECT 'deposit_order_amount_or_currency',count(*)::text FROM "Deposit" d JOIN "Order" o ON o.id=d."orderId" WHERE d.amount<>o.amount OR btrim(d.currency)<>btrim(o.currency)
    UNION ALL SELECT 'refund_payment_amount_or_currency_or_order',count(*)::text FROM "RefundRequest" r JOIN "Payment" p ON p.id=r."paymentId" WHERE r.amount>p.amount OR r.amount<0 OR btrim(r.currency)<>btrim(p.currency) OR r."orderId"<>p."orderId"
    UNION ALL SELECT 'multiple_paid_attempts',count(*)::text FROM (SELECT "orderId" FROM "Payment" WHERE status='paid' GROUP BY 1 HAVING count(*)>1) p
    UNION ALL SELECT 'snapshot_amount_mismatch',count(*)::text FROM "Order" WHERE "checkoutSnapshot" ? 'amountDue' AND "checkoutSnapshot"->>'amountDue' IS DISTINCT FROM amount::text
    UNION ALL SELECT 'snapshot_currency_mismatch',count(*)::text FROM "Order" WHERE "checkoutSnapshot" ? 'currency' AND "checkoutSnapshot"->>'currency' IS DISTINCT FROM btrim(currency)
    UNION ALL SELECT 'missing_snapshot',count(*)::text FROM "Order" WHERE "checkoutSnapshot" IS NULL`);
  await query("paymentOrderMismatches", `SELECT p.id AS payment_id,p."orderId",p.provider,p.status AS payment_status,
    p.amount AS payment_amount,btrim(p.currency) AS payment_currency,o."paymentStatus" AS order_status,o.amount AS order_amount,btrim(o.currency) AS order_currency
    FROM "Payment" p JOIN "Order" o ON o.id=p."orderId" WHERE p.amount<>o.amount OR btrim(p.currency)<>btrim(o.currency) ORDER BY p.id`);
  const links = `SELECT x."orderId",t."eventId" FROM "Ticket" x JOIN "TicketType" t ON t.id=x."ticketTypeId"
    UNION SELECT r."orderId",t."eventId" FROM "TicketReservation" r JOIN "TicketType" t ON t.id=r."ticketTypeId" WHERE r."orderId" IS NOT NULL
    UNION SELECT b."orderId",v."eventId" FROM "Booking" b JOIN "Table" t ON t.id=b."tableId" JOIN "VenueLayout" v ON v.id=t."venueLayoutId" WHERE v."eventId" IS NOT NULL
    UNION SELECT a."orderId",v."eventId" FROM "SeatAllocation" a JOIN "Seat" s ON s.id=a."seatId" JOIN "VenueLayout" v ON v.id=s."venueLayoutId" WHERE v."eventId" IS NOT NULL
    UNION SELECT "orderId","eventId" FROM "Deposit"
    UNION SELECT g."orderId",v."eventId" FROM "GroupPass" g JOIN "Table" t ON t.id=g."tableId" JOIN "VenueLayout" v ON v.id=t."venueLayoutId" WHERE v."eventId" IS NOT NULL`;
  await query("orderEventLinks", `WITH links AS (${links}) SELECT o.id,o.type,o."paymentStatus",o.amount,btrim(o.currency) AS currency,o."expiresAt",
    o."checkoutSnapshot"->>'eventId' AS snapshot_event_id,array_agg(DISTINCT l."eventId" ORDER BY l."eventId") FILTER (WHERE l."eventId" IS NOT NULL) AS resource_event_ids
    FROM "Order" o LEFT JOIN links l ON l."orderId"=o.id GROUP BY o.id ORDER BY o.id`);
  await query("historicalLinks", `SELECT 'Ticket' AS source,status::text AS status,count(*)::text AS count FROM "Ticket" GROUP BY 2
    UNION ALL SELECT 'Booking',status::text,count(*)::text FROM "Booking" GROUP BY 2
    UNION ALL SELECT 'GroupPass',status::text,count(*)::text FROM "GroupPass" GROUP BY 2
    UNION ALL SELECT 'WebhookEvent',status::text,count(*)::text FROM "WebhookEvent" GROUP BY 2
    UNION ALL SELECT 'TicketEmailDelivery',status,count(*)::text FROM "TicketEmailDelivery" GROUP BY 2 ORDER BY 1,2`);
  await query("pendingOrders", `SELECT id,type,amount,btrim(currency) AS currency,"expiresAt",
    "expiresAt" IS NULL AS unknown_expiry,"expiresAt"<=transaction_timestamp() AS past_expiry FROM "Order" WHERE "paymentStatus"='pending' ORDER BY id`);
  await query("outbox", `SELECT "eventType","processedAt" IS NOT NULL AS processed,count(*)::text AS count FROM "OutboxEvent" GROUP BY 1,2 ORDER BY 1,2`);

  // Exact Unicode grapheme lengths; PostgreSQL char_length is not grapheme counting.
  const segmenter = new Intl.Segmenter("ru", { granularity: "grapheme" });
  const length = (value) => [...segmenter.segment(value || "")].length;
  const limits = { title: 100, description: 10000, address: 250, cancellationTerms: 2000 };
  report.contentExceptions = [];
  report.mediaReferences = { total: 0, localUntyped: 0, externalOrUnknown: 0, duplicateEventReferences: 0, overFiveUnique: 0, examples: [] };
  let after = "";
  do {
    phase = "content_graphemes";
    const { rows } = await client.query(`SELECT id::text AS cursor,"sourceLocale" AS locale,to_jsonb(e) - 'organizerId' AS content FROM "Event" e WHERE id::text>$1 ORDER BY id::text LIMIT 200`, [after]);
    for (const row of rows) {
      checkContent(row.cursor, row.locale, row.content, true);
      const urls = [row.content.posterUrl, ...(row.content.galleryUrls || [])].filter(Boolean);
      const unique = new Set(urls);
      report.mediaReferences.duplicateEventReferences += urls.length - unique.size;
      if (unique.size > 5) report.mediaReferences.overFiveUnique++;
      for (const url of unique) {
        report.mediaReferences.total++;
        if (typeof url === "string" && /^\/media\/posters\/[a-zA-Z0-9._-]+$/.test(url)) report.mediaReferences.localUntyped++;
        else { report.mediaReferences.externalOrUnknown++; if (report.mediaReferences.examples.length < 20) report.mediaReferences.examples.push({ eventId: row.cursor, category: "external_or_unknown" }); }
      }
    }
    if (rows.length < 200) break;
    after = rows.at(-1).cursor;
  } while (after !== "");
  after = "";
  do {
    phase = "translation_graphemes";
    const { rows } = await client.query(`SELECT "eventId"::text||':'||locale AS cursor,"eventId",locale,to_jsonb(t) AS content FROM "EventTranslation" t
      WHERE "eventId"::text||':'||locale>$1 ORDER BY "eventId"::text||':'||locale LIMIT 200`, [after]);
    for (const row of rows) checkContent(row.eventId, row.locale, row.content, false);
    if (rows.length < 200) break;
    after = rows.at(-1).cursor;
  } while (after !== "");
  function checkContent(eventId, locale, content, source) {
    for (const [field, max] of Object.entries(limits)) {
      const actual = length(content[field]);
      if (actual > max) report.contentExceptions.push({ eventId, locale, source, field, actual, max });
    }
    for (const field of ["title", "description", "address"]) {
      if (!content[field]?.trim()) report.contentExceptions.push({ eventId, locale, source, field, category: "missing_required_v2_text" });
    }
    if (source && length(content.city)>80) report.contentExceptions.push({ eventId, locale, source, field: "city", actual: length(content.city), max: 80 });
    const sections = ["description", "program", "rules", "visitTerms", "extraConditions"].filter((field) => content[field]);
    const mergedEstimate = sections.reduce((sum, field) => sum + length(content[field]) + 80, 0);
    if (mergedEstimate>10000) report.contentExceptions.push({ eventId, locale, source, field: "merged_description", category: "conservative_overlength_candidate", actual: mergedEstimate, max: 10000 });
  }
  report.resourceTextExceptions = [];
  for (const [table, fields] of [["TicketType", {name:60,description:300}], ["Table", {name:60,description:300,shortDescription:300}], ["VenueRow", {name:60,shortDescription:300}]]) {
    after = "";
    do {
      phase = `resource_text_${table}`;
      const {rows} = await client.query(`SELECT id::text AS cursor,${Object.keys(fields).map((field)=>`"${field}"`).join(",")} FROM "${table}" WHERE id::text>$1 ORDER BY id::text LIMIT 200`,[after]);
      for (const row of rows) for (const [field,max] of Object.entries(fields)) if(length(row[field])>max) report.resourceTextExceptions.push({table,id:row.cursor,field,actual:length(row[field]),max});
      if(rows.length<200) break;
      after=rows.at(-1).cursor;
    } while(after !== "");
  }
  report.hallTextExceptions = [];
  after="";
  do {
    phase="hall_text_graphemes";
    const {rows}=await client.query(`SELECT id::text AS cursor,"layoutJson"->'editor' AS editor FROM "VenueLayout" WHERE id::text>$1 ORDER BY id::text LIMIT 100`,[after]);
    for(const row of rows) for(const kind of ["tariffs","objects"]) {
      if(!Array.isArray(row.editor?.[kind]))continue;
      for(const item of row.editor[kind]) for(const [field,max] of Object.entries({name:60,description:300})) {
        if(typeof item?.[field]==="string"&&length(item[field])>max)report.hallTextExceptions.push({layoutId:row.cursor,kind,id:item.id,field,actual:length(item[field]),max});
      }
    }
    if(rows.length<100)break;
    after=rows.at(-1).cursor;
  } while(after !== "");
  report.fingerprints = {};
  for (const table of ["Event","EventTranslation","VenueLayout","TicketType","Table","VenueRow","Seat","Order","Payment","Deposit","RefundRequest","Ticket","Booking","TicketReservation","SeatAllocation","GroupPass","TableHold"]) {
    const key = table === "EventTranslation" ? `"eventId"::text||':'||locale` : "id::text";
    const digest = createHash("sha256");
    let count=0; after="";
    do {
      phase=`fingerprint_${table}`;
      const {rows}=await client.query(`SELECT ${key} AS cursor,md5(to_jsonb(t)::text) AS digest FROM "${table}" t WHERE ${key}>$1 ORDER BY ${key} LIMIT 500`,[after]);
      for(const row of rows) {digest.update(`${row.cursor}:${row.digest}\n`);count++;}
      if(rows.length<500)break;
      after=rows.at(-1).cursor;
    } while(after !== "");
    report.fingerprints[table]={count,sha256OfOrderedRowDigests:digest.digest("hex")};
  }
  await client.query("ROLLBACK");
  report.completedAt=new Date().toISOString();
  const output=resolve(option("--output"));
  await mkdir(dirname(output),{recursive:true});
  await writeFile(output,`${JSON.stringify(report,null,2)}\n`,{mode:0o600});
  console.log(JSON.stringify({output,target:report.target,readOnly:report.queries.identity[0].read_only,events:report.fingerprints.Event.count,orders:report.fingerprints.Order.count,contentExceptions:report.contentExceptions.length}));
} catch(error) {
  // Do not serialize driver messages or the connection object (may contain secrets).
  console.error(JSON.stringify({phase,errorName:error.name,code:error.code || "INVENTORY_FAILED"}));
  process.exitCode=1;
} finally {
  await client.end();
}
