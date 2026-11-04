import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createDatabase,localSnapshot} from '../src/lib/local-db';
import {aggregate} from '../src/lib/analytics';
import {csvText,reportRows} from '../src/lib/reports';
test('descuentos, devolución parcial, reverso restante y analítica neta',async()=>{
 const db=await createDatabase();const op=async(kind:string,payload:unknown,key=randomUUID())=>(await db.query<{id:string}>('select sockit_operation($1,$2::jsonb,$3::uuid) id',[kind,JSON.stringify(payload),key])).rows[0].id;
 try{
  const p=await op('product',{sku:'PART',name:'Parcial',price:100,minimum:1});
  await op('purchase',{contact:'P',discount:20,lines:[{product_id:p,quantity:10,unit_price:20}]});let s=await localSnapshot(db);assert.equal(Number(s.products[0].average_cost),18);assert.equal(s.metrics.payables,180);
  const client=await op('client',{name:'Cliente',age_range:'25-34',city:'Santo Domingo',sector:'Naco'});
  const sale=await op('sale',{contact:'Cliente',client_id:client,discount:20,paid:180,account:'cash',lines:[{product_id:p,quantity:2,unit_price:100}]});
  s=await localSnapshot(db);assert.equal(s.metrics.revenue,180);assert.equal(s.metrics.cogs,36);assert.equal(s.metrics.cash,180);
  const key=randomUUID(),payload={document_id:sale,description:'Devolución de un par',lines:[{product_id:p,quantity:1}]};
  await op('sale_return',payload,key);await op('sale_return',payload,key);s=await localSnapshot(db);
  assert.equal(s.metrics.revenue,90);assert.equal(s.metrics.cogs,18);assert.equal(s.metrics.cash,90);assert.equal(s.metrics.receivables,0);assert.equal(s.products[0].stock,9);assert.equal(s.payments[0].refunded_amount,90);assert.equal(s.payments[0].amount,90);
  assert.equal(s.returns.length,1);assert.equal(s.documents.find(d=>d.id===sale)!.original_total,180);
  const productStats=aggregate(s,'design')[0];assert.equal(productStats.pairs,1);assert.equal(productStats.revenue,90);assert.equal(productStats.profit,72);
  const ageStats=aggregate(s,'age')[0];assert.equal(ageStats.clients,1);assert.equal(ageStats.orders,1);assert.equal(ageStats.suppressed,true);
  assert.equal(reportRows(s,'age')[1][1],'Dato protegido');
  await assert.rejects(()=>op('sale_return',{document_id:sale,description:'Demasiados',lines:[{product_id:p,quantity:2}]}),/supera los pares/);
  await op('reverse_sale',{document_id:sale,description:'Resto devuelto'});s=await localSnapshot(db);assert.equal(s.products[0].stock,10);assert.equal(s.metrics.revenue,0);assert.equal(s.metrics.cogs,0);assert.equal(s.metrics.cash,0);assert.equal(s.metrics.receivables,0);
  assert.equal(aggregate(s,'design').length,0);
 }finally{await db.close();}
});
test('importación atómica, combos, notificaciones leídas y ausencia de acceso cruzado',async()=>{
 const db=await createDatabase();const op=async(kind:string,payload:unknown)=>(await db.query<{id:string}>('select sockit_operation($1,$2::jsonb,$3::uuid) id',[kind,JSON.stringify(payload),randomUUID()])).rows[0].id;
 try{
  const row={sku:'IMPORT',name:'Importado',price:100,minimum:2};await op('import_products',{rows:[row]});
  await assert.rejects(()=>op('import_products',{rows:[{...row,sku:'ROLLBACK'},row]}),/duplicate key/);
  assert.equal((await localSnapshot(db)).products.length,1);
  await op('import_purchase',{contact:'P',rows:[{sku:'IMPORT',quantity:12,unit_price:20}]});let s=await localSnapshot(db);const p=s.products[0].id;
  await op('presentation',{name:'Paquete de tres',lines:[{product_id:p,quantity:3,unit_price:90}]});
  s=await localSnapshot(db);assert.equal(s.presentations[0].name,'Paquete de tres');await op('sale',{contact:'C',lines:s.presentations[0].lines});s=await localSnapshot(db);assert.equal(s.products[0].stock,9);
  await op('read_notification',{event_key:'stock-'+p});assert.ok((await localSnapshot(db)).notification_reads.includes('stock-'+p));
  await assert.rejects(()=>db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",['00000000-0000-4000-8000-000000000002']);await tx.query('select sockit_operation($1,$2::jsonb,$3::uuid)',['edit_client',JSON.stringify({id:randomUUID(),name:'Sin acceso'}),randomUUID()]);}),/Cliente no disponible/);
  await assert.rejects(()=>db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query('select sockit_operation_v1($1,$2::jsonb,$3::uuid)',['capital','{}',randomUUID()]);}),/permission denied/);
  const exported=csvText([['=HYPERLINK("https://example.com")',-20]]);assert.ok(exported.includes("'=HYPERLINK"));assert.ok(exported.includes('"-20"'));
 }finally{await db.close();}
});

test('migración desde Fase 1 conserva datos y saldos sin reinstalar la base',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'sockit-upgrade-'));let db=await createDatabase(dir,{through:'202611040002_snapshot.sql'});
 await db.query('select sockit_operation($1,$2::jsonb,$3::uuid)',['capital',JSON.stringify({account:'cash',amount:1234.56,description:'Capital previo'}),randomUUID()]);
 await db.close();db=await createDatabase(dir);
 try{const s=await localSnapshot(db);assert.equal(s.metrics.cash,1234.56);assert.equal(s.metrics.capital,1234.56);assert.equal(s.movements[0].description,'Capital previo');assert.ok(Array.isArray(s.orders));assert.ok(Array.isArray(s.presentations));assert.equal((await db.query('select * from sockit_internal.migrations')).rows.length,8);}finally{await db.close();}
});

test('editar un pedido actualiza reservas atómicamente y bloquea sobreventa concurrente',async()=>{
 const db=await createDatabase();const op=async(kind:string,payload:unknown)=>(await db.query<{id:string}>('select sockit_operation($1,$2::jsonb,$3::uuid) id',[kind,JSON.stringify(payload),randomUUID()])).rows[0].id;
 try{
  const p=await op('product',{sku:'EDIT',name:'Editado',price:100,minimum:1});await op('purchase',{contact:'P',lines:[{product_id:p,quantity:4,unit_price:20}]});const c=await op('client',{name:'C'});
  const value={client_id:c,delivery_date:'2030-01-01',delivery_method:'Entrega',discount:0,delivery_cost:0,lines:[{product_id:p,quantity:2,unit_price:100}]};const a=await op('order',value),b=await op('order',value);
  await op('order_status',{order_id:a,status:'confirmed'});await op('edit_order',{...value,id:a,lines:[{product_id:p,quantity:3,unit_price:100}]});
  assert.equal((await localSnapshot(db)).products[0].reserved,3);await assert.rejects(()=>op('order_status',{order_id:b,status:'confirmed'}),/insuficientes/);
  await assert.rejects(()=>op('edit_order',{...value,id:a,lines:[{product_id:p,quantity:5,unit_price:100}]}),/Existencias insuficientes/);
  assert.equal((await localSnapshot(db)).products[0].reserved,3);
  await op('order_status',{order_id:a,status:'cancelled'});
  const results=await Promise.allSettled([op('order_status',{order_id:b,status:'confirmed'}),op('sale',{contact:'C',lines:[{product_id:p,quantity:3,unit_price:100}]})]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 }finally{await db.close();}
});

test('venta con entrega cobrada y abono completo, más ajuste bancario sin ingresos falsos',async()=>{
 const db=await createDatabase();const op=async(kind:string,payload:unknown)=>(await db.query<{id:string}>('select sockit_operation($1,$2::jsonb,$3::uuid) id',[kind,JSON.stringify(payload),randomUUID()])).rows[0].id;
 try{
  const p=await op('product',{sku:'DEL',name:'Entrega',price:100,minimum:1});await op('purchase',{contact:'P',lines:[{product_id:p,quantity:1,unit_price:20}]});
  await op('sale',{contact:'C',delivery_charge:10,paid:110,account:'cash',lines:[{product_id:p,quantity:1,unit_price:100}]});let s=await localSnapshot(db);assert.equal(s.metrics.cash,110);assert.equal(s.metrics.revenue,110);assert.equal(s.metrics.receivables,0);
  const bank=await op('bank_account',{name:'B',institution:'BHD',holder:'S'});await op('bank_adjustment',{account_id:bank,amount:20,description:'Corrección documentada de apertura'});s=await localSnapshot(db);assert.equal(s.metrics.revenue,110);assert.equal(s.metrics.capital,0);assert.equal(s.accounts[0].balance,20);
 }finally{await db.close();}
});
