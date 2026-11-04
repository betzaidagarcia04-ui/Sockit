import type {Snapshot} from './types';
import {dateLabel} from './types';
import {aggregate,selectedSales,type AnalysisFilter} from './analytics';
import {dayKey,orderLabels} from './suite-types';
export type Cell=string|number;
export const reportNames={inventory:'Inventario actual',purchases:'Compras',sales:'Ventas',orders:'Pedidos',deliveries:'Entregas pendientes',receivables:'Cuentas por cobrar',payments:'Pagos por confirmar',collections:'Cobros por método',banks:'Ingresos por banco',movements:'Movimientos financieros',expenses:'Gastos',capital:'Capital y retiros',financial:'Estado de resultados',profit:'Rentabilidad por diseño',province:'Ventas por provincia',age:'Ventas por edad',city:'Ventas por ciudad',sector:'Ventas por sector',recurring:'Clientes recurrentes'};
export type ReportKey=keyof typeof reportNames;
export function reportRows(data:Snapshot,key:ReportKey,filter:AnalysisFilter={}):Cell[][]{
 const within=(d:{created_at:string})=>(!filter.from||dayKey(d.created_at)>=filter.from)&&(!filter.to||dayKey(d.created_at)<=filter.to);
 const client=(id:string|null)=>data.clients.find(c=>c.id===id)?.name??'Sin cliente asociado';
 const wallet=(id:string|null)=>data.accounts.find(a=>a.id===id)?.name??'Efectivo / banco histórico';
 if(key==='inventory')return [['SKU','Diseño','Colección','Categoría','Color','Talla','Tipo','Marca','Proveedor','Físicos','Reservados','Disponibles','Costo promedio','Precio'],...data.products.filter(p=>!filter.design||p.id===filter.design).map(p=>[p.sku,p.name,p.collection,p.category,p.color,p.size,p.sock_type,p.brand,data.suppliers.find(s=>s.id===p.supplier_id)?.name??'',p.stock,p.reserved,p.available,Number(p.average_cost),Number(p.price)])];
 if(key==='financial'){
  const docs=selectedSales(data,filter),revenue=docs.reduce((n,d)=>n+Math.round(Number(d.total)*100),0)/100,cogs=docs.reduce((n,d)=>n+Math.round(Number(d.cogs)*100),0)/100,expenses=-data.movements.filter(m=>m.kind==='expense'&&within(m)).reduce((n,m)=>n+Number(m.amount),0);
  return [['Concepto','Valor'],['Ventas netas actuales por fecha de venta',revenue],['Costo de mercancía vendida',cogs],['Ganancia bruta',revenue-cogs],['Gastos por fecha de movimiento',expenses],['Ganancia neta',revenue-cogs-expenses],['Margen neto',revenue?`${((revenue-cogs-expenses)/revenue*100).toFixed(2)} %`:'Sin ventas']];
 }
 if(key==='sales'||key==='purchases')return [['Registro','Fecha','Contacto','Estado','Total','Costo vendido','Ganancia bruta'],...(key==='sales'?selectedSales(data,filter):data.documents.filter(d=>d.kind==='purchase'&&within(d))).map(d=>[d.id,dateLabel(d.created_at),d.contact,d.status,Number(d.total),Number(d.cogs),d.kind==='sale'?Number(d.total)-Number(d.cogs):0])];
 if(key==='orders'||key==='deliveries')return [['Pedido','Cliente','Entrega','Estado','Total','Confirmado','Pendiente'],...data.orders.filter(o=>within(o)&&(key!=='deliveries'||!['delivered','cancelled','returned'].includes(o.status))).map(o=>{const paid=data.payments.filter(p=>p.order_id===o.id&&p.status==='confirmed').reduce((n,p)=>n+Number(p.amount),0);return [o.number,client(o.client_id),o.delivery_date,orderLabels[o.status],Number(o.total),paid,Number(o.total)-paid];})];
 if(key==='receivables')return [['Venta','Cliente','Vencimiento','Facturado','Cobrado','Saldo'],...selectedSales(data,filter).flatMap(d=>{const paid=data.payments.filter(p=>p.document_id===d.id&&p.status==='confirmed').reduce((n,p)=>n+Number(p.amount),0);return Number(d.total)>paid?[[d.id,d.contact,d.due_date??'',Number(d.total),paid,Number(d.total)-paid]]:[];})];
 if(['payments','collections','banks'].includes(key))return [['Pago','Fecha','Cliente','Método','Cuenta','Monto original','Reembolsado','Comisión','Neto confirmado','Estado'],...data.payments.filter(p=>within(p)&&(key==='payments'?p.status==='pending':p.status==='confirmed')&&(key!=='banks'||p.account==='bank')).map(p=>[p.id,dateLabel(p.created_at),p.document_id?data.documents.find(d=>d.id===p.document_id)?.contact??'':client(data.orders.find(o=>o.id===p.order_id)?.client_id??null),p.method,wallet(p.account_id),Number(p.original_amount??p.amount),Number(p.refunded_amount??0),Number(p.fee),Number(p.amount)-Number(p.fee),p.status])];
 if(['movements','expenses','capital'].includes(key))return [['Movimiento','Fecha','Concepto','Tipo','Cuenta','Monto','Conciliado'],...data.movements.filter(m=>within(m)&&(key==='movements'||(key==='expenses'?m.kind==='expense':['capital','withdrawal'].includes(m.kind)))).map(m=>[m.id,dateLabel(m.created_at),m.description,m.kind,wallet(m.account_id),Number(m.amount),m.reconciled_at?'Sí':'No'])];
 if(['profit','age','province','city','sector'].includes(key))return [['Grupo','Clientes únicos','Ventas','Pares','Ingresos','Ganancia bruta','Margen %','Ticket medio'],...aggregate(data,key==='profit'?'design':key as 'age'|'province'|'city'|'sector',filter).map(r=>r.suppressed?[r.key,'Dato protegido','Dato protegido','Dato protegido','Dato protegido','Dato protegido','Dato protegido','Dato protegido']:[r.key,r.clients,r.orders,r.pairs,r.revenue,r.profit,Number(r.margin.toFixed(2)),Number(r.ticket.toFixed(2))])];
 return [['Cliente','Ventas','Total comprado','Primera compra','Última compra'],...data.clients.flatMap(c=>{const docs=selectedSales(data,filter).filter(d=>d.client_id===c.id).sort((a,b)=>a.created_at.localeCompare(b.created_at));return docs.length>1?[[c.name,docs.length,docs.reduce((n,d)=>n+Number(d.total),0),dateLabel(docs[0].created_at),dateLabel(docs.at(-1)!.created_at)]]:[];})];
}
export function csvText(rows:Cell[][]){return '\uFEFF'+rows.map(row=>row.map(cell=>{let text=String(cell);if(typeof cell==='string'&&/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}).join(',')).join('\r\n');}
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export async function exportReport(rows:Cell[][],title:string,format:'csv'|'xlsx'|'pdf'){
 if(format==='csv')return download(new Blob([csvText(rows)],{type:'text/csv;charset=utf-8;'}),`${title}.csv`);
 if(format==='xlsx'){
  const {default:writeXlsx}=await import('write-excel-file/universal');
  const cells=rows.map((row,index)=>row.map(value=>index===0?{value,fontWeight:'bold' as const,textColor:'#F7EEE3',backgroundColor:'#6E2A35'}:value));
  const blob=await writeXlsx(cells,{sheet:'SOCKIT',stickyRowsCount:1,columns:rows[0].map(()=>({width:24}))}).toBlob();
  return download(blob,`${title}.xlsx`);
 }
 const {jsPDF}=await import('jspdf'),{autoTable}=await import('jspdf-autotable');const pdf=new jsPDF({orientation:'landscape'});pdf.setTextColor('#6E2A35');pdf.setFontSize(19);pdf.text(`SOCKIT · ${title}`,14,17);pdf.setFontSize(9);pdf.text('Registros persistentes · Pesos dominicanos (RD$)',14,24);autoTable(pdf,{head:[rows[0]],body:rows.slice(1),startY:31,styles:{fontSize:7},headStyles:{fillColor:[110,42,53]},alternateRowStyles:{fillColor:[247,238,227]},didDrawPage:()=>{pdf.setFontSize(8);pdf.text(`SOCKIT · ${pdf.getNumberOfPages()}`,14,pdf.internal.pageSize.height-8);}});pdf.save(`${title}.pdf`);
}
