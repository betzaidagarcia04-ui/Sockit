import {spawn} from 'node:child_process';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {demoEnvironment} from './demo-environment.mjs';
const env=await demoEnvironment();
const lock=path.resolve('.sockit/demo/run.lock');
for(let attempt=0;attempt<2;attempt++){
 try{await writeFile(lock,JSON.stringify({app:'sockit-demo',pid:process.pid}),{flag:'wx',mode:0o600});break;}
 catch(e){if(e.code!=='EEXIST')throw e;const prior=JSON.parse(await readFile(lock,'utf8'));if(prior.app!=='sockit-demo'||!Number.isInteger(prior.pid))throw new Error('Revisa el bloqueo de la demostración antes de continuar.');let active=true;try{process.kill(prior.pid,0);}catch(error){if(error.code==='ESRCH')active=false;}if(active)throw new Error('La demostración ya se está ejecutando. No se abrirá otra instancia de su base.');await unlink(lock);}
}
let child;
const stop=signal=>child?.kill(signal);process.on('SIGINT',()=>stop('SIGINT'));process.on('SIGTERM',()=>stop('SIGTERM'));
const run=(command,args)=>new Promise((resolve,reject)=>{child=spawn(command,args,{env,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('El proceso terminó con código '+code)));});
try{
 await run(process.execPath,['--import','tsx','scripts/seed-demo.ts']);
 if(!process.argv.includes('--seed-only'))await run(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','0.0.0.0','--port','3200']);
}finally{const held=JSON.parse(await readFile(lock,'utf8'));if(held.pid===process.pid)await unlink(lock);}
