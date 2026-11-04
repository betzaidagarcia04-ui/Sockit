-- PostgreSQL / Supabase. Todas las escrituras de negocio se hacen por RPC.
create table if not exists public.products (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid(),
 sku text not null check(length(sku) between 1 and 60), name text not null check(length(name) between 1 and 160),
 category text not null default '', color text not null default '', size text not null default '',
 price numeric(18,2) not null check(price>=0), average_cost numeric(18,6) not null default 0 check(average_cost>=0),
 stock integer not null default 0 check(stock>=0), minimum integer not null default 5 check(minimum>=0),
 active boolean not null default true, created_at timestamptz not null default now(), unique(owner_id,sku)
);
create table if not exists public.documents (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid(),
 kind text not null check(kind in ('purchase','sale')), contact text not null,
 reference text not null default '', total numeric(18,2) not null check(total>0),
 acquisition numeric(18,2) not null default 0, cogs numeric(18,2) not null default 0,
 status text not null default 'active' check(status in ('active','reversed')),
 created_at timestamptz not null default now()
);
create table if not exists public.document_lines (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid(),
 document_id uuid not null references public.documents(id), product_id uuid not null references public.products(id),
 quantity integer not null check(quantity>0), unit_price numeric(18,2) not null check(unit_price>=0),
 unit_cost numeric(18,6) not null check(unit_cost>=0), unique(document_id,product_id)
);
create table if not exists public.inventory_movements (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid(),
 product_id uuid not null references public.products(id), document_id uuid not null references public.documents(id),
 quantity integer not null check(quantity<>0), unit_cost numeric(18,6) not null,
 created_at timestamptz not null default now()
);
create table if not exists public.payments (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid(),
 document_id uuid not null references public.documents(id), amount numeric(18,2) not null check(amount>0),
 account text not null check(account in ('cash','bank')), reference text not null default '',
 status text not null check(status in ('pending','confirmed','rejected','reversed')),
 confirmed_by uuid, confirmed_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.cash_movements (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid(),
 account text not null check(account in ('cash','bank')), amount numeric(18,2) not null check(amount<>0),
 kind text not null check(kind in ('capital','withdrawal','expense','purchase','collection','transfer','refund')),
 description text not null, document_id uuid references public.documents(id),
 payment_id uuid references public.payments(id), created_at timestamptz not null default now()
);
create unique index if not exists one_collection_per_payment on public.cash_movements(payment_id) where kind='collection';
create table if not exists public.audit_events (
 id uuid primary key, owner_id uuid not null default auth.uid(), kind text not null,
 result_id uuid not null, payload jsonb not null, created_at timestamptz not null default now()
);

-- SELECT aislado por usuario; sin permisos directos INSERT/UPDATE/DELETE.
do $$ declare t text; begin
 foreach t in array array['products','documents','document_lines','inventory_movements','payments','cash_movements','audit_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy owner_read on public.%I for select to authenticated using (owner_id=auth.uid())',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('revoke insert,update,delete on public.%I from anon,authenticated',t);
 end loop;
end $$;

create or replace function public.sockit_operation(p_kind text, p_payload jsonb, p_key uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
 u uuid := auth.uid(); result uuid; doc uuid; row_item jsonb; product products%rowtype;
 pay payments%rowtype; document documents%rowtype; n integer; units integer := 0;
 amount numeric(18,2); paid numeric(18,2); extra numeric(18,2); total_value numeric(18,2):=0;
 cost_value numeric(18,6):=0; unit_value numeric(18,2); new_cost numeric(18,6);
 account_value text; label text; balance numeric(18,2); existing_kind text; existing_payload jsonb; original_line document_lines%rowtype;
begin
 if u is null then raise exception 'Debes iniciar sesión'; end if;
 if p_key is null then raise exception 'Falta la clave de operación'; end if;
 -- Serializa escrituras del mismo negocio y las confirmaciones concurrentes.
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select result_id,kind,payload into result,existing_kind,existing_payload from audit_events where id=p_key and owner_id=u;
 if found then
  if existing_kind<>p_kind or existing_payload<>p_payload then raise exception 'Clave de operación reutilizada'; end if;
  return result;
 end if;
 account_value:=coalesce(p_payload->>'account','cash');
 if account_value not in ('cash','bank') then raise exception 'Cuenta inválida'; end if;
 label:=trim(coalesce(p_payload->>'description',''));
 if p_kind='product' then
  if length(trim(coalesce(p_payload->>'sku','')))=0 or length(trim(coalesce(p_payload->>'name','')))=0 then raise exception 'SKU y nombre son obligatorios'; end if;
  insert into products(owner_id,sku,name,category,color,size,price,minimum)
  values(u,upper(trim(p_payload->>'sku')),trim(p_payload->>'name'),coalesce(p_payload->>'category',''),coalesce(p_payload->>'color',''),coalesce(p_payload->>'size',''),(p_payload->>'price')::numeric,(p_payload->>'minimum')::integer) returning id into result;
 elsif p_kind='edit_product' then
  if length(trim(coalesce(p_payload->>'sku','')))=0 or length(trim(coalesce(p_payload->>'name','')))=0 then raise exception 'SKU y nombre son obligatorios'; end if;
  update products set sku=upper(trim(p_payload->>'sku')),name=trim(p_payload->>'name'),category=coalesce(p_payload->>'category',''),color=coalesce(p_payload->>'color',''),size=coalesce(p_payload->>'size',''),price=(p_payload->>'price')::numeric,minimum=(p_payload->>'minimum')::integer,active=(p_payload->>'active')::boolean where id=(p_payload->>'product_id')::uuid and owner_id=u returning id into result;
  if not found then raise exception 'Producto no disponible'; end if;
 elsif p_kind in ('purchase','sale') then
  if jsonb_typeof(p_payload->'lines') is distinct from 'array' or jsonb_array_length(p_payload->'lines') not between 1 and 100 then raise exception 'Agrega entre 1 y 100 líneas'; end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'lines') x group by x->>'product_id' having count(*)>1) then raise exception 'Combina las cantidades del mismo producto en una línea'; end if;
  if length(trim(coalesce(p_payload->>'contact','')))=0 then raise exception 'Indica cliente o proveedor'; end if;
  extra:=coalesce((p_payload->>'acquisition')::numeric,0);
  paid:=coalesce((p_payload->>'paid')::numeric,0);
  if extra<0 or paid<0 or (p_kind='sale' and extra<>0) then raise exception 'Importes inválidos'; end if;
  for row_item in select * from jsonb_array_elements(p_payload->'lines') loop
   n:=(row_item->>'quantity')::integer;
   unit_value:=(row_item->>'unit_price')::numeric;
   if n is null or n<=0 or unit_value is null or unit_value<0 then raise exception 'Cantidad o precio inválido'; end if;
   select * into product from products where id=(row_item->>'product_id')::uuid and owner_id=u and active for update;
   if not found then raise exception 'Producto no disponible'; end if;
   if p_kind='sale' and product.stock<n then raise exception 'Existencias insuficientes: %',product.name; end if;
   units:=units+n; total_value:=total_value+n*unit_value;
   if p_kind='sale' then cost_value:=cost_value+n*product.average_cost; end if;
  end loop;
  total_value:=total_value+extra;
  if total_value<=0 or paid>total_value then raise exception 'Total o abono inválido'; end if;
  if p_kind='purchase' and paid>0 then
   select coalesce(sum(m.amount),0) into balance from cash_movements m where owner_id=u and account=account_value;
   if balance<paid then raise exception 'Saldo insuficiente en la cuenta seleccionada'; end if;
  end if;
  insert into documents(owner_id,kind,contact,reference,total,acquisition,cogs)
   values(u,p_kind,trim(p_payload->>'contact'),coalesce(p_payload->>'reference',''),total_value,extra,round(cost_value,2)) returning id into doc;
  for row_item in select * from jsonb_array_elements(p_payload->'lines') loop
   n:=(row_item->>'quantity')::integer; unit_value:=(row_item->>'unit_price')::numeric;
   select * into product from products where id=(row_item->>'product_id')::uuid and owner_id=u for update;
   new_cost:=case when p_kind='purchase' then unit_value+extra/units else product.average_cost end;
   insert into document_lines(owner_id,document_id,product_id,quantity,unit_price,unit_cost) values(u,doc,product.id,n,unit_value,new_cost);
   insert into inventory_movements(owner_id,document_id,product_id,quantity,unit_cost) values(u,doc,product.id,case when p_kind='purchase' then n else -n end,new_cost);
   if p_kind='purchase' then
    update products set average_cost=(stock*average_cost+n*new_cost)/(stock+n),stock=stock+n where id=product.id;
   else update products set stock=stock-n where id=product.id; end if;
  end loop;
  if paid>0 then
   if p_kind='purchase' then
    insert into cash_movements(owner_id,account,amount,kind,description,document_id) values(u,account_value,-paid,'purchase','Pago de compra',doc);
   else
    insert into payments(owner_id,document_id,amount,account,reference,status,confirmed_by,confirmed_at)
     values(u,doc,paid,account_value,coalesce(p_payload->>'reference',''),case when account_value='cash' then 'confirmed' else 'pending' end,case when account_value='cash' then u end,case when account_value='cash' then now() end) returning * into pay;
    if pay.status='confirmed' then insert into cash_movements(owner_id,account,amount,kind,description,document_id,payment_id) values(u,account_value,paid,'collection','Cobro de venta',doc,pay.id); end if;
   end if;
  end if;
  result:=doc;
 elsif p_kind in ('capital','expense','withdrawal','transfer') then
  amount:=(p_payload->>'amount')::numeric;
  if amount is null or amount<=0 or length(label)=0 then raise exception 'Indica un monto positivo y un concepto'; end if;
  if p_kind<>'capital' then
   select coalesce(sum(m.amount),0) into balance from cash_movements m where owner_id=u and account=account_value;
   if balance<amount then raise exception 'Saldo insuficiente en la cuenta seleccionada'; end if;
  end if;
  insert into cash_movements(owner_id,account,amount,kind,description) values(u,account_value,case when p_kind='capital' then amount else -amount end,p_kind,label) returning id into result;
  if p_kind='transfer' then insert into cash_movements(owner_id,account,amount,kind,description) values(u,case when account_value='cash' then 'bank' else 'cash' end,amount,'transfer',label); end if;
 elsif p_kind='purchase_payment' then
  select * into document from documents where id=(p_payload->>'document_id')::uuid and owner_id=u and kind='purchase' and status='active' for update;
  if not found then raise exception 'Compra no disponible'; end if;
  amount:=(p_payload->>'amount')::numeric;
  select -coalesce(sum(m.amount),0) into paid from cash_movements m where document_id=document.id and kind='purchase';
  if amount is null or amount<=0 or amount+paid>document.total then raise exception 'El pago supera la deuda pendiente'; end if;
  select coalesce(sum(m.amount),0) into balance from cash_movements m where owner_id=u and account=account_value;
  if balance<amount then raise exception 'Saldo insuficiente en la cuenta seleccionada'; end if;
  insert into cash_movements(owner_id,account,amount,kind,description,document_id) values(u,account_value,-amount,'purchase','Abono a proveedor',document.id) returning id into result;
 elsif p_kind='reverse_sale' then
  if length(label)=0 then raise exception 'Documenta el motivo de la devolución o anulación'; end if;
  select * into document from documents where id=(p_payload->>'document_id')::uuid and owner_id=u and kind='sale' for update;
  if not found or document.status<>'active' then raise exception 'Venta no disponible para reversar'; end if;
  for pay in select * from payments where document_id=document.id and owner_id=u and status='confirmed' for update loop
   select coalesce(sum(m.amount),0) into balance from cash_movements m where owner_id=u and account=pay.account;
   if balance<pay.amount then raise exception 'Saldo insuficiente para reembolsar el cobro'; end if;
   insert into cash_movements(owner_id,account,amount,kind,description,document_id,payment_id) values(u,pay.account,-pay.amount,'refund',label,document.id,pay.id);
  end loop;
  update payments set status='reversed' where document_id=document.id and owner_id=u and status in ('confirmed','pending');
  for original_line in select * from document_lines where document_id=document.id and owner_id=u loop
   select * into product from products where id=original_line.product_id and owner_id=u for update;
   update products set average_cost=(stock*average_cost+original_line.quantity*original_line.unit_cost)/(stock+original_line.quantity),stock=stock+original_line.quantity where id=product.id;
   insert into inventory_movements(owner_id,product_id,document_id,quantity,unit_cost) values(u,product.id,document.id,original_line.quantity,original_line.unit_cost);
  end loop;
  update documents set status='reversed' where id=document.id;
  result:=document.id;
 elsif p_kind='payment' then
  select * into document from documents where id=(p_payload->>'document_id')::uuid and owner_id=u and kind='sale' and status='active' for update;
  if not found then raise exception 'Venta no disponible'; end if;
  amount:=(p_payload->>'amount')::numeric;
  select coalesce(sum(p.amount),0) into paid from payments p where document_id=document.id and status in ('pending','confirmed');
  if amount is null or amount<=0 or amount+paid>document.total then raise exception 'El abono supera el saldo disponible para reportar'; end if;
  insert into payments(owner_id,document_id,amount,account,reference,status) values(u,document.id,amount,account_value,coalesce(p_payload->>'reference',''),'pending') returning id into result;
 elsif p_kind in ('confirm_payment','reject_payment','reverse_payment') then
  select * into pay from payments where id=(p_payload->>'payment_id')::uuid and owner_id=u for update;
  if not found then raise exception 'Pago no disponible'; end if;
  if p_kind='reverse_payment' then
   if pay.status<>'confirmed' then raise exception 'Solo se puede reversar un pago confirmado'; end if;
   select coalesce(sum(m.amount),0) into balance from cash_movements m where owner_id=u and account=pay.account;
   if balance<pay.amount then raise exception 'Saldo insuficiente para el reembolso'; end if;
   insert into cash_movements(owner_id,account,amount,kind,description,document_id,payment_id) values(u,pay.account,-pay.amount,'refund','Reverso de cobro',pay.document_id,pay.id);
   update payments set status='reversed' where id=pay.id;
  else
   if pay.status<>'pending' then raise exception 'Este pago ya fue procesado'; end if;
   if p_kind='confirm_payment' then
    insert into cash_movements(owner_id,account,amount,kind,description,document_id,payment_id) values(u,pay.account,pay.amount,'collection','Cobro confirmado',pay.document_id,pay.id);
    update payments set status='confirmed',confirmed_by=u,confirmed_at=now() where id=pay.id;
   else update payments set status='rejected' where id=pay.id; end if;
  end if;
  result:=pay.id;
 else raise exception 'Operación no admitida'; end if;
 insert into audit_events(id,owner_id,kind,result_id,payload) values(p_key,u,p_kind,result,p_payload);
 return result;
end $$;
revoke all on function public.sockit_operation(text,jsonb,uuid) from public,anon;
grant execute on function public.sockit_operation(text,jsonb,uuid) to authenticated;
