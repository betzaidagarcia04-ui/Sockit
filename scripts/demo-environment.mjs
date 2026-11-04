import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {parseEnv} from 'node:util';
import path from 'node:path';
export async function demoEnvironment(){
 if(process.env.NODE_ENV==='production'||process.env.VERCEL_ENV==='production')throw new Error('La demostración local no se inicia en producción.');
 const dir=path.resolve('.sockit/demo');await mkdir(dir,{recursive:true,mode:0o700});
 const file=path.join(dir,'access.env');
 try{await writeFile(file,`SOCKIT_LOCAL_PASSWORD=${randomBytes(24).toString('hex')}\nSOCKIT_SESSION_SECRET=${randomBytes(48).toString('hex')}\n`,{mode:0o600,flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
 const access=parseEnv(await readFile(file,'utf8'));
 return {...process.env,...access,SOCKIT_DATABASE_MODE:'local',SOCKIT_DEMO_MODE:'true',SOCKIT_LOCAL_DB_DIR:'.sockit/demo/postgres',SOCKIT_LOCAL_FILES_DIR:'.sockit/demo/uploads',SOCKIT_BUILD_DIR:'.next-demo'};
}
