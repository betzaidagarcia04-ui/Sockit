import { PGlite } from '@electric-sql/pglite';
import { readFile,writeFile,mkdir,access } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createDatabase,localSnapshot } from '../src/lib/local-db';
async function main(){
try{process.loadEnvFile('.env.local');}catch{}
const [command,target,assertStopped]=process.argv.slice(2);
if(!target||assertStopped!=='--server-stopped'||!['backup','restore'].includes(command)){
 throw new Error('Detén primero Next.js. Uso: node --import tsx scripts/local-backup.ts backup ARCHIVO.tgz --server-stopped | restore ARCHIVO.tgz --server-stopped (SOCKIT_LOCAL_DB_DIR debe ser una carpeta nueva para restaurar).');
}
const dir=path.resolve(process.env.SOCKIT_LOCAL_DB_DIR||'.sockit/postgres');
const uploads=path.resolve(process.env.SOCKIT_LOCAL_FILES_DIR||'.sockit/uploads');
async function copyFiles(db:PGlite,source:string,destination:string){
 const files=(await db.query<{id:string;sha256:string}>('select id,sha256 from private_files')).rows;
 if(files.length)await mkdir(destination,{recursive:false,mode:0o700});
 for(const file of files){
  if(!/^[0-9a-f-]{36}$/.test(file.id))throw new Error('Identificador de archivo inválido en el respaldo');
  const content=await readFile(path.join(source,file.id));
  if(createHash('sha256').update(content).digest('hex')!==file.sha256)throw new Error(`El archivo ${file.id} no coincide con su checksum`);
  await writeFile(path.join(destination,file.id),content,{flag:'wx',mode:0o600});
 }
 return files.length;
}
if(command==='backup'){
 await access(path.join(dir,'PG_VERSION'));
 const db=await createDatabase(dir);
 try{const count=await copyFiles(db,uploads,target+'.files');const dump=await db.dumpDataDir('gzip');await writeFile(target,Buffer.from(await dump.arrayBuffer()),{flag:'wx',mode:0o600});console.log(`Respaldo creado sin sobrescribir archivos: PostgreSQL y ${count} archivos privados verificados.`);}finally{await db.close();}
}else{
 const bytes=await readFile(target);await mkdir(dir,{recursive:false});
 const db=new PGlite({dataDir:dir,loadDataDir:new Blob([bytes])});
 try{const count=await copyFiles(db,target+'.files',uploads);const data=await localSnapshot(db);console.log(`Restauración verificada: ${data.products.length} diseños, ${data.documents.length} documentos y ${count} archivos privados.`);}finally{await db.close();}
}

}
void main().catch(error=>{console.error(error instanceof Error?error.message:"No se pudo completar el respaldo o la restauración");process.exitCode=1;});
