import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
test('la carga demo rechaza Supabase, producción y carpetas no reservadas sin escribir datos',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'sockit-not-demo-'));await writeFile(path.join(dir,'conservar.txt'),'no modificar');
 const cases:Partial<NodeJS.ProcessEnv>[]=[{SOCKIT_DATABASE_MODE:'supabase'},{NODE_ENV:'production'},{VERCEL_ENV:'production'},{SOCKIT_LOCAL_DB_DIR:dir},{SOCKIT_DEMO_MODE:'false'}];
 for(const overrides of cases){
  const result=spawnSync(process.execPath,['--import','tsx','scripts/seed-demo.ts'],{cwd:process.cwd(),env:{...process.env,SOCKIT_DATABASE_MODE:'local',SOCKIT_DEMO_MODE:'true',SOCKIT_LOCAL_DB_DIR:'.sockit/demo/postgres',...overrides,NODE_ENV:overrides.NODE_ENV??process.env.NODE_ENV??'test'},encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/Se rechazó la carga/);
 }
 assert.equal(await readFile(path.join(dir,'conservar.txt'),'utf8'),'no modificar');assert.deepEqual(await readdir(dir),['conservar.txt']);
});

test('Vercel omite despliegues no autorizados y nunca promueve demo a producción',()=>{
 const check=(env:Partial<NodeJS.ProcessEnv>)=>spawnSync(process.execPath,['scripts/check-deployment.mjs'],{env:{...process.env,SOCKIT_PREVIEW_APPROVED:'false',SOCKIT_PRODUCTION_APPROVED:'false',...env,NODE_ENV:env.NODE_ENV??process.env.NODE_ENV??'test'},encoding:'utf8'}).status;
 assert.equal(check({VERCEL_ENV:'preview'}),0);
 assert.equal(check({VERCEL_ENV:'production'}),0);
 assert.equal(check({VERCEL_ENV:'production',SOCKIT_PRODUCTION_APPROVED:'true',SOCKIT_DEMO_MODE:'true'}),0);
 assert.equal(check({VERCEL_ENV:'preview',SOCKIT_PREVIEW_APPROVED:'true'}),1);
 assert.equal(check({VERCEL_ENV:'production',SOCKIT_PRODUCTION_APPROVED:'true',SOCKIT_DEMO_MODE:'false'}),1);
});
