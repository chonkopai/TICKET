import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { mkdtemp, chmod, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";

const require = createRequire(import.meta.url);
const pg = require(require.resolve("pg", {paths:[dirname(require.resolve("@prisma/adapter-pg"))]}));
const source = new URL(process.env.DATABASE_URL || "");
if (!['localhost','127.0.0.1','[::1]'].includes(source.hostname) || source.pathname !== '/event_platform') throw new Error("Expected authorized local source event_platform");
const container = 'event-platform-postgres-1';
const stamp = Date.now().toString();
const names = {fresh:`event_platform_v2_fresh_${stamp}`,legacy:`event_platform_v2_legacy_${stamp}`};
const directory = await mkdtemp(resolve(tmpdir(),'ticket-v2-rehearsal-'));
await chmod(directory,0o700);
const adminUrl=new URL(source);adminUrl.pathname='/postgres';
const admin=new pg.Client({connectionString:adminUrl.toString(),connectionTimeoutMillis:5000});
try {
  await admin.connect();
  const dump=execFileSync('docker',['exec',container,'pg_dump','--username',decodeURIComponent(source.username),'--dbname','event_platform','--format=custom','--no-owner','--no-privileges','--serializable-deferrable'],{maxBuffer:128*1024**2});
  await writeFile(resolve(directory,'legacy.dump'),dump,{mode:0o600});
  for(const name of Object.values(names))await admin.query(`CREATE DATABASE "${name}"`);
  execFileSync('docker',['exec','-i',container,'pg_restore','--username',decodeURIComponent(source.username),'--dbname',names.legacy,'--no-owner','--no-privileges','--exit-on-error'],{input:dump,maxBuffer:1024**2});
  const urls=Object.fromEntries(Object.entries(names).map(([kind,name])=>{const url=new URL(source);url.pathname=`/${name}`;return[kind,url.toString()]}));
  await writeFile(resolve(directory,'connections.json'),JSON.stringify(urls),{mode:0o600});
  const manifest={createdAt:new Date().toISOString(),directory,names,source:{host:source.hostname,database:'event_platform'},sourceAccess:'pg_dump snapshot only; no writes or termination',dumpPath:resolve(directory,'legacy.dump')};
  await writeFile(resolve(directory,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
  console.log(JSON.stringify(manifest));
} catch(error) {
  console.error(JSON.stringify({code:error.code||'REHEARSAL_PREPARE_FAILED',name:error.name}));process.exitCode=1;
} finally {await admin.end();}
