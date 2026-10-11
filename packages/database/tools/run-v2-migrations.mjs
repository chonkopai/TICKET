import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pg, assertIsolated } from './v2-rehearsal-lib.mjs';
const directory=process.argv[2];if(!directory)throw new Error('Rehearsal directory required');
const connections=JSON.parse(await readFile(resolve(directory,'connections.json'),'utf8'));
const root=fileURLToPath(new URL('../../../',import.meta.url));
const report={at:new Date().toISOString(),databases:{},schemaDifferences:[],initialMigrationChecksumMismatch:null};
const catalog=async(client)=>{
  const columns=(await client.query(`SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name<>'_prisma_migrations' ORDER BY table_name,ordinal_position`)).rows;
  const constraints=(await client.query(`SELECT c.relname AS table_name,p.conname AS name,pg_get_constraintdef(p.oid) AS definition,p.convalidated FROM pg_constraint p JOIN pg_class c ON c.oid=p.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY 1,2`)).rows;
  const indexes=(await client.query(`SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY 1,2`)).rows;
  const triggers=(await client.query(`SELECT c.relname AS table_name,t.tgname AS name,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY 1,2`)).rows;
  const functions=(await client.query(`SELECT p.proname AS name,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' ORDER BY 1,2`)).rows;
  const enums=(await client.query(`SELECT t.typname AS name,e.enumlabel AS label,e.enumsortorder AS position FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' ORDER BY 1,3`)).rows;
  return{columns,constraints,indexes,triggers,functions,enums};
};
const catalogs={};
for(const kind of ['fresh','legacy']){
  const connection=connections[kind];const url=new URL(connection);
  assertIsolated(connection);
  const client=new pg.Client({connectionString:connection});await client.connect();
  try{
    const before=(await client.query(`SELECT count(*)::text AS events FROM "Event"`).catch(()=>({rows:[{events:'0'}]}))).rows[0];
    const output=execFileSync(resolve(root,'packages/database/node_modules/.bin/prisma'),['migrate','deploy'],{cwd:resolve(root,'packages/database'),env:{...process.env,DATABASE_URL:connection},encoding:'utf8',maxBuffer:1024**2});
    report.databases[kind]={name:url.pathname.slice(1),eventsBefore:before.events,eventsAfter:(await client.query(`SELECT count(*)::text AS events FROM "Event"`)).rows[0].events,migrationOutput:output.replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[connection redacted]')};
    catalogs[kind]=await catalog(client);
    if(kind==='legacy')report.initialMigrationChecksumMismatch=(await client.query(`SELECT migration_name,checksum FROM "_prisma_migrations" WHERE migration_name='20260902023000_init_core_schema'`)).rows;
  }finally{await client.end();}
}
for(const category of Object.keys(catalogs.fresh)){
  const fresh=catalogs.fresh[category].map(x=>JSON.stringify(x)),legacy=catalogs.legacy[category].map(x=>JSON.stringify(x));
  const onlyFresh=fresh.filter(x=>!legacy.includes(x)).map(x=>JSON.parse(x)),onlyLegacy=legacy.filter(x=>!fresh.includes(x)).map(x=>JSON.parse(x));
  if(onlyFresh.length||onlyLegacy.length)report.schemaDifferences.push({category,onlyFresh,onlyLegacy});
}
await writeFile(resolve(root,process.argv[3]??'docs/event-creation-v2/batch-2-migration-rehearsal.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({databases:Object.fromEntries(Object.entries(report.databases).map(([key,value])=>[key,{name:value.name,eventsBefore:value.eventsBefore,eventsAfter:value.eventsAfter}])),schemaDifferenceCategories:report.schemaDifferences.length}));
