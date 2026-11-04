import type {Snapshot,Document} from './types';
import {ageLabels,dayKey,today} from './suite-types';
export type AnalysisFilter={from?:string;to?:string;age?:string;province?:string;city?:string;sector?:string;design?:string};
export type AnalysisRow={key:string;clients:number;orders:number;pairs:number;revenue:number;profit:number;margin:number;ticket:number;suppressed:boolean};
export function selectedSales(data:Snapshot,filter:AnalysisFilter={}):Document[]{
 return data.documents.filter(d=>{
  if(d.kind!=='sale'||d.status!=='active')return false;
  const date=dayKey(d.created_at),c=data.clients.find(c=>c.id===d.client_id);
  return (!filter.from||date>=filter.from)&&(!filter.to||date<=filter.to)&&(!filter.age||(c?.age_range??'unknown')===filter.age)&&(!filter.province||c?.province===filter.province)&&(!filter.city||c?.city===filter.city)&&(!filter.sector||c?.sector===filter.sector)&&(!filter.design||data.lines.some(l=>l.document_id===d.id&&l.product_id===filter.design));
 });
}
export function aggregate(data:Snapshot,dimension:'design'|'age'|'province'|'city'|'sector'|'month',filter:AnalysisFilter={}):AnalysisRow[]{
 const rows=new Map<string,{clients:Set<string>;orders:Set<string>;pairs:number;revenue:number;cost:number}>();
 for(const sale of selectedSales(data,filter)){
  const client=data.clients.find(c=>c.id===sale.client_id);
  const lines=data.lines.filter(l=>l.document_id===sale.id&&(!filter.design||l.product_id===filter.design));
  if(dimension==='design')for(const line of lines){
   const product=data.products.find(p=>p.id===line.product_id);const key=product?`${product.name} · ${product.sku}`:'Diseño archivado';
   const row=rows.get(key)??{clients:new Set(),orders:new Set(),pairs:0,revenue:0,cost:0};
   if(client)row.clients.add(client.id);row.orders.add(sale.id);row.pairs+=line.quantity;row.revenue+=Number(line.unit_price)*line.quantity-Number(line.line_discount||0);row.cost+=Number(line.unit_cost)*line.quantity;rows.set(key,row);
  }else{
   const key=dimension==='age'?ageLabels[client?.age_range??'unknown']:dimension==='month'?dayKey(sale.created_at).slice(0,7):client?.[dimension]||'Ubicación desconocida';
   const row=rows.get(key)??{clients:new Set(),orders:new Set(),pairs:0,revenue:0,cost:0};if(client)row.clients.add(client.id);row.orders.add(sale.id);row.pairs+=lines.reduce((n,l)=>n+l.quantity,0);
   row.revenue+=filter.design?lines.reduce((n,l)=>n+Number(l.unit_price)*l.quantity-Number(l.line_discount||0),0):Number(sale.total);
   row.cost+=filter.design?lines.reduce((n,l)=>n+Number(l.unit_cost)*l.quantity,0):Number(sale.cogs);rows.set(key,row);
  }
 }
 return [...rows].map(([key,r])=>({key,clients:r.clients.size,orders:r.orders.size,pairs:r.pairs,revenue:Math.round(r.revenue*100)/100,profit:Math.round((r.revenue-r.cost)*100)/100,margin:r.revenue?(r.revenue-r.cost)/r.revenue*100:0,ticket:r.orders.size?r.revenue/r.orders.size:0,suppressed:['age','sector','city','province'].includes(dimension)&&r.clients.size<(data.settings.privacy_minimum??3)})).sort((a,b)=>dimension==='month'?a.key.localeCompare(b.key):b.revenue-a.revenue);
}
export type Notice={key:string;title:string;description:string;target:string;read:boolean};
export function notices(data:Snapshot):Notice[]{
 const result:Omit<Notice,'read'>[]=[],date=today();
 for(const p of data.products.filter(p=>p.active)){
  if(p.available<=p.minimum)result.push({key:`stock-${p.id}-${p.available}`,title:p.available===0?'Diseño agotado':'Inventario bajo',description:`${p.name}: ${p.available} pares disponibles; mínimo ${p.minimum}.`,target:'Inventario'});
  if(Number(p.price)<Number(p.average_cost))result.push({key:`margin-${p.id}-${p.price}-${p.average_cost}`,title:'Margen estimado negativo',description:`${p.name}: el precio es menor que el costo promedio.`,target:'Inventario'});
 }
 for(const o of data.orders.filter(o=>!['delivered','cancelled','returned'].includes(o.status))){
  const tomorrow=new Date(`${date}T12:00:00-04:00`);tomorrow.setDate(tomorrow.getDate()+1);if(o.delivery_date===dayKey(tomorrow.toISOString()))result.push({key:`delivery-${o.id}-${o.delivery_date}`,title:'Entrega próxima',description:`Pedido #${o.number} · Entrega mañana`,target:'Entregas pendientes'});
  if(o.delivery_date<=date)result.push({key:`delivery-${o.id}-${o.delivery_date}`,title:o.delivery_date<date?'Entrega atrasada':'Entrega para hoy',description:`Pedido #${o.number} · ${o.delivery_date}`,target:'Entregas pendientes'});
 }
 for(const p of data.payments.filter(p=>p.status==='pending'))result.push({key:`payment-${p.id}`,title:'Pago por verificar',description:`Referencia ${p.reference||p.id.slice(0,8)}. Verifica antes de confirmar.`,target:'Confirmación de pagos'});
 for(const d of data.documents.filter(d=>d.kind==='sale'&&d.status==='active')){
  const paid=data.payments.filter(p=>p.document_id===d.id&&p.status==='confirmed').reduce((n,p)=>n+Number(p.amount),0);
  if(Number(d.total)>paid&&(!d.due_date||d.due_date>=date))result.push({key:`balance-${d.id}-${paid}`,title:'Saldo pendiente de cliente',description:`${d.contact} · Venta ${d.id.slice(0,8)}`,target:'Cobros pendientes'});
  if(Number(d.total)>paid&&d.due_date&&d.due_date<date)result.push({key:`due-${d.id}-${paid}`,title:'Cuenta por cobrar vencida',description:`${d.contact} · Venció ${d.due_date}`,target:'Cobros pendientes'});
 }
 return result.map(n=>({...n,read:data.notification_reads.includes(n.key)}));
}
