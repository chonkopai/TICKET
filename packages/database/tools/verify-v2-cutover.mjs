import {writeFile} from 'node:fs/promises';
import {rehearsalConnection} from './v2-rehearsal-lib.mjs';
import {cutoverObservation} from './v2-cutover-observation.mjs';
const [directory,kind,output]=process.argv.slice(2);
if(!directory||!['fresh','legacy'].includes(kind)||!output)throw Error('Use directory fresh|legacy output.json');
const report=await cutoverObservation(await rehearsalConnection(directory,kind));
await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({database:report.database,counts:report.counts,anomalies:report.anomalies,contraction:report.contraction}));
