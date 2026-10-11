import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chmod,cp,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pg} from './v2-rehearsal-lib.mjs';
import {loadApiEnv} from '../../config/dist/index.js';

// Authorized local ngrok reset only. Never accepts a remote/Azure source.
const env=loadApiEnv(),source=new URL(env.DATABASE_URL);
assert.ok(['localhost','127.0.0.1'].includes(source.hostname));
assert.equal(source.pathname,'/event_platform');
const root=process.cwd(),stamp=Date.now(),directory=resolve(root,`var/ngrok-reset-${stamp}`);
await mkdir(directory,{recursive:true,mode:0o700});await chmod(directory,0o700);
const targetName=`event_platform_ngrok_v2_${stamp}`,restoreName=`event_platform_ngrok_backup_${stamp}`;
const urls={source:source.toString(),target:new URL(source),restore:new URL(source)};
urls.target.pathname='/'+targetName;urls.restore.pathname='/'+restoreName;
const accounts=['User','ContactIdentity','GoogleIdentity','OrganizerProfile','UserNotificationPreference','RefreshToken','TelegramLinkToken','VerificationChallenge','VerificationGrant','VerificationRateLimit','GoogleLoginProof'];
const report={at:new Date().toISOString(),scope:'Authorized ngrok test reset only; Azure untouched',directory,source:source.pathname.slice(1),target:targetName,restore:restoreName,accounts,originalRows:{},media:{},passed:false};
async function evidence(connection){
 const client=new pg.Client({connectionString:connection,options:'-c default_transaction_read_only=on'});await client.connect();
 try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const result={};
 for(const {tablename}of (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows){const name='"'+tablename.replaceAll('"','""')+'"';result[tablename]=(await client.query(`SELECT count(*)::text AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM ${name} t`)).rows[0];}return result;
 }finally{await client.query('ROLLBACK');await client.end();}
}
async function files(path,relative=''){
 const result=[];let entries;try{entries=await readdir(join(path,relative),{withFileTypes:true});}catch(error){if(error.code==='ENOENT'&&!relative)return result;throw error;}
 for(const entry of entries){const key=join(relative,entry.name);assert.ok(!entry.isSymbolicLink(),'Media symlinks require separate review');if(entry.isDirectory())result.push(...await files(path,key));else{const body=await readFile(join(path,key));result.push({key,bytes:body.length,sha256:createHash('sha256').update(body).digest('hex')});}}return result.sort((a,b)=>a.key.localeCompare(b.key));
}
report.originalRows=await evidence(urls.source);
const container='event-platform-postgres-1',username=decodeURIComponent(source.username);
const dump=execFileSync('docker',['exec',container,'pg_dump','--username',username,'--dbname','event_platform','--format=custom','--no-owner','--no-privileges','--serializable-deferrable'],{maxBuffer:256*1024**2});
await writeFile(join(directory,'original.dump'),dump,{mode:0o600});
await cp(resolve(root,'.env'),join(directory,'original.env'));await chmod(join(directory,'original.env'),0o600);
const adminUrl=new URL(source);adminUrl.pathname='/postgres';const admin=new pg.Client({connectionString:adminUrl.toString()});await admin.connect();
try{for(const name of [restoreName,targetName])await admin.query(`CREATE DATABASE "${name}"`);}finally{await admin.end();}
execFileSync('docker',['exec','-i',container,'pg_restore','--username',username,'--dbname',restoreName,'--no-owner','--no-privileges','--exit-on-error'],{input:dump,maxBuffer:1024**2});
assert.deepEqual(await evidence(urls.restore.toString()),report.originalRows,'Every backed-up original row must restore unchanged');
assert.deepEqual(await evidence(urls.source),report.originalRows,'Source writers must remain quiesced throughout backup');
report.databaseBackup={bytes:dump.length,sha256:createHash('sha256').update(dump).digest('hex'),allRestoredRowsEqual:true,sourceDeltaEqual:true};
for(const [label,setting]of [['posters',env.POSTER_STORAGE_DIR],['draft-media',env.DRAFT_MEDIA_STORAGE_DIR]]){
 const path=resolve(root,'apps/api',setting),before=await files(path),backup=join(directory,`media-${label}`),restored=join(directory,`verified-media-${label}`);
 await mkdir(backup,{recursive:true,mode:0o700});
 if(before.length){await cp(path,backup,{recursive:true});}await cp(backup,restored,{recursive:true});
 assert.deepEqual(await files(restored),before);assert.deepEqual(await files(path),before);
 report.media[label]={source:path,files:before.length,bytes:before.reduce((n,f)=>n+f.bytes,0),allBytesEqual:true,manifest:before};
}
await writeFile(join(directory,'connections.json'),JSON.stringify({source:urls.source,target:urls.target.toString(),restore:urls.restore.toString()}),{mode:0o600});
report.passed=true;await writeFile(join(directory,'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({directory,target:targetName,restore:restoreName,accounts:report.originalRows.User.count,tables:Object.keys(report.originalRows).length,backupVerified:true,media:Object.fromEntries(Object.entries(report.media).map(([k,v])=>[k,v.files]))}));
