import {createHash} from 'node:crypto';
import path from 'node:path';
import {createDatabase,localSnapshot} from '../src/lib/local-db';

const reserved=path.resolve('.sockit/demo/postgres');
if(process.env.SOCKIT_DATABASE_MODE!=='local'||process.env.SOCKIT_DEMO_MODE!=='true'||path.resolve(process.env.SOCKIT_LOCAL_DB_DIR??'')!==reserved||process.env.NODE_ENV==='production'||process.env.VERCEL_ENV==='production')throw new Error('Se rechazó la carga: solo se permite la base local reservada para demostración.');
const key=(label:string)=>{const h=createHash('sha256').update('SOCKIT-DEMO-v1:'+label).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
async function main(){
 const db=await createDatabase(reserved);
 try{
  await db.exec('create table if not exists sockit_internal.demo_seed(id integer primary key,base_date timestamptz not null default now(),completed boolean not null default false)');
  const previous=(await db.query<{value:number}>('select count(*)::integer value from sockit_internal.demo_seed')).rows[0].value;
  const occupied=(await db.query<{value:number}>('select ((select count(*) from products)+(select count(*) from documents)+(select count(*) from clients))::integer value')).rows[0].value;
  if(!previous&&occupied)throw new Error('La carpeta de demostración contiene registros previos sin marca de demo. Se conserva sin cargar datos.');
  await db.exec('insert into sockit_internal.demo_seed(id) values(1) on conflict do nothing');
  const seed=(await db.query<{base_date:Date;completed:boolean}>('select * from sockit_internal.demo_seed where id=1')).rows[0];
  if(seed.completed){console.log('La demostración ya está preparada. Se conservan tus pruebas y cambios.');return;}
  const base=new Date(seed.base_date);const date=(days:number)=>{const d=new Date(base);d.setUTCDate(d.getUTCDate()+days);return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santo_Domingo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);};
  const op=async(label:string,kind:string,payload:unknown)=>(await db.query<{id:string}>('select sockit_operation($1,$2::jsonb,$3::uuid) id',[kind,JSON.stringify(payload),key(label)])).rows[0].id;
  await op('settings','settings',{name:'SOCKIT · DEMOSTRACIÓN',payment_message:'DEMO · Hola {cliente}, saldo ficticio: {saldo}. No enviar.',delivery_message:'DEMO · Entrega ficticia de {cliente}: {fecha}. No enviar.',privacy_minimum:3});
  const banks=[];for(const [i,name] of ['Cuenta de prueba Popular','Cuenta de prueba Banreservas'].entries())banks.push(await op('bank'+i,'bank_account',{name:'DEMO · '+name,institution:i?'Banreservas':'Banco Popular',holder:'DEMO · Empresa ficticia',account_number:'DEMO-'+(i?'2222':'1111'),account_type:'Ahorros',active:true}));
  await op('capital-cash','capital',{account:'cash',amount:25000,description:'DEMO · Capital ficticio en caja'});
  for(let i=0;i<2;i++)await op('capital-bank'+i,'capital',{account:'bank',account_id:banks[i],amount:i?10000:50000,description:'DEMO · Aportación ficticia'});
  const supplier=await op('supplier','supplier',{name:'DEMO · Textiles de prueba',phone:'',email:'demostracion@example.com',notes:'Proveedor ficticio. No contactar.',active:true});
  const names=['Costilla borgoña','Clásica crema','Talón terracota','Rib rosa nude','Sport arena','Edición durazno'];const products:string[]=[];
  for(let i=0;i<names.length;i++)products.push(await op('product'+i,'product',{sku:'DEMO-'+String(i+1).padStart(3,'0'),name:'DEMO · '+names[i],category:i%2?'Clásicas':'Diseño',color:['Borgoña','Crema','Terracota','Rosa nude','Arena','Durazno'][i],size:'35–40',price:200+i*25,minimum:5,collection:'Colección de demostración',brand:'SOCKIT DEMO',sock_type:'Media',supplier_id:supplier}));
  await op('purchase','purchase',{contact:'DEMO · Textiles de prueba',supplier_id:supplier,account:'bank',account_id:banks[0],paid:8000,acquisition:500,discount:0,reference:'DEMO-COMPRA-001',lines:products.map((id,i)=>({product_id:id,quantity:i===5?8:70,unit_price:65+i*5}))});
  const clients:string[]=[];
  for(let i=0;i<9;i++)clients.push(await op('client'+i,'client',{name:`DEMO · Cliente de prueba ${i+1}`,phone:'',age_range:['18-24','25-34','35-44'][Math.floor(i/3)],province:i<6?'Santo Domingo':'Santiago',city:i<6?'Santo Domingo':'Santiago',municipality:i<6?'Distrito Nacional':'Santiago',sector:['Naco','Piantini','Los Jardines'][Math.floor(i/3)],address:'DEMO · Dirección ficticia',latitude:null,longitude:null,notes:'Persona ficticia para probar la aplicación. No es un cliente real.',active:true}));
  for(let i=0;i<18;i++){
   const pi=i%6,quantity=i%4+1,amount=quantity*(200+pi*25),bank=i%3===1;
   const sale=await op('sale'+i,'sale',{contact:`DEMO · Cliente de prueba ${i%9+1}`,client_id:clients[i%9],account:bank?'bank':'cash',account_id:bank?banks[0]:'',paid:i%3===2?Math.round(amount/2):amount,method:bank?'transfer':'cash',reference:'DEMO-VENTA-'+(i+1),due_date:date(i%3===2?-4:7),discount:0,delivery_charge:0,lines:[{product_id:products[pi],quantity,unit_price:200+pi*25}]});
   let snapshot=await localSnapshot(db);const payment=snapshot.payments.find(p=>p.document_id===sale);
   if(bank&&i%2===0&&payment)await op('confirm'+i,'confirm_payment',{payment_id:payment.id});
   const historical=new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()-Math.floor(i/3),Math.min(20,i%20+1),16));
   await db.query('update documents set created_at=$1::timestamptz where id=$2',[historical.toISOString(),sale]);
   await db.query('update inventory_movements set created_at=$1::timestamptz where document_id=$2',[historical.toISOString(),sale]);
   await db.query('update cash_movements set created_at=$1::timestamptz where document_id=$2',[historical.toISOString(),sale]);
   await db.query("update payments set created_at=$1,confirmed_at=case when status='confirmed' then $1::timestamptz else null end where document_id=$2",[historical.toISOString(),sale]);
  }
  const statuses=['new','confirmed','preparing','ready','sent','delivered','cancelled'];
  for(let i=0;i<statuses.length;i++){
   const order=await op('order'+i,'order',{client_id:clients[i],delivery_date:date(i===4||i===5?-2:i===1?0:i+1),delivery_method:'DEMO · Entrega de prueba',address:'DEMO · Dirección ficticia',notes:'Pedido de demostración; no enviar mercancía real.',discount:0,delivery_cost:50,lines:[{product_id:products[i%4],quantity:2,unit_price:200+(i%4)*25}]});
   if(i>0)await op('order-confirm'+i,'order_status',{order_id:order,status:'confirmed'});
   if(i===2)await op('order-prepare'+i,'order_status',{order_id:order,status:'preparing'});
   if(i>=3&&i<=5)await op('order-ready'+i,'order_status',{order_id:order,status:'ready'});
   if(i===4||i===5)await op('order-send'+i,'order_status',{order_id:order,status:'sent'});
   if(i===5)await op('order-delivered'+i,'order_status',{order_id:order,status:'delivered'});
   if(i===6)await op('order-cancel'+i,'order_status',{order_id:order,status:'cancelled'});
   if(i===1||i===3)await op('order-deposit'+i,'order_payment',{order_id:order,amount:100,account:'bank',account_id:banks[1],method:'transfer',fee:0,reference:'DEMO-ANTICIPO-'+i,origin_bank:'DEMO · Banco ficticio'});
  }
  await op('presentation','presentation',{name:'DEMO · Combo tres diseños',lines:products.slice(0,3).map(id=>({product_id:id,quantity:1,unit_price:180}))});
  await op('expense','expense',{account:'cash',amount:600,description:'DEMO · Empaques ficticios',expense_category:'Empaques'});
  await op('transfer','bank_transfer',{account_id:banks[0],target_account_id:banks[1],amount:1000,description:'DEMO · Transferencia entre cuentas propias'});
  await db.exec('update sockit_internal.demo_seed set completed=true where id=1');
  const result=await localSnapshot(db);console.log(`Demostración lista: ${result.products.length} diseños, ${result.clients.length} clientes ficticios, ${result.orders.length} pedidos y ${result.payments.filter(p=>p.status==='pending').length} pagos para confirmar.`);
 }finally{await db.close();}
}
void main().catch(e=>{console.error(e instanceof Error?e.message:'No se pudo preparar la demostración');process.exitCode=1;});
