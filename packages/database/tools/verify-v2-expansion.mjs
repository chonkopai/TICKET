import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { pg, rehearsalConnection } from './v2-rehearsal-lib.mjs';

const client = new pg.Client({ connectionString: await rehearsalConnection(process.argv[2], 'fresh') });
const checks = [];
await client.connect();
await client.query('BEGIN');
try {
  const owner = randomUUID(), event = randomUUID(), other = randomUUID();
  await client.query(`INSERT INTO "User" (id,"updatedAt") VALUES ($1,now())`, [owner]);
  for (const id of [event, other]) await client.query(`INSERT INTO "Event" (id,"organizerId",title,date,time,"venueName",address,"updatedAt") VALUES ($1,$2,'Legacy','2026-11-01','18:00','Venue','Address',now())`, [id,owner]);
  async function rejects(name, sql, values = [], code = '23514', deferred = false) {
    await client.query('SAVEPOINT negative');
    let error;
    try { await client.query(sql, values); if(deferred) await client.query('SET CONSTRAINTS ALL IMMEDIATE'); }
    catch (caught) { error = caught; }
    await client.query('ROLLBACK TO SAVEPOINT negative');
    assert.equal(error?.code, code, name); checks.push(name);
  }
  await rejects('invalid locale',`INSERT INTO "EventContent" ("eventId",locale,"updatedAt") VALUES ($1,'fr',now())`,[event]);
  await client.query(`INSERT INTO "EventContent" ("eventId",locale,title,"updatedAt") VALUES ($1,'en','Partial',now())`,[event]);
  checks.push('partial optional locale remains legal');
  await rejects('duplicate locale',`INSERT INTO "EventContent" ("eventId",locale,"updatedAt") VALUES ($1,'en',now())`,[event],'23505');
  await rejects('missing content owner',`INSERT INTO "EventContent" ("eventId",locale,"updatedAt") VALUES ($1,'ru',now())`,[randomUUID()],'23503');
  await rejects('end before start',`UPDATE "Event" SET "startsAt"=now(),"endsAt"=now()-interval '1 hour' WHERE id=$1`,[event]);
  await rejects('unpaired coordinates',`UPDATE "Event" SET latitude=20 WHERE id=$1`,[event]);
  await rejects('incomplete ready asset',`INSERT INTO "MediaAsset" (id,"eventId",kind,state,"updatedAt") VALUES ($1,$2,'image','ready',now())`,[randomUUID(),event]);
  const image=randomUUID(), video=randomUUID(), image2=randomUUID();
  for(const [id,kind] of [[image,'image'],[video,'video'],[image2,'image']]) await client.query(`INSERT INTO "MediaAsset" (id,"eventId",kind,state,"updatedAt") VALUES ($1,$2,$3,'legacy',now())`,[id,event,kind]);
  await client.query(`INSERT INTO "EventMedia" ("eventId","assetId",slot,"isCard","isBackground") VALUES ($1,$2,0,true,true)`,[event,image]);
  await rejects('video cannot be card',`INSERT INTO "EventMedia" ("eventId","assetId",slot,"isCard") VALUES ($1,$2,1,true)`,[event,video]);
  await rejects('card cannot change to video',`UPDATE "MediaAsset" SET kind='video' WHERE id=$1`,[image]);
  await rejects('sixth slot',`INSERT INTO "EventMedia" ("eventId","assetId",slot) VALUES ($1,$2,5)`,[event,video]);
  await rejects('singleton card',`INSERT INTO "EventMedia" ("eventId","assetId",slot,"isCard") VALUES ($1,$2,1,true)`,[event,image2],'23505');
  await rejects('singleton background',`INSERT INTO "EventMedia" ("eventId","assetId",slot,"isBackground") VALUES ($1,$2,1,true)`,[event,video],'23505');
  await rejects('cross-event attachment',`INSERT INTO "EventMedia" ("eventId","assetId",slot) VALUES ($1,$2,0)`,[other,image],'23503',true);
  const draft=randomUUID();
  const draftSQL=`INSERT INTO "EventCreationDraft" (id,"capabilityHash","capabilityExpiresAt","expiresAt",aggregate,"updatedAt") VALUES ($1,$2,now()+interval '1 day',now()+interval '2 days',$3,now())`;
  await rejects('unversioned draft rejected',draftSQL,[draft,'a'.repeat(64),'{}']);
  await client.query(draftSQL,[draft,'a'.repeat(64),'{"version":2}']);
  await rejects('claimed capability revoked',`UPDATE "EventCreationDraft" SET state='claimed',"ownerId"=$1 WHERE id=$2`,[owner,draft]);
  const intentSQL=`INSERT INTO "EventPublishIntent" (id,"draftId",revision,"aggregateHash","browserHash","expiresAt") VALUES ($1,$2,1,$3,$3,now()+interval '10 minutes')`;
  await client.query(intentSQL,[randomUUID(),draft,'b'.repeat(64)]);
  await rejects('one intent per draft revision',intentSQL,[randomUUID(),draft,'b'.repeat(64)],'23505');
  await rejects('intent consumption needs result',`UPDATE "EventPublishIntent" SET "consumedAt"=now() WHERE "draftId"=$1`,[draft]);
  await rejects('publication requires ready roles and source',`UPDATE "Event" SET status='published',"v2State"='reconciled',"saleMode"='paid_general',currency='KZT',"startsAt"=now(),"endsAt"=now()+interval '1 day',"refundsAvailable"=false,"refundPolicyRevision"=1 WHERE id=$1`,[event],'23514',true);
  await client.query(`UPDATE "Event" SET "v2State"='review',"legacyFingerprint"=$2 WHERE id=$1`,[event,'c'.repeat(64)]);
  await client.query(`UPDATE "Event" SET title='Old writer changed title' WHERE id=$1`,[event]);
  const dirty=(await client.query(`SELECT "v2State","legacyFingerprint" FROM "Event" WHERE id=$1`,[event])).rows[0];
  assert.deepEqual(dirty,{v2State:'dirty',legacyFingerprint:null});checks.push('old writes invalidate normalized reads');
  await client.query(`INSERT INTO "EventContent" ("eventId",locale,title,summary,description,"venueName",address,"updatedAt") VALUES ($1,'ru','Source','Summary','Description','Venue','Address',now())`,[event]);
  await client.query(`UPDATE "MediaAsset" SET state='ready',"storageKey"=$2,"contentType"='image/webp',bytes=100,width=100,height=100,checksum=$3 WHERE id=$1`,[image,`test/${image}`,'e'.repeat(64)]);
  await client.query(`UPDATE "Event" SET status='published',"v2State"='reconciled',"saleMode"='paid_general',currency='KZT',"startsAt"=now(),"endsAt"=now()+interval '1 day',"refundsAvailable"=false,"refundPolicyRevision"=1 WHERE id=$1`,[event]);
  await client.query('SET CONSTRAINTS ALL IMMEDIATE');await client.query('SET CONSTRAINTS ALL DEFERRED');checks.push('complete source and ready singleton roles pass publication constraints');
  await rejects('published source deletion rejected',`DELETE FROM "EventContent" WHERE "eventId"=$1 AND locale='ru'`,[event],'23514',true);
  await rejects('published source move validates old owner',`UPDATE "EventContent" SET "eventId"=$2 WHERE "eventId"=$1 AND locale='ru'`,[event,other],'23514',true);
  await rejects('published card deletion rejected',`DELETE FROM "EventMedia" WHERE "eventId"=$1`,[event],'23514',true);
  await rejects('published ready asset downgrade rejected',`UPDATE "MediaAsset" SET state='failed' WHERE id=$1`,[image],'23514',true);
  await client.query(`UPDATE "Event" SET status='draft' WHERE id=$1`,[event]);
  // Archive and legacy assets survive deletion of an unpublished, unused event.
  await client.query(`INSERT INTO "LegacyEventSnapshot" ("eventId",fingerprint,original) VALUES ($1,$2,'{}')`,[event,'d'.repeat(64)]);
  await client.query(`DELETE FROM "Event" WHERE id=$1`,[event]);
  assert.equal((await client.query(`SELECT "eventId" FROM "MediaAsset" WHERE id=$1`,[image])).rows[0].eventId,null);
  assert.equal((await client.query(`SELECT count(*)::int AS n FROM "LegacyEventSnapshot" WHERE "eventId"=$1`,[event])).rows[0].n,1);
  checks.push('unused legacy deletion retains asset and archival provenance');
  await client.query('SET CONSTRAINTS ALL IMMEDIATE');
  await writeFile('docs/event-creation-v2/batch-2-expansion-checks.json',JSON.stringify({at:new Date().toISOString(),checks,rolledBack:true},null,2)+'\n');
  console.log(JSON.stringify({passed:checks.length,rolledBack:true}));
} finally { await client.query('ROLLBACK');await client.end(); }
