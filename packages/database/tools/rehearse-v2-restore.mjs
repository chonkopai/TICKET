import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chmod,cp,mkdtemp,readFile,readdir,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pg,rehearsalConnection,assertIsolated} from './v2-rehearsal-lib.mjs';
import {cutoverObservation} from './v2-cutover-observation.mjs';

const [sourceDirectory,mediaDirectory,output]=process.argv.slice(2);
if(!sourceDirectory||!mediaDirectory||!output)throw Error('Use rehearsal-directory private-media-directory output.json');
const media=resolve(mediaDirectory);
if(!media.startsWith('/private/tmp/')&&!media.startsWith('/var/folders/')&&!media.startsWith('/private/var/folders/'))throw Error('Expected isolated temporary media storage');
const destination=await mkdtemp(join(tmpdir(),'ticket-v2-restore-'));await chmod(destination,0o700);
const container='event-platform-postgres-1',stamp=Date.now();
const report={at:new Date().toISOString(),scope:'Isolated databases and temporary media only; no source/production writes',privateBackupDirectory:destination,databases:{},media:{},passed:false};
const connections={};
async function tableEvidence(connection) {
 const client=new pg.Client({connectionString:connection,options:'-c default_transaction_read_only=on'});await client.connect();
 try {await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const tables=(await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`)).rows;const rows={};
 for(const {tablename}of tables){const name='"'+tablename.replaceAll('"','""')+'"';rows[tablename]=(await client.query(`SELECT count(*)::text AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM ${name} t`)).rows[0];}return rows;
 }finally{await client.query('ROLLBACK');await client.end();}
}
async function files(directory,relative='') {
 const result=[];for(const entry of await readdir(join(directory,relative),{withFileTypes:true})){const key=join(relative,entry.name);if(entry.isSymbolicLink())throw Error('Media symlinks cannot be backed up by this rehearsal');if(entry.isDirectory())result.push(...await files(directory,key));else {const body=await readFile(join(directory,key));result.push({key,bytes:body.length,sha256:createHash('sha256').update(body).digest('hex')});}}return result.sort((a,b)=>a.key.localeCompare(b.key));
}
for(const [i,kind]of ['fresh','legacy'].entries()) {
 const source=await rehearsalConnection(sourceDirectory,kind),url=new URL(source),sourceName=assertIsolated(source),restoreName=`event_platform_v2_${kind}_${stamp+i}`;
 const before=await tableEvidence(source),observation=await cutoverObservation(source);
 const dump=execFileSync('docker',['exec',container,'pg_dump','--username',decodeURIComponent(url.username),'--dbname',sourceName,'--format=custom','--no-owner','--no-privileges','--serializable-deferrable'],{maxBuffer:256*1024**2});
 await writeFile(join(destination,kind+'.dump'),dump,{mode:0o600});
 const adminUrl=new URL(url);adminUrl.pathname='/postgres';const admin=new pg.Client({connectionString:adminUrl.toString()});await admin.connect();try{await admin.query(`CREATE DATABASE "${restoreName}"`);}finally{await admin.end();}
 execFileSync('docker',['exec','-i',container,'pg_restore','--username',decodeURIComponent(url.username),'--dbname',restoreName,'--no-owner','--no-privileges','--exit-on-error'],{input:dump,maxBuffer:1024**2});
 const restoreUrl=new URL(url);restoreUrl.pathname='/'+restoreName;const restored=restoreUrl.toString();assertIsolated(restored);connections[kind]=restored;
 const after=await tableEvidence(restored),delta=await tableEvidence(source);assert.deepEqual(after,before,'Restored rows must match including snapshots and all normalized content');assert.deepEqual(delta,before,'Source changed during backup: repeat with quiesced writers');
 report.databases[kind]={source:sourceName,restored:restoreName,dumpBytes:dump.length,dumpSha256:createHash('sha256').update(dump).digest('hex'),tables:before,restoredAllRowsEqual:true,finalDeltaEqual:true,pending:observation.pending,financial:observation.financial};
}
const beforeFiles=await files(media),backupMedia=join(destination,'media-backup'),restoredMedia=join(destination,'media-restored');await cp(media,backupMedia,{recursive:true,errorOnExist:true});await cp(backupMedia,restoredMedia,{recursive:true,errorOnExist:true});assert.deepEqual(await files(restoredMedia),beforeFiles);assert.deepEqual(await files(media),beforeFiles);
report.media={source:media,restored:restoredMedia,files:beforeFiles,bytes:beforeFiles.reduce((total,file)=>total+file.bytes,0),allBytesEqual:true,legacyExternalUrlsFetched:false};
// Verify every ready, published non-legacy asset resolves in the restored storage.
const client=new pg.Client({connectionString:connections.fresh,options:'-c default_transaction_read_only=on'});await client.connect();try{const assets=(await client.query(`SELECT DISTINCT a.id,a.derivatives FROM "MediaAsset" a JOIN "EventMedia" m ON m."assetId"=a.id WHERE a.state='ready' AND a."legacyReference" IS NULL`)).rows;for(const asset of assets){for(const variant of new Set(['original',...Object.values(asset.derivatives).filter(value=>typeof value==='string')])){assert.ok(['original','display.webp','thumb.webp','poster.webp','safe.mp4'].includes(variant),'Unexpected media variant');assert.ok((await stat(join(restoredMedia,asset.id,variant))).size>0);}}report.media.publishedReadyAssetsResolved=assets.length;}finally{await client.end();}
await writeFile(join(destination,'connections.json'),JSON.stringify(connections),{mode:0o600});report.passed=true;await writeFile(output,JSON.stringify(report,null,2)+'\n');await writeFile(join(destination,'manifest.json'),JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({passed:true,directory:destination,databases:Object.fromEntries(Object.entries(report.databases).map(([kind,value])=>[kind,{restored:value.restored,tables:Object.keys(value.tables).length,finalDeltaEqual:true}])),media:report.media.files.length}));
