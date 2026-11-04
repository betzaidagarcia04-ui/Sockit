import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
test('la carga demo rechaza Supabase, producción y carpetas no reservadas sin escribir datos',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'sockit-not-demo-'));await writeFile(path.join(dir,'conservar.txt'),'no modificar');
 for(const overrides of [{SOCKIT_DATABASE_MODE:'supabase'},{NODE_ENV:'production'},{VERCEL_ENV:'production'},{SOCKIT_LOCAL_DB_DIR:dir},{SOCKIT_DEMO_MODE:'false'}]){
  const result=spawnSync(process.execPath,['--import','tsx','scripts/seed-demo.ts'],{cwd:process.cwd(),env:{...process.env,SOCKIT_DATABASE_MODE:'local',SOCKIT_DEMO_MODE:'true',SOCKIT_LOCAL_DB_DIR:'.sockit/demo/postgres',...overrides},encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/Se rechazó la carga/);
 }
 assert.equal(await readFile(path.join(dir,'conservar.txt'),'utf8'),'no modificar');assert.deepEqual(await readdir(dir),['conservar.txt']);
});
