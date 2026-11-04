import { currentUser,isLocal,supabase } from './auth';
import type { Snapshot } from './types';
export async function snapshot(): Promise<Snapshot> {
  if(!await currentUser()) throw new Error('Debes iniciar sesión');
  if(isLocal()) {
    const {database,localSnapshot}=await import('./local-db');
    return localSnapshot(await database());
  }
  const {data,error}=await (await supabase()).rpc('sockit_snapshot');
  if(error) throw new Error(`Supabase: ${error.message}`);
  return data as Snapshot;
}
export async function operation(kind:string,payload:unknown,key:string) {
  if(!await currentUser()) throw new Error('Debes iniciar sesión');
  if(isLocal()) {
    const {database}=await import('./local-db');
    const db=await database();
    return db.transaction(async tx=>{
      await tx.exec('set local role authenticated');
      const r=await tx.query<{id:string}>('select public.sockit_operation($1,$2::jsonb,$3::uuid) as id',[kind,JSON.stringify(payload),key]);
      return r.rows[0].id;
    });
  }
  const {data,error}=await (await supabase()).rpc('sockit_operation',{p_kind:kind,p_payload:payload,p_key:key});
  if(error) throw new Error(error.message);
  return data as string;
}
