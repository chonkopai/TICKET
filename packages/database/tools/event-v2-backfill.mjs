import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { pg, assertIsolated, financialEvidence, rehearsalConnection } from './v2-rehearsal-lib.mjs';
import { BACKFILL_VERSION, hash, planLegacyEvent } from './event-v2-backfill-plan.mjs';

// Additive normalized columns are excluded from the stable original-row fingerprint.
const newEventColumns=['creationVersion','saleMode','currency','startsAt','endsAt','refundsAvailable','refundPolicyRevision','revision','latitude','longitude','v2State','legacyFingerprint','reviewReasons'];
const CONTENT_TABLES={EventContent:'eventId',TicketTypeContent:'ticketTypeId',TableContent:'tableId',VenueRowContent:'rowId',HallTariffContent:'tariffId'};
export async function loadLegacyGraph(client,eventId,lock=false) {
  const suffix=lock?' FOR UPDATE':'';
  const record=(await client.query(`SELECT to_jsonb(e)-$2::text[] AS original,to_jsonb(e) AS current FROM "Event" e WHERE id=$1${suffix}`,[eventId,newEventColumns])).rows[0];
  if(!record)return null;
  const read=async(table,condition,args,omit=[])=> (await client.query(`SELECT to_jsonb(t)-$${args.length+1}::text[] AS original FROM "${table}" t WHERE ${condition} ORDER BY ${table==='EventTranslation'?'locale':'id'}${suffix}`,[...args,omit])).rows.map(row=>row.original);
  const translations=await read('EventTranslation','"eventId"=$1',[eventId]);
  const ticketTypes=await read('TicketType','"eventId"=$1',[eventId],['tariffId']);
  const layouts=await read('VenueLayout','"eventId"=$1',[eventId]);
  const layoutIds=layouts.map(row=>row.id);
  const tables=await read('Table','"venueLayoutId"=ANY($1::uuid[])',[layoutIds],['tariffId']);
  const rows=await read('VenueRow','"venueLayoutId"=ANY($1::uuid[])',[layoutIds],['tariffId']);
  const seats=await read('Seat','"venueLayoutId"=ANY($1::uuid[])',[layoutIds]);
  const historyRows=(await client.query(`WITH links AS (
    SELECT "orderId" FROM "Deposit" WHERE "eventId"=$1
    UNION SELECT x."orderId" FROM "Ticket" x JOIN "TicketType" t ON t.id=x."ticketTypeId" WHERE t."eventId"=$1
    UNION SELECT r."orderId" FROM "TicketReservation" r JOIN "TicketType" t ON t.id=r."ticketTypeId" WHERE t."eventId"=$1 AND r."orderId" IS NOT NULL
    UNION SELECT b."orderId" FROM "Booking" b JOIN "Table" t ON t.id=b."tableId" JOIN "VenueLayout" v ON v.id=t."venueLayoutId" WHERE v."eventId"=$1
    UNION SELECT a."orderId" FROM "SeatAllocation" a JOIN "Seat" s ON s.id=a."seatId" JOIN "VenueLayout" v ON v.id=s."venueLayoutId" WHERE v."eventId"=$1
    UNION SELECT g."orderId" FROM "GroupPass" g JOIN "Table" t ON t.id=g."tableId" JOIN "VenueLayout" v ON v.id=t."venueLayoutId" WHERE v."eventId"=$1
  ) SELECT o.id,o."paymentStatus",EXISTS(SELECT 1 FROM "Payment" p WHERE p."orderId"=o.id AND (p.amount<>o.amount OR p.currency<>o.currency)) AS mismatch
    FROM "Order" o WHERE o.id IN (SELECT "orderId" FROM links) OR o."checkoutSnapshot"->>'eventId'=$1::text ORDER BY o.id`,[eventId])).rows;
  const locks=(await client.query(`SELECT
    (SELECT count(*)::int FROM "TicketReservation" r JOIN "TicketType" t ON t.id=r."ticketTypeId" WHERE t."eventId"=$1 AND r.status='active' AND r."expiresAt">transaction_timestamp()) AS reservations,
    (SELECT count(*)::int FROM "TableHold" h JOIN "Table" t ON t.id=h."tableId" JOIN "VenueLayout" v ON v.id=t."venueLayoutId" WHERE v."eventId"=$1 AND h.status='active' AND h."expiresAt">transaction_timestamp()) AS holds,
    (SELECT count(*)::int FROM "SeatAllocation" a JOIN "Seat" s ON s.id=a."seatId" JOIN "VenueLayout" v ON v.id=s."venueLayoutId" JOIN "Order" o ON o.id=a."orderId" WHERE v."eventId"=$1 AND o."paymentStatus"='paid') AS allocations`,[eventId])).rows[0];
  return {event:record.original,current:record.current,translations,ticketTypes,layouts,tables,rows,seats,history:{pendingOrders:historyRows.filter(row=>row.paymentStatus==='pending').map(row=>row.id),moneyMismatches:historyRows.filter(row=>row.mismatch).map(row=>row.id),liveReservations:locks.reservations,liveHolds:locks.holds,paidAllocations:locks.allocations}};
}

// Build actions against locked rows, also used in read-only preview. Every SQL
// identifier below comes from a fixed table/field whitelist, never CLI input.
export async function prepareActions(client,graph,plan,lock=false) {
  if(graph.current.v2State==='reconciled')return {actions:[],reasons:['new_reconciled_aggregate_preserved'],protectedEdits:true,skip:true};
  const suffix=lock?' FOR UPDATE':'';
  const reasons=new Set(plan.reasons),actions=[],unavailableTariffs=new Set();
  let protectedEdits=graph.current.v2State==='reconciled';
  for(const tariff of plan.tariffs){
    const existing=(await client.query(`SELECT * FROM "HallTariff" WHERE id=$1${suffix}`,[tariff.id])).rows[0];
    if(existing&&existing.venueLayoutId!==tariff.venueLayoutId){reasons.add(`cross_layout_tariff_collision:${tariff.id}`);unavailableTariffs.add(tariff.id);continue;}
    const currentHash=existing&&hash({venueLayoutId:existing.venueLayoutId,price:existing.price,currency:existing.currency?.trim()??null});
    if(existing&&(existing.managedBy!=='legacy'||currentHash!==existing.legacyHash)){
      protectedEdits=true;reasons.add(`new_edits_preserved:HallTariff:${tariff.id}`);continue;
    }
    if(!existing||existing.legacyHash!==tariff.legacyHash)actions.push({kind:'tariff',row:tariff,previousHash:existing?.legacyHash??null});
  }
  for(const row of [...plan.contents,...plan.resources]){
    if(row.table==='HallTariffContent'&&unavailableTariffs.has(row.id))continue;
    if(CONTENT_TABLES[row.table]!==row.idField)throw new Error('Invalid content table');
    const existing=(await client.query(`SELECT * FROM "${row.table}" WHERE "${row.idField}"=$1 AND locale=$2${suffix}`,[row.id,row.locale])).rows[0];
    const values=existing&&Object.fromEntries(Object.keys(row.values).map(field=>[field,existing[field]]));
    if(existing&&(existing.managedBy!=='legacy'||hash({values,fieldMetadata:existing.fieldMetadata})!==existing.legacyHash)){
      protectedEdits=true;reasons.add(`new_edits_preserved:${row.table}:${row.id}:${row.locale}`);continue;
    }
    if(!existing||existing.legacyHash!==row.legacyHash)actions.push({kind:'content',row,previousHash:existing?.legacyHash??null});
  }
  const existingLinks=(await client.query(`SELECT * FROM "EventMedia" WHERE "eventId"=$1 ORDER BY slot${suffix}`,[plan.eventId])).rows;
  if(existingLinks.some(row=>row.managedBy!=='legacy')){
    protectedEdits=true;reasons.add('new_edits_preserved:media');
  }else{
    const existingAssets=(await client.query(`SELECT id,"legacyReference",state FROM "MediaAsset" WHERE "eventId"=$1 AND "legacyReference" IS NOT NULL${suffix}`,[plan.eventId])).rows;
    // Only initialize links once. Later changed legacy references require review;
    // never erase a processed replacement, crop or manually assigned role.
    if(!existingLinks.length){
      for(const row of plan.media)actions.push({kind:'media',row,assetId:existingAssets.find(asset=>asset.legacyReference===row.reference)?.id??randomUUID()});
    }else{
      for(const row of plan.media){
        const asset=existingAssets.find(asset=>asset.legacyReference===row.reference),link=existingLinks.find(link=>link.assetId===asset?.id);
        if(!link||link.slot!==row.slot||link.isCard!==row.isCard||link.isBackground!==row.isBackground)reasons.add('legacy_media_changed_review');
      }
      if(existingLinks.length!==plan.media.length)reasons.add('legacy_media_changed_review');
    }
  }
  if(protectedEdits)reasons.add('new_edits_preserved:aggregate');
  return {actions,reasons:[...reasons].sort(),protectedEdits};
}

export async function applyEventPlan(client,graph,plan,prepared) {
  if(prepared.skip)return;
  await client.query(`INSERT INTO "LegacyEventSnapshot" ("eventId",fingerprint,version,original) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[plan.eventId,plan.fingerprint,BACKFILL_VERSION,JSON.stringify({event:graph.event,translations:graph.translations,ticketTypes:graph.ticketTypes,layouts:graph.layouts,tables:graph.tables,rows:graph.rows,seats:graph.seats})]);
  for(const action of prepared.actions){
    const row=action.row;
    if(action.kind==='tariff'){
      await client.query(`INSERT INTO "HallTariff" (id,"venueLayoutId",price,currency,"managedBy","legacyHash") VALUES ($1,$2,$3,$4,'legacy',$5) ON CONFLICT (id) DO UPDATE SET price=EXCLUDED.price,currency=EXCLUDED.currency,"legacyHash"=EXCLUDED."legacyHash" WHERE "HallTariff"."managedBy"='legacy' AND "HallTariff"."legacyHash"=$6`,[row.id,row.venueLayoutId,row.price,row.currency,row.legacyHash,action.previousHash]);
    }else if(action.kind==='content'){
      const fields=Object.keys(row.values),columns=fields.map(field=>`"${field}"`);
      const values=[row.id,row.locale,...Object.values(row.values),JSON.stringify(row.fieldMetadata),row.legacyHash];
      await client.query(`INSERT INTO "${row.table}" ("${row.idField}",locale,${columns.join(',')},"fieldMetadata","legacyHash","managedBy","updatedAt") VALUES (${values.map((_,i)=>`$${i+1}`).join(',')},'legacy',now()) ON CONFLICT ("${row.idField}",locale) DO UPDATE SET ${columns.map(column=>`${column}=EXCLUDED.${column}`).join(',')},"fieldMetadata"=EXCLUDED."fieldMetadata","legacyHash"=EXCLUDED."legacyHash",revision="${row.table}".revision+1,"updatedAt"=now() WHERE "${row.table}"."managedBy"='legacy' AND "${row.table}"."legacyHash"=$${values.length+1}`,[...values,action.previousHash]);
    }else if(action.kind==='media'){
      await client.query(`INSERT INTO "MediaAsset" (id,"eventId",kind,state,"legacyReference","updatedAt") VALUES ($1,$2,'image','legacy',$3,now()) ON CONFLICT ("eventId","legacyReference") DO NOTHING`,[action.assetId,plan.eventId,row.reference]);
      await client.query(`INSERT INTO "EventMedia" ("eventId","assetId",slot,"isCard","isBackground","managedBy") VALUES ($1,$2,$3,$4,$5,'legacy') ON CONFLICT DO NOTHING`,[plan.eventId,action.assetId,row.slot,row.isCard,row.isBackground]);
    }
  }
  const state=prepared.protectedEdits?graph.current.v2State==='reconciled'?'dirty':graph.current.v2State:'review';
  if(graph.current.legacyFingerprint!==plan.fingerprint||JSON.stringify(graph.current.reviewReasons)!==JSON.stringify(prepared.reasons)||graph.current.v2State!==state||prepared.actions.length){
    // COALESCE protects already reviewed choices/UTC values. No legacy column,
    // inventory row, price, snapshot or financial table is written here.
    await client.query(`UPDATE "Event" SET "legacyFingerprint"=$2,"reviewReasons"=$3,"v2State"=$4,"currency"=coalesce("currency",$5),"saleMode"=coalesce("saleMode",$6::"EventSaleMode"),"startsAt"=coalesce("startsAt",$7::timestamptz),revision=revision+1 WHERE id=$1`,[plan.eventId,plan.fingerprint,JSON.stringify(prepared.reasons),state,prepared.protectedEdits?null:plan.currency,prepared.protectedEdits?null:plan.saleMode,prepared.protectedEdits?null:plan.startsAt]);
  }
}

export async function runBackfill(connection,{apply=false,batchSize=10,maxBatches=1,resume=false,checkpoint='event-creation-v2-v1'}={}) {
  if(!Number.isInteger(batchSize)||batchSize<1||batchSize>100||!Number.isInteger(maxBatches)||maxBatches<1||maxBatches>1000||!/^[-a-zA-Z0-9_]{1,120}$/.test(checkpoint))throw new Error('Invalid bounded backfill options');
  const database=apply?assertIsolated(connection):new URL(connection).pathname.slice(1);
  const client=new pg.Client({connectionString:connection,options:'-c statement_timeout=30000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=60000'});
  const report={version:BACKFILL_VERSION,at:new Date().toISOString(),database,dryRun:!apply,batchSize,maxBatches,checkpoint,resume,events:[],complete:false};
  await client.connect();
  let transaction=false,advisory=false;
  try{
    if(apply){advisory=(await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',[checkpoint])).rows[0].acquired;if(!advisory)throw new Error('Backfill checkpoint already running');}
    else{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');transaction=true;}
    report.financialBefore=await financialEvidence(client);
    const saved=resume?(await client.query(`SELECT * FROM "EventBackfillCheckpoint" WHERE key=$1`,[checkpoint])).rows[0]:null;
    if(saved&&saved.version!==BACKFILL_VERSION)throw new Error('Checkpoint version requires explicit restart');
    let cursor=saved?.cursor??null,processed=saved?.processedCount??0;
    report.startCursor=cursor;
    for(let batch=0;batch<maxBatches;batch++){
      if(apply){await client.query('BEGIN');transaction=true;}
      const ids=(await client.query(`SELECT id FROM "Event" WHERE ($1::uuid IS NULL OR id>$1::uuid) ORDER BY id LIMIT $2`,[cursor,batchSize])).rows;
      const committed=[];
      for(const {id} of ids){
        const graph=await loadLegacyGraph(client,id,apply);if(!graph)continue;
        const plan=planLegacyEvent(graph),prepared=await prepareActions(client,graph,plan,apply);
        if(apply)await applyEventPlan(client,graph,plan,prepared);
        committed.push({eventId:id,fingerprint:plan.fingerprint,reasons:prepared.reasons,actions:prepared.actions.reduce((counts,action)=>({...counts,[action.kind]:(counts[action.kind]??0)+1}),{}),pendingOrders:graph.history.pendingOrders,moneyMismatches:graph.history.moneyMismatches,sourceAndTargets:plan.contents.length,resourceContent:plan.resources.length,trustedMedia:plan.media.length});
      }
      if(ids.length){cursor=ids.at(-1).id;processed+=ids.length;}
      if(apply){
        await client.query(`INSERT INTO "EventBackfillCheckpoint" (key,version,cursor,"processedCount","updatedAt") VALUES ($1,$2,$3,$4,now()) ON CONFLICT (key) DO UPDATE SET version=EXCLUDED.version,cursor=EXCLUDED.cursor,"processedCount"=EXCLUDED."processedCount","updatedAt"=now()`,[checkpoint,BACKFILL_VERSION,cursor,processed]);
        await client.query('COMMIT');transaction=false;
      }
      report.events.push(...committed);
      if(ids.length<batchSize){report.complete=true;break;}
    }
    report.endCursor=cursor;report.processedCount=processed;
    report.financialAfter=await financialEvidence(client);
    report.financialUnchanged=JSON.stringify(report.financialBefore)===JSON.stringify(report.financialAfter);
    assert.equal(report.financialUnchanged,true,'Financial/history/inventory evidence changed during rehearsal');
    if(transaction){await client.query('ROLLBACK');transaction=false;}
    report.reasonCounts={};for(const event of report.events)for(const reason of event.reasons)report.reasonCounts[reason.split(':')[0]]=(report.reasonCounts[reason.split(':')[0]]??0)+1;
    return report;
  }finally{
    if(transaction)await client.query('ROLLBACK');
    if(advisory)await client.query('SELECT pg_advisory_unlock(hashtext($1))',[checkpoint]);
    await client.end();
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=process.argv.slice(2),option=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined;
  try{
    const connection=option('--rehearsal')?await rehearsalConnection(option('--rehearsal')):process.env.DATABASE_URL;
    if(!connection||!option('--output'))throw new Error('DATABASE_URL or --rehearsal and --output required');
    const report=await runBackfill(connection,{apply:args.includes('--apply'),resume:args.includes('--resume'),batchSize:Number(option('--batch-size')??10),maxBatches:Number(option('--max-batches')??1),checkpoint:option('--checkpoint')??'event-creation-v2-v1'});
    await writeFile(option('--output'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
    console.log(JSON.stringify({database:report.database,dryRun:report.dryRun,events:report.events.length,complete:report.complete,financialUnchanged:report.financialUnchanged,reasonCounts:report.reasonCounts}));
  }catch(error){console.error(JSON.stringify({code:error.code??'BACKFILL_FAILED',name:error.name}));process.exitCode=1;}
}
