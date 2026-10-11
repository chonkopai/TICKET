import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { pg, financialEvidence, rehearsalConnection } from './v2-rehearsal-lib.mjs';
import { loadLegacyGraph, prepareActions, applyEventPlan } from './event-v2-backfill.mjs';
import { planLegacyEvent } from './event-v2-backfill-plan.mjs';

const connection=await rehearsalConnection(process.argv[2],'fresh');
const client=new pg.Client({connectionString:connection});
const checks=[];
await client.connect();await client.query('BEGIN');
try{
  const owner=randomUUID(),event=randomUUID(),ticket=randomUUID(),layout=randomUUID(),tariff=randomUUID();
  await client.query(`INSERT INTO "User" (id,"updatedAt") VALUES ($1,now())`,[owner]);
  const poster=`/media/posters/${randomUUID()}.webp`,longText='👩🏽‍💻'.repeat(101);
  await client.query(`INSERT INTO "Event" (id,"organizerId",title,description,program,rules,"visitTerms","extraConditions","depositTerms","cancellationTerms",date,time,address,"posterUrl","updatedAt") VALUES ($1,$2,$3,'Description','Program','Rules','Visit','Extra','Historical deposit','Refund','2026-11-01','18:00','Address',$4,now())`,[event,owner,longText,poster]);
  await client.query(`INSERT INTO "EventTranslation" ("eventId",locale,title,address,description,program,origin,"updatedAt") VALUES ($1,'en','Translated','Address EN','Description EN','Program EN','manual',now())`,[event]);
  await client.query(`INSERT INTO "TicketType" (id,"eventId",name,description,price,deposit,currency,"quantityTotal","updatedAt") VALUES ($1,$2,'Ticket','Ticket description',1234,200,'USD',10,now())`,[ticket,event]);
  await client.query(`INSERT INTO "VenueLayout" (id,"eventId","layoutJson","templateName","updatedAt") VALUES ($1,$2,$3,'Legacy hall',now())`,[layout,event,JSON.stringify({editor:{tariffs:[{id:tariff,name:'Stable tariff',price:1234}],objects:[]}})]);
  const before=await financialEvidence(client);
  const run=async()=>{const graph=await loadLegacyGraph(client,event,true),plan=planLegacyEvent(graph),prepared=await prepareActions(client,graph,plan);await applyEventPlan(client,graph,plan,prepared);return{graph,plan,prepared};};
  const first=await run();
  assert.ok(first.prepared.actions.length);checks.push('bounded event application writes normalized content');
  const source=(await client.query(`SELECT * FROM "EventContent" WHERE "eventId"=$1 AND locale='ru'`,[event])).rows[0];
  assert.equal(source.title,longText);for(const section of ['Description','Program','Rules','Visit','Extra','Historical deposit'])assert.ok(source.description.includes(section));checks.push('overlength originals and labelled sections retained');
  const snapshot=(await client.query(`SELECT original FROM "LegacyEventSnapshot" WHERE "eventId"=$1`,[event])).rows[0].original;
  assert.equal(snapshot.event.title,longText);assert.equal(snapshot.event.depositTerms,'Historical deposit');assert.equal(snapshot.translations[0].origin,'manual');assert.equal(snapshot.translations[0].program,'Program EN');checks.push('source/target text and provenance archived');
  const state=(await client.query(`SELECT "endsAt","refundsAvailable","v2State" FROM "Event" WHERE id=$1`,[event])).rows[0];
  assert.deepEqual(state,{endsAt:null,refundsAvailable:null,v2State:'review'});checks.push('unknown ends and policies require review');
  const links=(await client.query(`SELECT m.slot,m."isCard",m."isBackground",a.state,a."legacyReference" FROM "EventMedia" m JOIN "MediaAsset" a ON a.id=m."assetId" WHERE m."eventId"=$1`,[event])).rows;
  assert.deepEqual(links,[{slot:0,isCard:true,isBackground:true,state:'legacy',legacyReference:poster}]);checks.push('trusted poster ordered and assigned both roles without claiming readiness');
  const second=await run();assert.equal(second.prepared.actions.length,0);
  assert.equal((await client.query(`SELECT revision FROM "EventContent" WHERE "eventId"=$1 AND locale='ru'`,[event])).rows[0].revision,source.revision);
  assert.equal((await client.query(`SELECT count(*)::int AS n FROM "LegacyEventSnapshot" WHERE "eventId"=$1`,[event])).rows[0].n,1);checks.push('repeat converges without duplicate snapshots/revisions/resources');
  await client.query(`UPDATE "EventContent" SET title='New editor title',"managedBy"='editor',"legacyHash"=NULL WHERE "eventId"=$1 AND locale='ru'`,[event]);
  await client.query(`UPDATE "Event" SET title='Later old writer title' WHERE id=$1`,[event]);
  const third=await run();assert.ok(third.prepared.reasons.some(reason=>reason.startsWith('new_edits_preserved:EventContent')));
  assert.equal((await client.query(`SELECT title FROM "EventContent" WHERE "eventId"=$1 AND locale='ru'`,[event])).rows[0].title,'New editor title');checks.push('new editor content survives later old writer/backfill');
  await client.query(`UPDATE "TicketTypeContent" SET name='Unmarked new edit' WHERE "ticketTypeId"=$1`,[ticket]);
  const fourth=await run();assert.ok(fourth.prepared.reasons.some(reason=>reason.startsWith('new_edits_preserved:TicketTypeContent')));assert.equal((await client.query(`SELECT name FROM "TicketTypeContent" WHERE "ticketTypeId"=$1`,[ticket])).rows[0].name,'Unmarked new edit');checks.push('hash mismatch protects edits even without managedBy marker');
  assert.deepEqual(await financialEvidence(client),before);checks.push('all financial/history/inventory rows unchanged');
  await client.query('SET CONSTRAINTS ALL IMMEDIATE');
}finally{await client.query('ROLLBACK');await client.end();}

// Real transactional compatibility writes. Throwing a sentinel rolls every
// fixture/dual write back; no testing against the inventoried source database.
process.env.DATABASE_URL=connection;
const {prisma,saveEventContentV2,eventV2CompatibilityRead}=await import('../dist/index.js');
const rollback=new Error('rollback-only successful verification');
try{
  await prisma.$transaction(async tx=>{
    const owner=await tx.user.create({data:{}});
    const event=await tx.event.create({data:{organizerId:owner.id,title:'Source',description:'Merged',address:'Address',date:new Date('2026-11-01'),time:new Date('1970-01-01T18:00Z')}});
    await tx.eventContent.create({data:{eventId:event.id,locale:'ru',title:'Source',description:'Merged',address:'Address',managedBy:'legacy'}});
    await tx.eventContent.create({data:{eventId:event.id,locale:'en',title:'Translation',fieldMetadata:{title:{origin:'manual',sourceHash:null,reviewed:true,stale:false,revision:1}}}});
    const row=await saveEventContentV2(tx,event.id,'ru',{title:'New source'},event.revision,true);
    assert.equal(row.address,'Address');
    const legacy=await tx.event.findUniqueOrThrow({where:{id:event.id}});assert.equal(legacy.title,'New source');assert.equal(legacy.address,'Address');assert.equal(legacy.revision,event.revision+1);checks.push('source dual write retains untouched fields and increments exactly once');
    const target=await tx.eventContent.findUniqueOrThrow({where:{eventId_locale:{eventId:event.id,locale:'en'}}});assert.equal(target.title,'Translation');assert.equal(target.fieldMetadata.title.stale,true);checks.push('source edit marks translations stale without overwriting manual text');
    await assert.rejects(()=>saveEventContentV2(tx,event.id,'ru',{title:'Conflict'},event.revision,true),/DRAFT_REVISION_CONFLICT/);checks.push('stale revision rejected under database row lock');
    await saveEventContentV2(tx,event.id,'kk',{title:'Partial target'},legacy.revision,true);
    assert.equal(await tx.eventTranslation.count({where:{eventId:event.id,locale:'kk'}}),0);checks.push('partial targets stay partial without synthetic legacy fallback');
    assert.equal((await eventV2CompatibilityRead(tx,legacy,true)).title,'New source');checks.push('unreconciled read remains on mirrored legacy projection');
    throw rollback;
  },{timeout:10000});
}catch(error){if(error!==rollback)throw error;}
finally{await prisma.$disconnect();}
await writeFile('docs/event-creation-v2/batch-3-backfill-checks.json',JSON.stringify({at:new Date().toISOString(),checks,rolledBack:true},null,2)+'\n');
console.log(JSON.stringify({passed:checks.length,rolledBack:true}));
