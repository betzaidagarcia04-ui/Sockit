import { createHash,randomUUID } from 'node:crypto';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { currentUser,isLocal,supabase } from './auth';
import { operation } from './data';
import type { PrivateFile } from './suite-types';
export function detectMime(bytes:Uint8Array):string|null{
 if(bytes.length>=8&&Buffer.from(bytes.subarray(0,8)).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(Buffer.from(bytes.subarray(0,4)).toString()==='RIFF'&&Buffer.from(bytes.subarray(8,12)).toString()==='WEBP')return 'image/webp';
 if(Buffer.from(bytes.subarray(0,5)).toString()==='%PDF-')return 'application/pdf';
 return null;
}
export async function storeFile(file:File,purpose:string){
 const user=await currentUser();if(!user)throw new Error('Debes iniciar sesión');
 if(!['product','receipt'].includes(purpose))throw new Error('Uso de archivo inválido');
 if(file.size<1||file.size>5242880)throw new Error('El archivo debe ocupar entre 1 byte y 5 MB');
 const bytes=Buffer.from(await file.arrayBuffer()),mime=detectMime(bytes);
 if(!mime||mime!==file.type||(purpose==='product'&&!mime.startsWith('image/')))throw new Error('Selecciona una imagen PNG/JPEG/WebP o un comprobante PDF válido');
 const id=randomUUID();
 if(isLocal()){
  const dir=path.resolve(process.env.SOCKIT_LOCAL_FILES_DIR||'.sockit/uploads');await mkdir(dir,{recursive:true,mode:0o700});
  await writeFile(path.join(dir,id),bytes,{flag:'wx',mode:0o600});
 }else{
  const {error}=await (await supabase()).storage.from('sockit-private').upload(`${user}/${id}`,bytes,{contentType:mime,upsert:false});if(error)throw new Error(`Almacenamiento Supabase: ${error.message}`);
 }
 const metadata={id,name:file.name.replace(/[\r\n<>"/\\]/g,'').slice(0,160)||'archivo',mime,size:bytes.length,purpose,sha256:createHash('sha256').update(bytes).digest('hex')};
 await operation('file',metadata,randomUUID());return metadata;
}
export async function loadFile(id:string):Promise<{metadata:PrivateFile;bytes:Uint8Array}|null>{
 const user=await currentUser();if(!user)return null;
 let metadata:PrivateFile|undefined,bytes:Uint8Array;
 if(isLocal()){
  const {database}=await import('./local-db');const db=await database();
  metadata=await db.transaction(async tx=>{await tx.exec('set local role authenticated');return (await tx.query<PrivateFile>('select id,name,mime,size,purpose from private_files where id=$1',[id])).rows[0];});
  if(!metadata)return null;
  bytes=await readFile(path.resolve(process.env.SOCKIT_LOCAL_FILES_DIR||'.sockit/uploads',id));
 }else{
  const client=await supabase();const record=await client.from('private_files').select('id,name,mime,size,purpose').eq('id',id).maybeSingle();
  if(record.error||!record.data)return null;metadata=record.data as PrivateFile;
  const result=await client.storage.from('sockit-private').download(`${user}/${id}`);if(result.error)return null;bytes=new Uint8Array(await result.data.arrayBuffer());
 }
 return {metadata,bytes};
}
