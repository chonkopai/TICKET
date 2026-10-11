import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pg} from './v2-rehearsal-lib.mjs';
const directory=process.argv[2];assert.ok(directory);
const connections=JSON.parse(await readFile(join(directory,'connections.json'),'utf8'));
assert.ok(/^\/event_platform_ngrok_v2_\d+$/.test(new URL(connections.target).pathname));
const report=JSON.parse(await readFile(join(directory,'report.json'),'utf8'));
const source=new pg.Client({connectionString:connections.restore,options:'-c default_transaction_read_only=on'}),target=new pg.Client({connectionString:connections.target});
await source.connect();await target.connect();
try{
 await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await target.query('BEGIN');
 const result={};
 for(const table of report.accounts){
  const name='"'+table+'"';
  const columns=(await source.query('SELECT column_name FROM information_schema.columns WHERE table_schema=\'public\' AND table_name=$1 ORDER BY ordinal_position',[table])).rows.map(r=>'"'+r.column_name+'"').join(',');
  const data=(await source.query(`SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb)::text AS rows FROM ${name} t`)).rows[0].rows;
  await target.query(`INSERT INTO ${name} (${columns}) SELECT ${columns} FROM jsonb_populate_recordset(NULL::${name},$1::jsonb)`,[data]);
  const evidence=`SELECT count(*)::text AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM ${name} t`;
  const original=(await source.query(evidence)).rows[0],copied=(await target.query(evidence)).rows[0];assert.deepEqual(copied,original,table+' must be preserved exactly');result[table]=copied;
 }
 await target.query('COMMIT');report.accountPreservation=result;
 const posterDirectory=resolve('var/ngrok-v2/posters'),draftDirectory=resolve('var/ngrok-v2/draft-media');await mkdir(posterDirectory,{recursive:true,mode:0o700});await mkdir(draftDirectory,{recursive:true,mode:0o700});
 const photos=(await source.query('SELECT "photoUrl" FROM "User" WHERE "photoUrl" LIKE \'/media/posters/%\'')).rows;let preservedPhotos=0;
 for(const row of photos){const key=row.photoUrl.match(/^\/media\/posters\/([0-9a-f-]{36}\.(?:jpg|png|webp))$/)?.[1];assert.ok(key,'Unexpected account photo key');const from=join(directory,'media-posters',key);await stat(from);await cp(from,join(posterDirectory,key));preservedPhotos++;}
 report.accountPhotosPreserved=preservedPhotos;report.activeMedia={posters:posterDirectory,drafts:draftDirectory};
 await writeFile(join(directory,'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({accounts:result.User.count,identityTables:Object.keys(result).length,accountPhotosPreserved:preservedPhotos}));
}finally{await source.query('ROLLBACK');await source.end();await target.end();}
