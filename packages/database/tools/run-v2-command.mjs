import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { rehearsalConnection } from './v2-rehearsal-lib.mjs';

const [directory,kind,command,...args]=process.argv.slice(2);
if(!directory||!['fresh','legacy'].includes(kind)||!command)throw new Error('Use directory fresh|legacy command args');
const connection=await rehearsalConnection(directory,kind);
const child=spawn(command,args,{cwd:process.cwd(),stdio:'inherit',env:{...process.env,PATH:`${resolve('packages/database/node_modules/.bin')}:${process.env.PATH??''}`,DATABASE_URL:connection,VERIFICATION_TEST_DATABASE_URL:connection,GOOGLE_AUTH_DB_TEST:'true',EVENT_CREATION_DB_TEST:'true'}});
child.on('error',()=>{console.error('Rehearsal command could not start');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
