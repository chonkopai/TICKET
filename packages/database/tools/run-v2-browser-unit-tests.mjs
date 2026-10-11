import { createRequire } from 'node:module';
import { dirname,resolve,join } from 'node:path';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
const require=createRequire(import.meta.url);
const esbuild=require(require.resolve('esbuild',{paths:[dirname(require.resolve('tsx'))]}));
const directory=await mkdtemp(join(tmpdir(),'ticket-draft-browser-tests-'));
try{
  const entryPoints=process.argv.slice(2);if(!entryPoints.length)throw new Error('Test paths required');
  for(let i=0;i<entryPoints.length;i++){
    const output=join(directory,`${i}.mjs`);
    await esbuild.build({entryPoints:[resolve(entryPoints[i])],bundle:true,platform:'node',format:'esm',jsx:'automatic',banner:{js:'import { createRequire as bundledTestRequire } from "node:module"; const require = bundledTestRequire(import.meta.url);'},outfile:output,plugins:[{name:'external-react-and-next-runtime',setup(build){build.onResolve({filter:/^(?:next|react|react-dom)(?:\/|$)/},args=>({path:require.resolve(args.path,{paths:[dirname(resolve(entryPoints[i]))]}),external:true}));}}],logLevel:'silent'});
    const result=spawnSync(process.execPath,['--test',output],{stdio:'inherit'});if(result.status!==0){process.exitCode=result.status??1;break;}
  }
}finally{await rm(directory,{recursive:true,force:true});}
