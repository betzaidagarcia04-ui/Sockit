import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,localSnapshot} from '../src/lib/local-db';
test('pedido reserva, anticipo no es venta, despacho y devolución no duplican inventario',async()=>{
 const db=await createDatabase();const op=async(kind:string,payload:unknown,key=randomUUID())=>(await db.query<{id:string}>('select sockit_operation($1,$2::jsonb,$3::uuid) id',[kind,JSON.stringify(payload),key])).rows[0].id;
 try{
  const product=await op('product',{sku:'ORDER',name:'Pedido',price:100,minimum:1});
  await op('purchase',{contact:'Proveedor',lines:[{product_id:product,quantity:5,unit_price:20}]});
  const client=await op('client',{name:'Ana',phone:'8095550101',province:' santo domingo ',city:'santo domingo',sector:' naco  ',age_range:'unknown'});
  const payload={client_id:client,delivery_date:'2026-12-01',delivery_cost:10,discount:1,lines:[{product_id:product,quantity:3,unit_price:100}]};
  const order=await op('order',payload);let s=await localSnapshot(db);
  assert.equal(s.metrics.revenue,0);assert.equal(s.products[0].available,5);assert.equal(s.clients[0].sector,'Naco');
  await op('order_status',{order_id:order,status:'confirmed'});s=await localSnapshot(db);
  assert.equal(s.products[0].stock,5);assert.equal(s.products[0].reserved,3);assert.equal(s.products[0].available,2);
  await assert.rejects(()=>op('sale',{contact:'Otro',lines:[{product_id:product,quantity:3,unit_price:100}]}),/Existencias insuficientes/);
  const deposit=await op('order_payment',{order_id:order,amount:100,account:'cash',method:'cash'});
  await op('confirm_payment',{payment_id:deposit});s=await localSnapshot(db);
  assert.equal(s.metrics.cash,100);assert.equal(s.metrics.revenue,0);assert.equal(s.metrics.customer_deposits,100);assert.equal(s.metrics.receivables,0);assert.equal(s.metrics.equity,0);
  await op('order_status',{order_id:order,status:'ready'});
  await op('order_status',{order_id:order,status:'sent'});s=await localSnapshot(db);
  assert.equal(s.products[0].stock,2);assert.equal(s.products[0].reserved,0);assert.equal(s.metrics.revenue,309);assert.equal(s.metrics.customer_deposits,0);assert.equal(s.metrics.receivables,209);assert.equal(s.metrics.cogs,60);
  assert.equal(s.lines.filter(l=>l.document_id===s.orders[0].document_id).reduce((v,l)=>v+Number(l.quantity)*Number(l.unit_price)-Number(l.line_discount),0),299);
  await op('order_status',{order_id:order,status:'delivered'});s=await localSnapshot(db);assert.equal(s.products[0].stock,2);assert.ok(s.orders[0].delivered_at);
  await op('order_status',{order_id:order,status:'returned'});s=await localSnapshot(db);assert.equal(s.products[0].stock,5);assert.equal(s.metrics.revenue,0);assert.equal(s.metrics.cash,0);
 }finally{await db.close();}
});
test('cuentas separadas, comisión de tarjeta, conciliación y cancelación de reserva',async()=>{
 const db=await createDatabase();const op=async(kind:string,payload:unknown)=>(await db.query<{id:string}>('select sockit_operation($1,$2::jsonb,$3::uuid) id',[kind,JSON.stringify(payload),randomUUID()])).rows[0].id;
 try{
  const a=await op('bank_account',{name:'Principal',institution:'Popular',holder:'SOCKIT',account_number:'123456789'});
  const b=await op('bank_account',{name:'Reserva',institution:'BHD',holder:'SOCKIT',account_number:'987654321'});
  await op('capital',{account:'bank',account_id:a,amount:500,description:'Capital'});
  await assert.rejects(()=>op('expense',{account:'bank',amount:1,description:'Histórico sin dinero'}),/Saldo insuficiente/);
  await assert.rejects(()=>op('expense',{account:'bank',account_id:b,amount:1,description:'No saldo'}),/Saldo insuficiente/);
  await assert.rejects(()=>op('transfer',{account:'bank',account_id:b,amount:1,description:'Origen sin dinero'}),/Saldo insuficiente/);
  await op('bank_transfer',{account_id:a,target_account_id:b,amount:100,description:'Entre propias'});
  const product=await op('product',{sku:'CARD',name:'Tarjeta',price:100,minimum:1});await op('purchase',{contact:'P',lines:[{product_id:product,quantity:2,unit_price:20}]});
  const sale=await op('sale',{contact:'C',paid:100,account:'bank',account_id:b,method:'credit_card',fee:5,lines:[{product_id:product,quantity:1,unit_price:100}]});
  let s=await localSnapshot(db);await op('confirm_payment',{payment_id:s.payments.find(p=>p.document_id===sale)!.id});s=await localSnapshot(db);
  assert.equal(s.accounts.find(x=>x.id===a)!.balance,400);assert.equal(s.accounts.find(x=>x.id===b)!.balance,195);assert.equal(s.metrics.revenue,100);assert.equal(s.metrics.expenses,5);assert.equal(s.metrics.receivables,0);
  assert.equal(s.accounts[0].masked_number.startsWith('••••'),true);assert.equal('account_number' in s.accounts[0],false);
  const movement=s.movements.find(m=>m.account_id===b)!;
  await op('reconcile',{account_id:b,statement_date:'2030-01-01',statement_balance:195,notes:'Estado verificado',movement_ids:[movement.id]});s=await localSnapshot(db);assert.equal(s.statements[0].book_balance,195);assert.ok(s.movements.find(m=>m.id===movement.id)?.reconciled_at);
  const client=await op('client',{name:'C'});const order=await op('order',{client_id:client,delivery_date:'2026-12-01',lines:[{product_id:product,quantity:1,unit_price:100}]});
  await op('order_status',{order_id:order,status:'confirmed'});await op('order_status',{order_id:order,status:'cancelled'});s=await localSnapshot(db);assert.equal(s.products[0].available,1);assert.equal(s.metrics.revenue,100);
 }finally{await db.close();}
});
