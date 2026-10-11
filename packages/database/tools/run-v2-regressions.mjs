import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { rehearsalConnection, assertIsolated } from './v2-rehearsal-lib.mjs';

const connection=await rehearsalConnection(process.argv[2],'fresh');
const database=assertIsolated(connection),root=process.cwd();
const env={...process.env,PATH:`${resolve(root,'packages/database/node_modules/.bin')}:${process.env.PATH??''}`,DATABASE_URL:connection,VERIFICATION_TEST_DATABASE_URL:connection,GOOGLE_AUTH_DB_TEST:'true',EVENT_CONTENT_V2_ENABLED:'false',NODE_ENV:'test'};
const report={at:new Date().toISOString(),database,scope:'Seeded isolated fresh database; no source/production mutation',steps:[]};
const outputDir=resolve(root,'docs/event-creation-v2/regression-logs');await mkdir(outputDir,{recursive:true});
const redact=value=>value.replace(/postgres(?:ql)?:\/\/[^\s"']+/g,'[connection redacted]');
for(const [name,command,args,cwd] of [
  ['seed',resolve(root,'packages/database/node_modules/.bin/prisma'),['db','seed'],resolve(root,'packages/database')],
  ['tests','pnpm',['test','--env-mode=loose','--force'],root],
  ['verify','pnpm',['db:verify'],root],
]){
  let output='';const startedAt=new Date().toISOString();
  const code=await new Promise((resolveResult,reject)=>{
    const child=spawn(command,args,{cwd,env,stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',chunk=>{output+=chunk.toString();});child.stderr.on('data',chunk=>{output+=chunk.toString();});
    child.on('error',reject);child.on('close',resolveResult);
  });
  await writeFile(resolve(outputDir,`${name}.log`),redact(output),{mode:0o600});
  report.steps.push({name,startedAt,completedAt:new Date().toISOString(),exitCode:code,log:`regression-logs/${name}.log`});
  console.log(JSON.stringify({name,exitCode:code,tail:redact(output).slice(-3000)}));
  await writeFile(resolve(root,'docs/event-creation-v2/batches-1-3-regressions.json'),JSON.stringify(report,null,2)+'\n');
  if(code!==0){process.exitCode=1;break;}
}
