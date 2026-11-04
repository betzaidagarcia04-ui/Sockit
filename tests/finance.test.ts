import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { createDatabase,localSnapshot } from '../src/lib/local-db';

test('compras, costo promedio, ventas, abonos, rechazos, reversos y auditoría',async()=>{
 const db=await createDatabase();
 const op=async(kind:string,payload:unknown,key=randomUUID())=>db.transaction(async tx=>{
  await tx.exec('set local role authenticated');
  const r=await tx.query<{id:string}>('select sockit_operation($1,$2::jsonb,$3::uuid) as id',[kind,JSON.stringify(payload),key]);
  return r.rows[0].id;
 });
 try {
  const p=await op('product',{sku:'S-1',name:'Costilla',price:200,minimum:2});
  await op('capital',{account:'cash',amount:2000,description:'Capital inicial'});
  await op('purchase',{contact:'Proveedor',account:'cash',paid:500,acquisition:100,lines:[{product_id:p,quantity:10,unit_price:40}]});
  let s=await localSnapshot(db);
  assert.equal(s.products[0].stock,10); assert.equal(Number(s.products[0].average_cost),50);
  assert.equal(s.metrics.cash,1500); assert.equal(s.metrics.revenue,0); assert.equal(s.metrics.expenses,0);
  await op('purchase',{contact:'Proveedor',paid:0,lines:[{product_id:p,quantity:10,unit_price:70}]});
  s=await localSnapshot(db); assert.equal(Number(s.products[0].average_cost),60); assert.equal(s.metrics.payables,700);
  const sale=await op('sale',{contact:'Cliente',account:'bank',paid:200,lines:[{product_id:p,quantity:3,unit_price:200}]});
  s=await localSnapshot(db);
  assert.equal(s.products[0].stock,17); assert.equal(s.metrics.cogs,180); assert.equal(s.metrics.gross_profit,420);
  assert.equal(s.metrics.bank,0); assert.equal(s.metrics.receivables,600);
  const payment=s.payments[0].id; const key=randomUUID();
  await Promise.all([op('confirm_payment',{payment_id:payment},key),op('confirm_payment',{payment_id:payment},key)]);
  s=await localSnapshot(db); assert.equal(s.metrics.bank,200); assert.equal(s.metrics.receivables,400);
  await assert.rejects(()=>op('confirm_payment',{payment_id:payment}),/ya fue procesado/);
  const rejected=await op('payment',{document_id:sale,amount:100,account:'bank'});
  await op('reject_payment',{payment_id:rejected});
  s=await localSnapshot(db); assert.equal(s.metrics.bank,200); assert.equal(s.metrics.receivables,400);
  await op('payment',{document_id:sale,amount:400,account:'cash'});
  s=await localSnapshot(db); const partial=s.payments.find(x=>x.status==='pending')!;
  await op('confirm_payment',{payment_id:partial.id});
  s=await localSnapshot(db); assert.equal(s.metrics.receivables,0); assert.equal(s.metrics.cash,1900);
  await op('reverse_payment',{payment_id:payment});
  s=await localSnapshot(db); assert.equal(s.metrics.bank,0); assert.equal(s.metrics.receivables,200);
  await op('transfer',{account:'cash',amount:100,description:'Depósito propio'});
  await op('expense',{account:'bank',amount:10,description:'Empaques'});
  s=await localSnapshot(db); assert.equal(s.metrics.bank,90); assert.equal(s.metrics.revenue,600); assert.equal(s.metrics.net_profit,410);
  assert.equal(s.metrics.equity,2410);
  await assert.rejects(()=>op('sale',{contact:'Cliente',paid:0,lines:[{product_id:p,quantity:99,unit_price:200}]}),/Existencias insuficientes/);
  await assert.rejects(()=>op('expense',{account:'bank',amount:1000,description:'No autorizado'}),/Saldo insuficiente/);
  assert.equal((await localSnapshot(db)).products[0].stock,17);
  assert.equal((await db.query('select * from audit_events')).rows.length,13);
 } finally {await db.close();}
});

test('venta de combo atómica, concurrencia sin sobreventa y costo histórico',async()=>{
 const db=await createDatabase();
 const op=async(kind:string,payload:unknown)=>{
  const r=await db.query<{id:string}>('select sockit_operation($1,$2::jsonb,$3::uuid) as id',[kind,JSON.stringify(payload),randomUUID()]); return r.rows[0].id;
 };
 try {
  const a=await op('product',{sku:'A',name:'A',price:100,minimum:1});
  const b=await op('product',{sku:'B',name:'B',price:100,minimum:1});
  await op('purchase',{contact:'P',lines:[{product_id:a,quantity:2,unit_price:30},{product_id:b,quantity:1,unit_price:40}]});
  await assert.rejects(()=>op('sale',{contact:'C',lines:[{product_id:a,quantity:1,unit_price:100},{product_id:b,quantity:2,unit_price:100}]}),/insuficientes/);
  assert.equal((await localSnapshot(db)).products.find(x=>x.id===a)?.stock,2);
  await op('sale',{contact:'C',lines:[{product_id:a,quantity:1,unit_price:100},{product_id:b,quantity:1,unit_price:100}]});
  const results=await Promise.allSettled([op('sale',{contact:'C',lines:[{product_id:a,quantity:1,unit_price:100}]}),op('sale',{contact:'C',lines:[{product_id:a,quantity:1,unit_price:100}]})]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(results.filter(x=>x.status==='rejected').length,1);
  await op('purchase',{contact:'P',lines:[{product_id:a,quantity:1,unit_price:99}]});
  const s=await localSnapshot(db); assert.equal(s.metrics.cogs,100); assert.equal(Number(s.products.find(x=>x.id===a)?.average_cost),99);
 } finally {await db.close();}
});

test('RLS aísla usuarios y prohíbe escrituras directas',async()=>{
 const db=await createDatabase();
 try {
  await db.query('select sockit_operation($1,$2::jsonb,$3::uuid)',['product',JSON.stringify({sku:'PRIV',name:'Privado',price:10,minimum:1}),randomUUID()]);
  await db.transaction(async tx=>{
   await tx.exec('set local role authenticated');
   await tx.query("select set_config('request.jwt.claim.sub',$1,true)",['00000000-0000-4000-8000-000000000002']);
   assert.equal((await tx.query('select * from products')).rows.length,0);
   const r=await tx.query<{data:{products:unknown[]}}>('select sockit_snapshot() as data');
   assert.equal(r.rows[0].data.products.length,0);
  });
  await assert.rejects(()=>db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.exec('delete from products');}),/permission denied/);
 } finally {await db.close();}
});

test('PostgreSQL conserva registros después de cerrar y abrir',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'sockit-persistence-'));
 let db=await createDatabase(dir);
 await db.query('select sockit_operation($1,$2::jsonb,$3::uuid)',['product',JSON.stringify({sku:'KEEP',name:'Persistente',price:20,minimum:1}),randomUUID()]);
 await db.close(); db=await createDatabase(dir);
 try {assert.equal((await localSnapshot(db)).products[0].sku,'KEEP');} finally {await db.close();}
});

test('abonos a proveedores, edición y devolución total preservan trazabilidad',async()=>{
 const db=await createDatabase();
 const op=async(kind:string,payload:unknown,key=randomUUID())=>{
  const r=await db.query<{id:string}>('select sockit_operation($1,$2::jsonb,$3::uuid) as id',[kind,JSON.stringify(payload),key]);return r.rows[0].id;
 };
 try{
  const product=await op('product',{sku:'RETURN',name:'Devolución',price:100,minimum:1});
  await op('capital',{account:'cash',amount:500,description:'Capital'});
  const purchase=await op('purchase',{contact:'Proveedor',paid:0,lines:[{product_id:product,quantity:10,unit_price:20}]});
  await op('purchase_payment',{document_id:purchase,amount:200,account:'cash'});
  await assert.rejects(()=>op('purchase_payment',{document_id:purchase,amount:1,account:'cash'}),/supera la deuda/);
  const sale=await op('sale',{contact:'Cliente',paid:100,account:'cash',lines:[{product_id:product,quantity:1,unit_price:100}]});
  await op('purchase',{contact:'Proveedor',lines:[{product_id:product,quantity:1,unit_price:100}]});
  const before=await localSnapshot(db);assert.equal(Number(before.products[0].average_cost),28);
  const key=randomUUID();
  await op('reverse_sale',{document_id:sale,description:'Retorno del par sin uso'},key);
  await op('reverse_sale',{document_id:sale,description:'Retorno del par sin uso'},key);
  await assert.rejects(()=>op('reverse_sale',{document_id:sale,description:'Otro motivo'},key),/reutilizada/);
  const after=await localSnapshot(db);
  assert.equal(after.products[0].stock,11);assert.ok(Math.abs(Number(after.products[0].average_cost)-300/11)<.000001);
  assert.equal(after.metrics.cash,300);assert.equal(after.metrics.revenue,0);assert.equal(after.metrics.cogs,0);assert.equal(after.metrics.receivables,0);
  assert.equal(after.metrics.payables,100);assert.equal(after.payments[0].status,'reversed');
  assert.equal(after.inventory_movements.length,4);assert.equal(after.documents.find(d=>d.id===sale)?.status,'reversed');
  await assert.rejects(()=>op('reverse_sale',{document_id:sale,description:'Duplicado'}),/no disponible/);
  await op('edit_product',{product_id:product,sku:'RETURN',name:'Archivado',price:100,minimum:1,active:false});
  await assert.rejects(()=>op('sale',{contact:'Cliente',lines:[{product_id:product,quantity:1,unit_price:100}]}),/Producto no disponible/);
 }finally{await db.close();}
});

test('respaldo PostgreSQL restaura productos, movimientos y saldos',async()=>{
 const db=await createDatabase();
 await db.query('select sockit_operation($1,$2::jsonb,$3::uuid)',['capital',JSON.stringify({amount:1234.56,account:'cash',description:'Capital respaldado'}),randomUUID()]);
 const before=await localSnapshot(db);
 const dump=await db.dumpDataDir('gzip');
 await db.close();
 const restored=new PGlite({loadDataDir:dump});
 try{const after=await localSnapshot(restored);assert.deepEqual(after,before);}finally{await restored.close();}
});
