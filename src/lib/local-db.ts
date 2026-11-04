import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir, mkdir,realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Snapshot } from './types';

export const LOCAL_OWNER = '00000000-0000-4000-8000-000000000001';
export async function createDatabase(dataDir?: string,options:{through?:string}={}) {
  if(process.env.SOCKIT_DEMO_MODE==='true'){
    const reserved=path.resolve('.sockit/demo/postgres');
    if(process.env.SOCKIT_DATABASE_MODE!=='local'||!dataDir||path.resolve(dataDir)!==reserved||process.env.NODE_ENV==='production'||process.env.VERCEL_ENV==='production')throw new Error('La demostración local solo puede usar su base separada.');
    await mkdir(reserved,{recursive:true,mode:0o700});
    if(await realpath(reserved)!==reserved)throw new Error('La base de demostración no puede apuntar a otra carpeta.');
  }
  if (dataDir) await mkdir(dataDir,{recursive:true});
  const db = new PGlite(dataDir);
  const initialized = await db.query<{name:string|null}>("select to_regnamespace('auth')::text as name");
  if (!initialized.rows[0].name) {
    await db.exec(`create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),'${LOCAL_OWNER}')::uuid $$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  }
  await db.exec('create schema if not exists sockit_internal; create table if not exists sockit_internal.migrations(name text primary key, checksum text not null)');
  for (const file of (await readdir(path.join(process.cwd(),'supabase/migrations'))).filter(x=>x.endsWith('.sql')&&(!options.through||x<=options.through)).sort()) {
    const sql=await readFile(path.join(process.cwd(),'supabase/migrations',file),'utf8');
    const checksum=createHash('sha256').update(sql).digest('hex');
    const applied=await db.query<{checksum:string}>('select checksum from sockit_internal.migrations where name=$1',[file]);
    if(applied.rows.length){
      if(applied.rows[0].checksum!==checksum){await db.close();throw new Error(`La migración ${file} cambió después de aplicarse. Conserva la base y crea una nueva migración incremental.`);}
      continue;
    }
    await db.transaction(async tx=>{await tx.exec(sql);await tx.query('insert into sockit_internal.migrations values($1,$2)',[file,checksum]);});
  }
  return db;
}
const globalDb = globalThis as unknown as { sockitDb?: Promise<PGlite> };
export const database = () => globalDb.sockitDb ??= createDatabase(path.resolve(process.cwd(),process.env.SOCKIT_LOCAL_DB_DIR||'.sockit/postgres'));
export async function localSnapshot(db: PGlite): Promise<Snapshot> {
  // RLS se aplica también al modo local: nunca leer con el rol propietario.
  return db.transaction(async tx => {
    await tx.exec('set local role authenticated');
    const result = await tx.query<{data:Snapshot}>('select public.sockit_snapshot() as data');
    return result.rows[0].data;
  });
}
