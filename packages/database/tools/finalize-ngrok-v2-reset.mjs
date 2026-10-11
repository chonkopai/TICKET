import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {pg} from './v2-rehearsal-lib.mjs';

// Narrow, authorized local event/purchase reset. Unrelated operational rows and
// reusable venue templates are retained; there is no TRUNCATE or schema removal.
const directory=process.argv[2];
const connections=JSON.parse(await readFile(join(directory,'connections.json'),'utf8'));
const report=JSON.parse(await readFile(join(directory,'report.json'),'utf8'));
const url=new URL(connections.source);
assert.ok(['localhost','127.0.0.1'].includes(url.hostname));
assert.equal(url.pathname,'/event_platform');assert.equal(process.env.DATABASE_URL,connections.target);
assert.equal(report.databaseBackup.allRestoredRowsEqual,true);
assert.equal(JSON.parse(await readFile('docs/event-creation-v2/ngrok-v2-smoke.json','utf8')).passed,true);
assert.equal(JSON.parse(await readFile('docs/event-creation-v2/ngrok-smoke-cleanup.json','utf8')).originalUserRowsEqual,true);
const rehearse=process.argv.includes('--rehearse');
const client=new pg.Client({connectionString:rehearse?connections.restore:connections.source});await client.connect();
const quote=value=>'"'+value.replaceAll('"','""')+'"';
async function fingerprint(table,where='TRUE',args=[]){return (await client.query(`SELECT count(*)::text AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM ${quote(table)} t WHERE ${where}`,args)).rows[0];}
try{
 await client.query('BEGIN');
 const tables=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(x=>x.tablename);
 for(const table of tables)assert.deepEqual(await fingerprint(table),report.originalRows[table],'Original database changed after backup; review before removal');
 const posterKeys=new Set((await client.query('SELECT "posterUrl" FROM "Event"')).rows.map(x=>x.posterUrl?.match(/^\/media\/posters\/([^/]+)$/)?.[1]).filter(Boolean));
 await client.query('CREATE TEMP TABLE reset_resource(id text PRIMARY KEY) ON COMMIT DROP');
 // Include only rows connected to the original events or their purchases.
 const scopes={Event:'TRUE',Order:'TRUE',TicketType:'"eventId" IN (SELECT id FROM "Event")',VenueLayout:'"eventId" IN (SELECT id FROM "Event")',VenueRow:'"venueLayoutId" IN (SELECT id FROM "VenueLayout" WHERE "eventId" IS NOT NULL)',Table:'"venueLayoutId" IN (SELECT id FROM "VenueLayout" WHERE "eventId" IS NOT NULL)',Seat:'"venueLayoutId" IN (SELECT id FROM "VenueLayout" WHERE "eventId" IS NOT NULL)',Ticket:'"orderId" IN (SELECT id FROM "Order")',Booking:'"orderId" IN (SELECT id FROM "Order")',Payment:'"orderId" IN (SELECT id FROM "Order")',Deposit:'"eventId" IN (SELECT id FROM "Event")',RefundRequest:'"orderId" IN (SELECT id FROM "Order")',GroupPass:'"orderId" IN (SELECT id FROM "Order")',SeatAllocation:'"orderId" IN (SELECT id FROM "Order")',TicketReservation:'"orderId" IN (SELECT id FROM "Order")',TicketEmailDelivery:'"orderId" IN (SELECT id FROM "Order")',AnonymousCheckoutSession:'"orderId" IN (SELECT id FROM "Order")',Broadcast:'"eventId" IN (SELECT id FROM "Event")',ChatMessage:'"eventId" IN (SELECT id FROM "Event")',TableHold:'"tableId" IN (SELECT id FROM "Table" WHERE "venueLayoutId" IN (SELECT id FROM "VenueLayout" WHERE "eventId" IS NOT NULL))'};
 for(const [table,scope]of Object.entries(scopes))await client.query(`INSERT INTO reset_resource SELECT id::text FROM ${quote(table)} WHERE ${scope} ON CONFLICT DO NOTHING`);
 const ids=(await client.query('SELECT id FROM reset_resource')).rows.map(x=>x.id);
 const references=field=>`EXISTS(SELECT 1 FROM jsonb_path_query(${field},'$.**') j(value) WHERE j.value #>> '{}' = ANY($1::text[]))`;
 const operational={AuditLog:`"entityId"=ANY($1::text[]) OR ${references('meta')}`,OutboxEvent:`"aggregateId"=ANY($1::text[]) OR ${references('payload')}`,IdempotencyRecord:`"resourceId"::text=ANY($1::text[]) OR ${references('response')}`,Notification:`"eventId"::text=ANY($1::text[]) OR "broadcastId"::text=ANY($1::text[]) OR ${references('payload')}`,WebhookEvent:'"orderId"::text=ANY($1::text[]) OR "paymentId"::text=ANY($1::text[])'};
 const preserved={};for(const [table,scope]of Object.entries(operational))preserved[table]=await fingerprint(table,`NOT coalesce((${scope}),false)`,[ids]);
 preserved.VenueLayout=await fingerprint('VenueLayout','"eventId" IS NULL');
 preserved.AnonymousCheckoutSession=await fingerprint('AnonymousCheckoutSession','"orderId" IS NULL');
 const deleted={};
 for(const [table,scope]of Object.entries(operational))deleted[table]=(await client.query(`DELETE FROM ${quote(table)} WHERE ${scope}`,[ids])).rowCount;
 for(const table of ['RefundRequest','AnonymousCheckoutSession','Broadcast'])deleted[table]=(await client.query(`DELETE FROM ${quote(table)} WHERE ${scopes[table]}`)).rowCount;
 deleted.Order=(await client.query('DELETE FROM "Order"')).rowCount;
 deleted.Event=(await client.query('DELETE FROM "Event"')).rowCount;
 for(const table of [...report.accounts,'_prisma_migrations','TelegramUpdate'])assert.deepEqual(await fingerprint(table),report.originalRows[table],table+' must be retained exactly');
 for(const [table,scope]of Object.entries(operational))assert.deepEqual(await fingerprint(table,`NOT coalesce((${scope}),false)`,[ids]),preserved[table],table+' unrelated rows must be unchanged');
 assert.deepEqual(await fingerprint('VenueLayout','"eventId" IS NULL'),preserved.VenueLayout);
 assert.deepEqual(await fingerprint('AnonymousCheckoutSession','"orderId" IS NULL'),preserved.AnonymousCheckoutSession);
 if(rehearse){
  await client.query('ROLLBACK');console.log(JSON.stringify({rehearsalPassed:true,deleted,unrelatedRowsPreserved:preserved,transactionRolledBack:true}));
 }else{
 await client.query('COMMIT');
 report.finalized={at:new Date().toISOString(),scope:'Original events/purchases and their verified relations only; unrelated operational rows and reusable venue templates retained',deleted,unrelatedRowsPreserved:preserved,originalAccountsPreserved:true,backupRetained:true,azureTouched:false};
 const preservedPhotos=new Set();const target=new pg.Client({connectionString:connections.target,options:'-c default_transaction_read_only=on'});await target.connect();
 try{for(const row of (await target.query('SELECT "photoUrl" FROM "User"')).rows){const key=row.photoUrl?.match(/^\/media\/posters\/([^/]+)$/)?.[1];if(key)preservedPhotos.add(key);}}finally{await target.end();}
 let removedFiles=0;
 for(const file of report.media.posters.manifest){if(preservedPhotos.has(file.key))continue;assert.ok(posterKeys.has(file.key),'Remove only media referenced by a deleted event');const path=join(report.media.posters.source,file.key),body=await readFile(path);assert.equal(createHash('sha256').update(body).digest('hex'),file.sha256);await unlink(path);removedFiles++;}
 report.finalized.legacyLocalMediaRemoved=removedFiles;
 const adminUrl=new URL(url);adminUrl.pathname='/postgres';const admin=new pg.Client({connectionString:adminUrl.toString()});await admin.connect();
 try{assert.ok(/^event_platform_ngrok_backup_\d+$/.test(report.restore));await admin.query('DROP DATABASE '+quote(report.restore));}finally{await admin.end();}
 await writeFile(join(directory,'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
 await writeFile('docs/event-creation-v2/ngrok-reset-evidence.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report.finalized));
 }
}catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}
