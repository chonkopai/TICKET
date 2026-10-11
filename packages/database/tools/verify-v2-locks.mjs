import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { pg, rehearsalConnection } from './v2-rehearsal-lib.mjs';
import { loadLegacyGraph,prepareActions } from './event-v2-backfill.mjs';
import { planLegacyEvent } from './event-v2-backfill-plan.mjs';

const connection=await rehearsalConnection(process.argv[2]),a=new pg.Client({connectionString:connection}),b=new pg.Client({connectionString:connection});
await a.connect();await b.connect();const checks=[];
try{
  const id=(await a.query(`SELECT id FROM "Event" ORDER BY id LIMIT 1`)).rows[0].id;
  await a.query('BEGIN');const graph=await loadLegacyGraph(a,id,true);await prepareActions(a,graph,planLegacyEvent(graph),true);
  async function blocked(name,sql,values){
    await b.query('BEGIN');await b.query(`SET LOCAL lock_timeout='100ms'`);
    let error;try{await b.query(sql,values);}catch(caught){error=caught;}finally{await b.query('ROLLBACK');}
    assert.equal(error?.code,'55P03',name);checks.push(name);
  }
  await blocked('legacy event writes wait for backfill event lock',`UPDATE "Event" SET title='Concurrent fixture' WHERE id=$1`,[id]);
  await blocked('manual normalized content writes wait for backfill content lock',`UPDATE "EventContent" SET title='Concurrent manual fixture',"managedBy"='editor' WHERE "eventId"=$1 AND locale='ru'`,[id]);
  if(graph.ticketTypes.length)await blocked('legacy price writes wait for preserved inventory lock',`UPDATE "TicketType" SET price=price+1 WHERE id=$1`,[graph.ticketTypes[0].id]);
  await a.query('ROLLBACK');
  const image=(await a.query(`SELECT id FROM "MediaAsset" WHERE kind='image' AND "legacyReference" IS NOT NULL LIMIT 1`)).rows[0].id;
  await a.query('BEGIN');
  await a.query(`UPDATE "EventMedia" SET "isCard"="isCard" WHERE "assetId"=$1`,[image]);
  await blocked('card assignment serializes concurrent kind changes',`UPDATE "MediaAsset" SET kind='video' WHERE id=$1`,[image]);
  await a.query('ROLLBACK');
  await writeFile(process.argv[3]??'docs/event-creation-v2/batches-2-3-lock-checks.json',JSON.stringify({at:new Date().toISOString(),checks,rolledBack:true},null,2)+'\n');
  console.log(JSON.stringify({passed:checks.length,rolledBack:true}));
}finally{await a.query('ROLLBACK');await b.query('ROLLBACK');await a.end();await b.end();}
