import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { pg, rehearsalConnection, financialEvidence } from './v2-rehearsal-lib.mjs';
import { loadLegacyGraph, prepareActions } from './event-v2-backfill.mjs';
import { hash, planLegacyEvent } from './event-v2-backfill-plan.mjs';

const connection=await rehearsalConnection(process.argv[2]);
const client=new pg.Client({connectionString:connection});
const report={at:new Date().toISOString(),scope:'Isolated restored copy only',checks:[],counts:{},exceptions:{}};
await client.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
try{
  const ids=(await client.query(`SELECT id FROM "Event" ORDER BY id`)).rows;
  for(const {id} of ids){
    const graph=await loadLegacyGraph(client,id),plan=planLegacyEvent(graph),prepared=await prepareActions(client,graph,plan);
    assert.equal(prepared.actions.length,0,`Nonconverged event ${id}`);
    const archive=(await client.query(`SELECT original FROM "LegacyEventSnapshot" WHERE "eventId"=$1 AND fingerprint=$2`,[id,plan.fingerprint])).rows[0]?.original;
    assert.ok(archive,`Missing archive ${id}`);
    for(const field of ['event','translations','ticketTypes','layouts','tables','rows','seats'])assert.deepEqual(archive[field],graph[field],`Changed original ${id}:${field}`);
    for(const row of [...plan.contents,...plan.resources]){
      const content=(await client.query(`SELECT * FROM "${row.table}" WHERE "${row.idField}"=$1 AND locale=$2`,[row.id,row.locale])).rows[0];
      assert.ok(content,`Missing mapped content ${id}:${row.table}`);
      assert.equal(content.legacyHash,row.legacyHash);
      assert.equal(hash({values:Object.fromEntries(Object.keys(row.values).map(field=>[field,content[field]])),fieldMetadata:content.fieldMetadata}),row.legacyHash);
    }
    for(const reason of plan.reasons){const kind=reason.split(':')[0];(report.exceptions[kind]??=[]).push(id);}
  }
  report.checks.push('all original event/target/resource/hall/seat rows equal archival originals','all source/target/resource content hashes equal lossless mapping','repeat proposes zero writes');
  const violations=(await client.query(`SELECT count(*)::int AS n FROM "EventMedia" m LEFT JOIN "MediaAsset" a ON a.id=m."assetId" WHERE a.id IS NULL OR a."eventId"<>m."eventId" OR m.slot NOT BETWEEN 0 AND 4 OR (m."isCard" AND a.kind='video')`)).rows[0].n;
  assert.equal(violations,0);report.checks.push('media IDs, ownership, positions and image role invariant preserved');
  const invalid=(await client.query(`SELECT c.conname FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND NOT c.convalidated`)).rows;
  assert.equal(invalid.length,0);report.checks.push('all foreign keys and checks validated');
  for(const table of ['Event','EventContent','TicketType','TicketTypeContent','Table','TableContent','VenueRow','VenueRowContent','Seat','VenueLayout','HallTariff','HallTariffContent','MediaAsset','EventMedia','LegacyEventSnapshot'])report.counts[table]=(await client.query(`SELECT count(*)::int AS n FROM "${table}"`)).rows[0].n;
  report.events=(await client.query(`SELECT "v2State",count(*)::int AS n,count("endsAt")::int AS known_ends FROM "Event" GROUP BY 1 ORDER BY 1`)).rows;
  report.financial=await financialEvidence(client);
  const first=JSON.parse(await readFile('docs/event-creation-v2/batch-3-first-batch.json','utf8'));
  assert.deepEqual(report.financial,first.financialBefore);report.checks.push('exact financial rows/snapshots/history/inventory and totals by currency equal pre-backfill evidence');
  report.financialUnchanged=true;
  for(const kind of Object.keys(report.exceptions))report.exceptions[kind]=[...new Set(report.exceptions[kind])].sort();
  const history=(await client.query(`SELECT 'missing_order_snapshot' AS kind,count(*)::int AS n FROM "Order" WHERE "checkoutSnapshot" IS NULL
    UNION ALL SELECT 'payment_order_money_mismatch',count(*)::int FROM "Payment" p JOIN "Order" o ON o.id=p."orderId" WHERE p.amount<>o.amount OR p.currency<>o.currency`)).rows;
  report.unmodifiedHistoricalExceptions=history;
  await writeFile(process.argv[3]??'docs/event-creation-v2/batch-3-reconciliation.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({checks:report.checks.length,counts:report.counts,events:report.events,financialUnchanged:true,historicalExceptions:history}));
}finally{await client.query('ROLLBACK');await client.end();}
