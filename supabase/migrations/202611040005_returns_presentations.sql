alter table public.documents drop constraint documents_total_check;
alter table public.documents add constraint documents_total_check check(total>=0);
create table public.presentations(id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid(),name text not null check(length(trim(name))>0),lines jsonb not null,active boolean not null default true,created_at timestamptz not null default now());
create table public.sale_returns(id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid(),document_id uuid not null references public.documents(id),amount numeric(18,2) not null,cost numeric(18,2) not null,reason text not null,actor_id uuid not null default auth.uid(),created_at timestamptz not null default now());
create table public.return_lines(id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid(),return_id uuid not null references public.sale_returns(id),line_id uuid not null references public.document_lines(id),quantity integer not null check(quantity>0));
alter table public.payments add column refunded_amount numeric(18,2) not null default 0 check(refunded_amount>=0 and refunded_amount<=amount);
alter table public.documents add column original_total numeric(18,2),add column original_cogs numeric(18,2),add column discount numeric(18,2) not null default 0;
update public.documents set original_total=total,original_cogs=cogs;
create function public.sockit_original_document() returns trigger language plpgsql as $$ begin new.original_total:=new.total;new.original_cogs:=new.cogs;return new;end $$;
create trigger original_document before insert on public.documents for each row execute function public.sockit_original_document();
do $$ declare t text;begin foreach t in array array['presentations','sale_returns','return_lines'] loop execute format('alter table public.%I enable row level security',t);execute format('create policy owner_read on public.%I for select to authenticated using(owner_id=auth.uid())',t);execute format('grant select on public.%I to authenticated',t);execute format('revoke insert,update,delete on public.%I from anon,authenticated',t);end loop;end $$;
alter function public.sockit_operation(text,jsonb,uuid) rename to sockit_operation_v2;
revoke all on function public.sockit_operation_v2(text,jsonb,uuid) from public,anon,authenticated;
create function public.sockit_operation(p_kind text,p_payload jsonb,p_key uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
 u uuid:=auth.uid();existing audit_events%rowtype;d documents%rowtype;l document_lines%rowtype;p products%rowtype;pay payments%rowtype;o orders%rowtype;
 result uuid;return_id uuid;item jsonb;remaining integer;qty integer;returned_value numeric(18,2):=0;cost_value numeric(18,2):=0;raw_cost numeric(18,6):=0;
 next_total numeric(18,2);refund numeric(18,2);step_refund numeric(18,2);balance numeric(18,2);discount_value numeric(18,2);delivery_value numeric(18,2);gross numeric(18,2);all_returned boolean;before_doc uuid;normalized jsonb;subtotal numeric;deferred_paid numeric(18,2):=0;payment_id uuid;
begin
 if u is null or p_key is null then raise exception 'Debes iniciar sesión';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select * into existing from audit_events where id=p_key and owner_id=u;
 if found then if existing.kind<>p_kind or existing.payload<>p_payload then raise exception 'Clave de operación reutilizada';end if;return existing.result_id;end if;
 if p_kind in ('presentation','edit_presentation') then
  if length(trim(coalesce(p_payload->>'name','')))=0 or jsonb_typeof(p_payload->'lines') is distinct from 'array' or jsonb_array_length(p_payload->'lines') not between 1 and 100 then raise exception 'Nombre y componentes obligatorios';end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'lines') x group by x->>'product_id' having count(*)>1) then raise exception 'Combina los pares de cada diseño';end if;
  for item in select * from jsonb_array_elements(p_payload->'lines') loop
   if (item->>'quantity')::integer<=0 or (item->>'unit_price')::numeric<0 or not exists(select 1 from products where id=(item->>'product_id')::uuid and owner_id=u and active) then raise exception 'Componente no válido';end if;
  end loop;
  if p_kind='presentation' then insert into presentations(owner_id,name,lines) values(u,p_payload->>'name',p_payload->'lines') returning id into result;
  else update presentations set name=p_payload->>'name',lines=p_payload->'lines',active=coalesce((p_payload->>'active')::boolean,true) where id=(p_payload->>'id')::uuid and owner_id=u returning id into result;if not found then raise exception 'Presentación no disponible';end if;end if;
 elsif p_kind='sale_return' then
  select * into d from documents where id=(p_payload->>'document_id')::uuid and owner_id=u and kind='sale' and status='active' for update;
  if not found then raise exception 'Venta no disponible para devolución';end if;
  if length(trim(coalesce(p_payload->>'description','')))=0 or jsonb_typeof(p_payload->'lines') is distinct from 'array' or jsonb_array_length(p_payload->'lines')<1 then raise exception 'Motivo y pares devueltos obligatorios';end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'lines') x group by x->>'product_id' having count(*)>1) then raise exception 'Diseño duplicado en devolución';end if;
  insert into sale_returns(owner_id,document_id,amount,cost,reason) values(u,d.id,0,0,p_payload->>'description') returning id into return_id;
  for item in select * from jsonb_array_elements(p_payload->'lines') loop
   select * into l from document_lines where document_id=d.id and product_id=(item->>'product_id')::uuid and owner_id=u;
   if not found then raise exception 'El producto no pertenece a la venta';end if;
   select l.quantity-coalesce(sum(quantity),0) into remaining from return_lines where line_id=l.id and owner_id=u;
   qty:=(item->>'quantity')::integer;
   if qty is null or qty<=0 or qty>remaining then raise exception 'La devolución supera los pares vendidos pendientes de devolver';end if;
   returned_value:=returned_value+round(qty*(l.quantity*l.unit_price-l.line_discount)/l.quantity,2);raw_cost:=raw_cost+qty*l.unit_cost;
   select * into p from products where id=l.product_id and owner_id=u for update;
   update products set average_cost=(stock*average_cost+qty*l.unit_cost)/(stock+qty),stock=stock+qty where id=p.id;
   insert into inventory_movements(owner_id,product_id,document_id,quantity,unit_cost) values(u,p.id,d.id,qty,l.unit_cost);
   insert into return_lines(owner_id,return_id,line_id,quantity) values(u,return_id,l.id,qty);
  end loop;
  select not exists(select 1 from document_lines dl where dl.document_id=d.id and dl.owner_id=u and dl.quantity>coalesce((select sum(quantity) from return_lines where line_id=dl.id and owner_id=u),0)) into all_returned;
  if all_returned then returned_value:=d.total;cost_value:=d.cogs;else returned_value:=least(d.total,returned_value);cost_value:=least(d.cogs,round(raw_cost,2));end if;
  next_total:=d.total-returned_value;
  select greatest(0,coalesce(sum(amount-refunded_amount),0)-next_total) into refund from payments where document_id=d.id and owner_id=u and status='confirmed';
  for pay in select * from payments where document_id=d.id and owner_id=u and status='confirmed' order by created_at desc for update loop
   exit when refund<=0;step_refund:=least(refund,pay.amount-pay.refunded_amount);
   select coalesce(sum(amount),0) into balance from cash_movements where owner_id=u and account=pay.account and account_id is not distinct from pay.account_id;
   if balance<step_refund then raise exception 'Saldo insuficiente en la cuenta original para reembolsar';end if;
   perform set_config('sockit.account_id',coalesce(pay.account_id::text,''),true);perform set_config('sockit.order_id',coalesce(pay.order_id::text,''),true);
   insert into cash_movements(owner_id,account,amount,kind,description,document_id,payment_id) values(u,pay.account,-step_refund,'refund',p_payload->>'description',d.id,pay.id);
   update payments set refunded_amount=refunded_amount+step_refund,status=case when refunded_amount+step_refund=amount then 'reversed' else status end where id=pay.id;
   refund:=refund-step_refund;
  end loop;
  update payments set status='rejected' where document_id=d.id and owner_id=u and status='pending';
  update documents set total=next_total,cogs=cogs-cost_value,status=case when all_returned then 'reversed' else status end where id=d.id;
  update sale_returns set amount=returned_value,cost=cost_value where id=return_id;
  if all_returned then update orders set status='returned' where document_id=d.id and owner_id=u;end if;
  result:=d.id;
 elsif p_kind='reverse_sale' then
  select jsonb_agg(jsonb_build_object('product_id',dl.product_id,'quantity',dl.quantity-coalesce((select sum(quantity) from return_lines where line_id=dl.id and owner_id=u),0))) into normalized from document_lines dl where document_id=(p_payload->>'document_id')::uuid and owner_id=u and dl.quantity>coalesce((select sum(quantity) from return_lines where line_id=dl.id and owner_id=u),0);
  if normalized is null then raise exception 'Venta no disponible para reversar';end if;
  result:=sockit_operation('sale_return',jsonb_build_object('document_id',p_payload->>'document_id','description',p_payload->>'description','lines',normalized),gen_random_uuid());
 elsif p_kind='reverse_payment' and exists(select 1 from payments where id=(p_payload->>'payment_id')::uuid and owner_id=u and refunded_amount>0) then
  select * into pay from payments where id=(p_payload->>'payment_id')::uuid and owner_id=u and status='confirmed' for update;if not found then raise exception 'Solo se puede reversar un pago confirmado';end if;
  step_refund:=pay.amount-pay.refunded_amount;select coalesce(sum(amount),0) into balance from cash_movements where owner_id=u and account=pay.account and account_id is not distinct from pay.account_id;
  if balance<step_refund then raise exception 'Saldo insuficiente para reembolsar';end if;
  insert into cash_movements(owner_id,account,amount,kind,description,document_id,payment_id) values(u,pay.account,-step_refund,'refund','Reverso del saldo de cobro',pay.document_id,pay.id);
  update payments set refunded_amount=amount,status='reversed' where id=pay.id;result:=pay.id;
 elsif p_kind='order_status' and p_payload->>'status' in ('cancelled','returned') and exists(select 1 from orders where id=(p_payload->>'order_id')::uuid and owner_id=u and document_id is not null) then
  select * into o from orders where id=(p_payload->>'order_id')::uuid and owner_id=u;
  if not ((o.status='sent' and p_payload->>'status' in ('returned','cancelled'))or(o.status='delivered' and p_payload->>'status'='returned')) then raise exception 'Transición de pedido no permitida';end if;
  perform sockit_operation('reverse_sale',jsonb_build_object('document_id',o.document_id,'description','Devolución del pedido #'||o.number),gen_random_uuid());
  update orders set status=p_payload->>'status' where id=o.id;
  insert into order_history(owner_id,order_id,status,notes) values(u,o.id,p_payload->>'status',coalesce(p_payload->>'notes',''));result:=o.id;
 else
  if p_kind in ('sale','purchase') then
   select coalesce(sum((x->>'quantity')::integer*(x->>'unit_price')::numeric),0) into gross from jsonb_array_elements(p_payload->'lines') x;
   discount_value:=coalesce((p_payload->>'discount')::numeric,0);delivery_value:=case when p_kind='sale' then coalesce((p_payload->>'delivery_charge')::numeric,0) else coalesce((p_payload->>'acquisition')::numeric,0) end;
   if discount_value<0 or discount_value>=gross or delivery_value<0 or coalesce((p_payload->>'paid')::numeric,0)>gross-discount_value+delivery_value then raise exception 'Descuento, entrega o abono inválido';end if;
  end if;
  if p_kind='order_status' then select document_id into before_doc from orders where id=(p_payload->>'order_id')::uuid and owner_id=u;end if;
  normalized:=p_payload;
  if p_kind='sale' and coalesce((p_payload->>'paid')::numeric,0)>gross then deferred_paid:=(p_payload->>'paid')::numeric;normalized:=jsonb_set(p_payload,'{paid}','0');end if;
  result:=sockit_operation_v2(p_kind,normalized,p_key);
  update audit_events set payload=p_payload where id=p_key and owner_id=u;
  if p_kind in ('sale','purchase') and discount_value>0 then
   with allocation as(select id,round(quantity*unit_price/gross*discount_value,2) share,row_number()over(order by id) rn from document_lines where document_id=result and owner_id=u),final as(select id,share+case when rn=1 then discount_value-sum(share)over() else 0 end value from allocation) update document_lines dl set line_discount=f.value from final f where dl.id=f.id;
   if p_kind='purchase' then
    for l in select * from document_lines where document_id=result and owner_id=u loop
     update products set average_cost=(stock*average_cost-l.line_discount)/stock where id=l.product_id and owner_id=u;
     update document_lines set unit_cost=unit_cost-l.line_discount/quantity where id=l.id;
     update inventory_movements set unit_cost=unit_cost-l.line_discount/l.quantity where document_id=result and product_id=l.product_id and owner_id=u;
    end loop;
   end if;
  end if;
  if p_kind in ('sale','purchase') then update documents set total=gross-discount_value+delivery_value,original_total=gross-discount_value+delivery_value,discount=discount_value,delivery_charge=case when p_kind='sale' then delivery_value else 0 end where id=result and owner_id=u;end if;
  if deferred_paid>0 then
   payment_id:=sockit_operation_v2('payment',p_payload||jsonb_build_object('document_id',result,'amount',deferred_paid),gen_random_uuid());
   if coalesce(p_payload->>'account','cash')='cash' and nullif(p_payload->>'account_id','') is null and coalesce(p_payload->>'method','cash')='cash' then perform sockit_operation_v2('confirm_payment',jsonb_build_object('payment_id',payment_id),gen_random_uuid());end if;
  end if;
  if p_kind='order_status' and before_doc is null then update documents set original_total=total,original_cogs=cogs,discount=(select discount from orders where id=result and owner_id=u) where id=(select document_id from orders where id=result and owner_id=u) and owner_id=u;end if;
  return result;
 end if;
 insert into audit_events(id,owner_id,kind,result_id,payload) values(p_key,u,p_kind,result,p_payload);return result;
end $$;
revoke all on function public.sockit_operation(text,jsonb,uuid) from public,anon;grant execute on function public.sockit_operation(text,jsonb,uuid) to authenticated;
alter function public.sockit_snapshot() rename to sockit_snapshot_v2;
revoke all on function public.sockit_snapshot_v2() from public,anon;
create function public.sockit_snapshot() returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select sockit_snapshot_v2()||jsonb_build_object(
 'presentations',coalesce((select jsonb_agg(to_jsonb(p)) from presentations p),'[]'::jsonb),
 'returns',coalesce((select jsonb_agg(to_jsonb(r)) from sale_returns r),'[]'::jsonb),
 'return_lines',coalesce((select jsonb_agg(to_jsonb(r)) from return_lines r),'[]'::jsonb),
 'original_lines',coalesce((select jsonb_agg(to_jsonb(l)) from document_lines l),'[]'::jsonb),
 'lines',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('quantity',l.quantity-coalesce((select sum(quantity) from return_lines where line_id=l.id),0),'line_discount',l.line_discount*(l.quantity-coalesce((select sum(quantity) from return_lines where line_id=l.id),0))/l.quantity)) from document_lines l),'[]'::jsonb),
 'payments',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('original_amount',p.amount,'amount',case when p.status='reversed' then 0 else p.amount-p.refunded_amount end) order by p.created_at desc) from payments p),'[]'::jsonb)
 );
$$;
revoke all on function public.sockit_snapshot() from public,anon;grant execute on function public.sockit_snapshot() to authenticated;
