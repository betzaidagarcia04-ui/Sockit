-- Ampliación incremental: conserva tablas, saldos y migraciones anteriores.
create table public.clients (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid(),
 name text not null check(length(trim(name)) between 1 and 160),phone text not null default '',
 age_range text not null default 'unknown' check(age_range in ('unknown','under18','18-24','25-34','35-44','45-54','55+')),
 province text not null default '',city text not null default '',municipality text not null default '',sector text not null default '',address text not null default '',
 latitude numeric check(latitude between 17.4 and 20.1),longitude numeric check(longitude between -72.1 and -68),
 notes text not null default '',active boolean not null default true,created_at timestamptz not null default now(),
 check((latitude is null)=(longitude is null))
);
create table public.suppliers(id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid(),name text not null,phone text not null default '',email text not null default '',notes text not null default '',active boolean not null default true);
create table public.bank_accounts (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid(),institution text not null,name text not null,
 account_type text not null default 'Ahorros',account_number text not null default '',holder text not null,currency text not null default 'DOP' check(currency='DOP'),
 active boolean not null default true,created_at timestamptz not null default now()
);
create table public.private_files(id uuid primary key,owner_id uuid not null default auth.uid(),name text not null,mime text not null check(mime in ('image/png','image/jpeg','image/webp','application/pdf')),size integer not null check(size between 1 and 5242880),purpose text not null check(purpose in ('product','receipt')),sha256 text not null,created_at timestamptz not null default now());
alter table public.products add column collection text not null default '',add column sock_type text not null default '',add column brand text not null default 'SOCKIT',add column supplier_id uuid references public.suppliers(id),add column photo_id uuid references public.private_files(id);
alter table public.documents add column client_id uuid references public.clients(id),add column supplier_id uuid references public.suppliers(id),add column due_date date,add column delivery_charge numeric(18,2) not null default 0;
create table public.orders (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid(),number bigint generated always as identity,
 client_id uuid not null references public.clients(id),status text not null default 'new' check(status in ('new','confirmed','preparing','ready','sent','delivered','cancelled','returned')),
 total numeric(18,2) not null check(total>0),delivery_cost numeric(18,2) not null default 0 check(delivery_cost>=0),discount numeric(18,2) not null default 0 check(discount>=0),
 delivery_date date not null,delivery_method text not null default 'Entrega',address text not null default '',notes text not null default '',
 document_id uuid unique references public.documents(id),delivered_at timestamptz,created_at timestamptz not null default now()
);
alter table public.document_lines add column line_discount numeric(18,2) not null default 0;
create table public.order_lines(id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid(),order_id uuid not null references public.orders(id),product_id uuid not null references public.products(id),quantity integer not null check(quantity>0),unit_price numeric(18,2) not null check(unit_price>=0),unique(order_id,product_id));
create table public.reservations(id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid(),order_id uuid not null references public.orders(id),product_id uuid not null references public.products(id),quantity integer not null check(quantity>0),status text not null check(status in ('active','consumed','released')),unique(order_id,product_id));
create table public.order_history(id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid(),order_id uuid not null references public.orders(id),status text not null,actor_id uuid not null default auth.uid(),notes text not null default '',created_at timestamptz not null default now());
alter table public.payments alter column document_id drop not null;
alter table public.payments add column order_id uuid references public.orders(id),add column account_id uuid references public.bank_accounts(id),add column method text not null default 'cash',add column origin_bank text not null default '',add column fee numeric(18,2) not null default 0 check(fee>=0 and fee<amount),add column receipt_id uuid references public.private_files(id),add constraint payment_target check(document_id is not null or order_id is not null);
alter table public.cash_movements add column order_id uuid references public.orders(id),add column account_id uuid references public.bank_accounts(id),add column reconciled_at timestamptz,add column reconciled_by uuid;
create unique index one_fee_per_payment on public.cash_movements(payment_id) where kind='expense';
create table public.bank_statements(id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid(),account_id uuid not null references public.bank_accounts(id),statement_date date not null,statement_balance numeric(18,2) not null,book_balance numeric(18,2) not null,notes text not null,created_at timestamptz not null default now());
create table public.catalogs(id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid(),kind text not null check(kind in ('bank','location','payment_method','category','expense_category')),label text not null check(length(trim(label))>0),active boolean not null default true,unique(owner_id,kind,label));
create table public.business_settings(owner_id uuid primary key default auth.uid(),name text not null default 'SOCKIT',payment_message text not null default 'Hola, {cliente}. Te recordamos el saldo pendiente de tu pedido SOCKIT: {saldo}.',delivery_message text not null default 'Hola, {cliente}. Estamos preparando tu entrega SOCKIT para {fecha}.',privacy_minimum integer not null default 3 check(privacy_minimum between 3 and 100));
create table public.read_notifications(owner_id uuid not null default auth.uid(),event_key text not null,created_at timestamptz not null default now(),primary key(owner_id,event_key));
do $$ declare t text; begin
 foreach t in array array['clients','suppliers','bank_accounts','private_files','orders','order_lines','reservations','order_history','bank_statements','catalogs','business_settings','read_notifications'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy owner_read on public.%I for select to authenticated using(owner_id=auth.uid())',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('revoke insert,update,delete on public.%I from anon,authenticated',t);
 end loop;
end $$;

-- Contexto de cuenta para los movimientos generados por el motor anterior.
create function public.sockit_financial_context() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.account='bank' then new.account_id:=nullif(current_setting('sockit.account_id',true),'')::uuid; else new.account_id:=null; end if;
 new.order_id:=nullif(current_setting('sockit.order_id',true),'')::uuid;
 if TG_TABLE_NAME='cash_movements' then
  if new.payment_id is not null then select p.account_id,p.order_id into new.account_id,new.order_id from payments p where p.id=new.payment_id and p.owner_id=new.owner_id; end if;
 end if;
 return new;
end $$;
create trigger financial_account before insert on public.cash_movements for each row execute function public.sockit_financial_context();
create trigger payment_account before insert on public.payments for each row execute function public.sockit_financial_context();

alter function public.sockit_operation(text,jsonb,uuid) rename to sockit_operation_v1;
revoke all on function public.sockit_operation_v1(text,jsonb,uuid) from public,anon,authenticated;
alter function public.sockit_snapshot() rename to sockit_snapshot_v1;
revoke all on function public.sockit_snapshot_v1() from public,anon;

create function public.sockit_operation(p_kind text,p_payload jsonb,p_key uuid) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare
 u uuid:=auth.uid(); result uuid; previous audit_events%rowtype; c clients%rowtype; o orders%rowtype; p products%rowtype;
 payment payments%rowtype; line jsonb; original_line order_lines%rowtype; acc uuid; target uuid; item uuid; sid uuid; oid uuid;
 amount_value numeric(18,2); balance_value numeric(18,2); total_value numeric(18,2):=0; discount_value numeric(18,2); delivery_value numeric(18,2); available integer;
 status_value text; normalized jsonb; payload_value jsonb:=p_payload; client_value uuid; lines_value jsonb; count_value integer;
begin
 if u is null then raise exception 'Debes iniciar sesión'; end if;
 if p_key is null or p_payload is null then raise exception 'Solicitud incompleta'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select * into previous from audit_events where id=p_key and owner_id=u;
 if found then
  if previous.kind<>p_kind or previous.payload<>p_payload then raise exception 'Clave de operación reutilizada'; end if;
  return previous.result_id;
 end if;
 acc:=nullif(p_payload->>'account_id','')::uuid;
 if acc is not null and not exists(select 1 from bank_accounts where id=acc and owner_id=u and active) then raise exception 'Cuenta bancaria no disponible'; end if;
 if acc is not null then payload_value:=jsonb_set(payload_value,'{account}','"bank"'); end if;
 perform set_config('sockit.account_id',coalesce(acc::text,''),true);
 perform set_config('sockit.order_id','',true);

 if p_kind in ('sale','payment','order_payment') then
  if coalesce(payload_value->>'account','cash')='bank' and coalesce(p_payload->>'method','cash')='cash' then payload_value:=jsonb_set(payload_value,'{method}','"transfer"'); end if;
  if coalesce(payload_value->>'method','cash')<>'cash' and coalesce(payload_value->>'account','cash')<>'bank' then raise exception 'Selecciona una cuenta bancaria para el método de pago'; end if;
  if coalesce((p_payload->>'fee')::numeric,0)>0 and coalesce(payload_value->>'method','') not in ('credit_card','debit_card') then raise exception 'La comisión solo corresponde a pagos por tarjeta'; end if;
 end if;
 if nullif(p_payload->>'receipt_id','') is not null and not exists(select 1 from private_files where id=(p_payload->>'receipt_id')::uuid and owner_id=u and purpose='receipt') then raise exception 'Comprobante no disponible'; end if;
 if p_kind='reverse_sale' or (p_kind='order_status' and p_payload->>'status' in ('cancelled','returned')) then
  for payment in select distinct on (account,account_id) * from payments where owner_id=u and status='confirmed' and (document_id=nullif(p_payload->>'document_id','')::uuid or order_id=nullif(p_payload->>'order_id','')::uuid) loop
   select coalesce(sum(amount),0) into amount_value from payments where owner_id=u and status='confirmed' and account=payment.account and account_id is not distinct from payment.account_id and (document_id=nullif(p_payload->>'document_id','')::uuid or order_id=nullif(p_payload->>'order_id','')::uuid);
   select coalesce(sum(amount),0) into balance_value from cash_movements where owner_id=u and account=payment.account and account_id is not distinct from payment.account_id;
   if balance_value<amount_value then raise exception 'Saldo insuficiente en la cuenta original para reembolsar'; end if;
  end loop;
 end if;
 if p_kind in ('client','edit_client') then
  if length(trim(coalesce(p_payload->>'name','')))=0 then raise exception 'Nombre obligatorio'; end if;
  if p_kind='client' then insert into clients(owner_id,name) values(u,trim(p_payload->>'name')) returning id into result;
  else select id into result from clients where id=(p_payload->>'id')::uuid and owner_id=u; if not found then raise exception 'Cliente no disponible'; end if; end if;
  update clients set name=trim(p_payload->>'name'),phone=coalesce(p_payload->>'phone',''),age_range=coalesce(p_payload->>'age_range','unknown'),
   province=initcap(regexp_replace(trim(coalesce(p_payload->>'province','')),'\s+',' ','g')),city=initcap(regexp_replace(trim(coalesce(p_payload->>'city','')),'\s+',' ','g')),
   municipality=initcap(regexp_replace(trim(coalesce(p_payload->>'municipality','')),'\s+',' ','g')),sector=initcap(regexp_replace(trim(coalesce(p_payload->>'sector','')),'\s+',' ','g')),
   address=coalesce(p_payload->>'address',''),latitude=nullif(p_payload->>'latitude','')::numeric,longitude=nullif(p_payload->>'longitude','')::numeric,notes=coalesce(p_payload->>'notes',''),active=coalesce((p_payload->>'active')::boolean,true) where id=result;
 elsif p_kind in ('supplier','edit_supplier') then
  if length(trim(coalesce(p_payload->>'name','')))=0 then raise exception 'Nombre obligatorio'; end if;
  if p_kind='supplier' then insert into suppliers(owner_id,name) values(u,trim(p_payload->>'name')) returning id into result;
  else select id into result from suppliers where id=(p_payload->>'id')::uuid and owner_id=u; if not found then raise exception 'Proveedor no disponible'; end if; end if;
  update suppliers set name=trim(p_payload->>'name'),phone=coalesce(p_payload->>'phone',''),email=coalesce(p_payload->>'email',''),notes=coalesce(p_payload->>'notes',''),active=coalesce((p_payload->>'active')::boolean,true) where id=result;
 elsif p_kind='file' then
  if length(coalesce(p_payload->>'sha256',''))<>64 then raise exception 'Archivo sin integridad verificable'; end if;
  insert into private_files(id,owner_id,name,mime,size,purpose,sha256) values((p_payload->>'id')::uuid,u,p_payload->>'name',p_payload->>'mime',(p_payload->>'size')::integer,p_payload->>'purpose',p_payload->>'sha256') returning id into result;
 elsif p_kind in ('bank_account','edit_bank_account') then
  if length(trim(coalesce(p_payload->>'name','')))=0 or length(trim(coalesce(p_payload->>'institution','')))=0 or length(trim(coalesce(p_payload->>'holder','')))=0 then raise exception 'Completa nombre, banco y titular'; end if;
  if p_kind='bank_account' then insert into bank_accounts(owner_id,name,institution,holder) values(u,p_payload->>'name',p_payload->>'institution',p_payload->>'holder') returning id into result;
  else select id into result from bank_accounts where id=(p_payload->>'id')::uuid and owner_id=u; if not found then raise exception 'Cuenta no disponible'; end if; end if;
  update bank_accounts set name=trim(p_payload->>'name'),institution=trim(p_payload->>'institution'),holder=trim(p_payload->>'holder'),account_type=coalesce(p_payload->>'account_type','Ahorros'),active=coalesce((p_payload->>'active')::boolean,true),account_number=case when coalesce(p_payload->>'account_number','')='' then account_number else p_payload->>'account_number' end where id=result;
 elsif p_kind='bank_transfer' then
  target:=nullif(p_payload->>'target_account_id','')::uuid;
  if target is not null and not exists(select 1 from bank_accounts where id=target and owner_id=u and active) then raise exception 'Cuenta de destino no disponible'; end if;
  if acc is not distinct from target then raise exception 'Las cuentas de origen y destino deben ser distintas'; end if;
  amount_value:=(p_payload->>'amount')::numeric;
  if amount_value is null or amount_value<=0 or length(trim(coalesce(p_payload->>'description','')))=0 then raise exception 'Monto y concepto obligatorios'; end if;
  select coalesce(sum(amount),0) into balance_value from cash_movements where owner_id=u and account=case when acc is null then 'cash' else 'bank' end and account_id is not distinct from acc;
  if balance_value<amount_value then raise exception 'Saldo insuficiente en la cuenta de origen'; end if;
  insert into cash_movements(owner_id,account,amount,kind,description) values(u,case when acc is null then 'cash' else 'bank' end,-amount_value,'transfer',p_payload->>'description') returning id into result;
  perform set_config('sockit.account_id',coalesce(target::text,''),true);
  insert into cash_movements(owner_id,account,amount,kind,description) values(u,case when target is null then 'cash' else 'bank' end,amount_value,'transfer',p_payload->>'description');
 elsif p_kind='reconcile' then
  if acc is null then raise exception 'Selecciona una cuenta bancaria'; end if;
  if p_payload->>'statement_date' is null or length(trim(coalesce(p_payload->>'notes','')))=0 then raise exception 'Indica fecha y referencia del estado de cuenta'; end if;
  select coalesce(sum(amount),0) into balance_value from cash_movements where owner_id=u and account_id=acc and (created_at at time zone 'America/Santo_Domingo')::date<=(p_payload->>'statement_date')::date;
  insert into bank_statements(owner_id,account_id,statement_date,statement_balance,book_balance,notes) values(u,acc,(p_payload->>'statement_date')::date,(p_payload->>'statement_balance')::numeric,balance_value,p_payload->>'notes') returning id into result;
  for line in select * from jsonb_array_elements(coalesce(p_payload->'movement_ids','[]')) loop
   update cash_movements set reconciled_at=now(),reconciled_by=u where id=(line#>>'{}')::uuid and owner_id=u and account_id=acc and (created_at at time zone 'America/Santo_Domingo')::date<=(p_payload->>'statement_date')::date;
   if not found then raise exception 'Movimiento no pertenece a esa cuenta o período'; end if;
  end loop;
 elsif p_kind='catalog' then
  insert into catalogs(owner_id,kind,label,active) values(u,p_payload->>'kind',trim(p_payload->>'label'),coalesce((p_payload->>'active')::boolean,true)) on conflict(owner_id,kind,label) do update set active=excluded.active returning id into result;
 elsif p_kind='settings' then
  if length(trim(coalesce(p_payload->>'name','')))=0 then raise exception 'Nombre del negocio obligatorio'; end if;
  insert into business_settings(owner_id,name,payment_message,delivery_message,privacy_minimum) values(u,p_payload->>'name',p_payload->>'payment_message',p_payload->>'delivery_message',(p_payload->>'privacy_minimum')::integer)
   on conflict(owner_id) do update set name=excluded.name,payment_message=excluded.payment_message,delivery_message=excluded.delivery_message,privacy_minimum=excluded.privacy_minimum;
  result:=u;
 elsif p_kind='read_notification' then
  if length(coalesce(p_payload->>'event_key','')) not between 1 and 250 then raise exception 'Notificación inválida'; end if;
  insert into read_notifications(owner_id,event_key) values(u,p_payload->>'event_key') on conflict do nothing; result:=u;
 elsif p_kind='order' then
  select * into c from clients where id=(p_payload->>'client_id')::uuid and owner_id=u and active;
  if not found then raise exception 'Selecciona un cliente activo'; end if;
  if jsonb_typeof(p_payload->'lines') is distinct from 'array' or jsonb_array_length(p_payload->'lines') not between 1 and 100 then raise exception 'Agrega productos al pedido'; end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'lines') x group by x->>'product_id' having count(*)>1) then raise exception 'Combina los pares de cada SKU en una línea'; end if;
  delivery_value:=coalesce((p_payload->>'delivery_cost')::numeric,0);discount_value:=coalesce((p_payload->>'discount')::numeric,0);
  if delivery_value<0 or discount_value<0 then raise exception 'Descuento y entrega no pueden ser negativos'; end if;
  for line in select * from jsonb_array_elements(p_payload->'lines') loop
   if (line->>'quantity')::integer<=0 or (line->>'unit_price')::numeric<0 then raise exception 'Cantidad o precio inválido'; end if;
   if not exists(select 1 from products where id=(line->>'product_id')::uuid and owner_id=u and active) then raise exception 'Producto no disponible'; end if;
   total_value:=total_value+(line->>'quantity')::integer*(line->>'unit_price')::numeric;
  end loop;
  if discount_value>=total_value then raise exception 'El descuento debe ser menor que el subtotal'; end if;
  insert into orders(owner_id,client_id,total,delivery_cost,discount,delivery_date,delivery_method,address,notes) values(u,c.id,total_value-discount_value+delivery_value,delivery_value,discount_value,(p_payload->>'delivery_date')::date,coalesce(p_payload->>'delivery_method','Entrega'),coalesce(p_payload->>'address',c.address),coalesce(p_payload->>'notes','')) returning id into result;
  for line in select * from jsonb_array_elements(p_payload->'lines') loop
   insert into order_lines(owner_id,order_id,product_id,quantity,unit_price) values(u,result,(line->>'product_id')::uuid,(line->>'quantity')::integer,(line->>'unit_price')::numeric);
  end loop;
  insert into order_history(owner_id,order_id,status) values(u,result,'new');
 elsif p_kind='order_status' then
  select * into o from orders where id=(p_payload->>'order_id')::uuid and owner_id=u for update;
  if not found then raise exception 'Pedido no disponible'; end if;
  status_value:=p_payload->>'status';
  if not ((o.status='new' and status_value in ('confirmed','cancelled')) or (o.status='confirmed' and status_value in ('preparing','ready','cancelled')) or (o.status='preparing' and status_value in ('ready','cancelled')) or (o.status='ready' and status_value in ('sent','delivered','cancelled')) or (o.status='sent' and status_value in ('delivered','returned','cancelled')) or (o.status='delivered' and status_value='returned')) then raise exception 'Transición de pedido no permitida'; end if;
  perform set_config('sockit.order_id',o.id::text,true);
  if status_value='confirmed' then
   for original_line in select * from order_lines where order_id=o.id and owner_id=u loop
    select stock-coalesce((select sum(quantity) from reservations where product_id=original_line.product_id and owner_id=u and status='active'),0) into available from products where id=original_line.product_id and owner_id=u for update;
    if available<original_line.quantity then raise exception 'Existencias disponibles insuficientes para reservar'; end if;
    insert into reservations(owner_id,order_id,product_id,quantity,status) values(u,o.id,original_line.product_id,original_line.quantity,'active');
   end loop;
  elsif status_value in ('sent','delivered') and o.document_id is null then
   update reservations set status='consumed' where order_id=o.id and owner_id=u and status='active';
   select name into status_value from clients where id=o.client_id and owner_id=u;
   select jsonb_agg(jsonb_build_object('product_id',product_id,'quantity',quantity,'unit_price',unit_price)) into lines_value from order_lines where order_id=o.id and owner_id=u;
   result:=sockit_operation_v1('sale',jsonb_build_object('contact',status_value,'paid',0,'account','cash','lines',lines_value),gen_random_uuid());
   update documents set total=o.total,delivery_charge=o.delivery_cost,client_id=o.client_id,due_date=o.delivery_date where id=result and owner_id=u;
   -- El descuento general se distribuye proporcionalmente en las líneas históricas.
   with allocation as(select id,round(quantity*unit_price/(o.total-o.delivery_cost+o.discount)*o.discount,2) share,row_number() over(order by id) rn from document_lines where document_id=result and owner_id=u), final as(select id,share+case when rn=1 then o.discount-sum(share) over() else 0 end value from allocation) update document_lines dl set line_discount=f.value from final f where dl.id=f.id;
   update payments set document_id=result where order_id=o.id and owner_id=u;
   update cash_movements set document_id=result where order_id=o.id and owner_id=u;
   update orders set document_id=result where id=o.id;
  elsif status_value in ('cancelled','returned') then
   if o.document_id is not null then
    perform sockit_operation_v1('reverse_sale',jsonb_build_object('document_id',o.document_id,'description','Devolución/cancelación de pedido '||o.number),gen_random_uuid());
   else
    for payment in select * from payments where order_id=o.id and owner_id=u and status='confirmed' loop
     perform set_config('sockit.account_id',coalesce(payment.account_id::text,''),true);
     perform sockit_operation_v1('reverse_payment',jsonb_build_object('payment_id',payment.id),gen_random_uuid());
    end loop;
    update payments set status='rejected' where order_id=o.id and owner_id=u and status='pending';
   end if;
   update reservations set status='released' where order_id=o.id and owner_id=u and status='active';
  end if;
  status_value:=p_payload->>'status';
  update orders set status=status_value,delivered_at=case when status_value='delivered' then now() else delivered_at end where id=o.id;
  insert into order_history(owner_id,order_id,status,notes) values(u,o.id,status_value,coalesce(p_payload->>'notes',''));
  result:=o.id;
 elsif p_kind='order_payment' then
  select * into o from orders where id=(p_payload->>'order_id')::uuid and owner_id=u and status not in ('cancelled','returned') for update;
  if not found then raise exception 'Pedido no disponible'; end if;
  amount_value:=(p_payload->>'amount')::numeric;
  select coalesce(sum(amount),0) into balance_value from payments where order_id=o.id and owner_id=u and status in ('pending','confirmed');
  if amount_value is null or amount_value<=0 or amount_value+balance_value>o.total then raise exception 'El abono supera el saldo del pedido'; end if;
  perform set_config('sockit.order_id',o.id::text,true);
  insert into payments(owner_id,document_id,order_id,amount,account,reference,status,method,origin_bank,fee,receipt_id)
   values(u,o.document_id,o.id,amount_value,case when acc is not null or p_payload->>'account'='bank' then 'bank' else 'cash' end,coalesce(p_payload->>'reference',''),'pending',coalesce(payload_value->>'method','cash'),coalesce(p_payload->>'origin_bank',''),coalesce((p_payload->>'fee')::numeric,0),nullif(p_payload->>'receipt_id','')::uuid) returning id into result;
 elsif p_kind='import_products' then
  if jsonb_array_length(p_payload->'rows') not between 1 and 500 then raise exception 'Importa entre 1 y 500 diseños'; end if;
  for line in select * from jsonb_array_elements(p_payload->'rows') loop
   result:=sockit_operation_v1('product',line,gen_random_uuid());
  end loop;
 elsif p_kind='import_purchase' then
  if jsonb_array_length(p_payload->'rows') not between 1 and 500 then raise exception 'Importa entre 1 y 500 líneas'; end if;
  lines_value:='[]';
  for line in select * from jsonb_array_elements(p_payload->'rows') loop
   select id into item from products where owner_id=u and sku=upper(trim(line->>'sku')) and active;
   if not found then raise exception 'SKU no disponible: %',line->>'sku'; end if;
   lines_value:=lines_value||jsonb_build_array(jsonb_build_object('product_id',item,'quantity',line->'quantity','unit_price',line->'unit_price'));
  end loop;
  result:=sockit_operation_v1('purchase',jsonb_build_object('contact',p_payload->>'contact','lines',lines_value,'paid',0,'acquisition',0),gen_random_uuid());
 else
  -- Proteger reservas incluso si la venta procede de los formularios anteriores.
  if p_kind='sale' then
   for line in select * from jsonb_array_elements(p_payload->'lines') loop
    select stock-coalesce((select sum(quantity) from reservations where product_id=(line->>'product_id')::uuid and owner_id=u and status='active'),0) into available from products where id=(line->>'product_id')::uuid and owner_id=u;
    if available<(line->>'quantity')::integer then raise exception 'Existencias insuficientes: revisa los pares disponibles y las reservas'; end if;
   end loop;
  end if;
  if p_kind in ('payment','sale','purchase') and nullif(p_payload->>'client_id','') is not null and not exists(select 1 from clients where id=(p_payload->>'client_id')::uuid and owner_id=u) then raise exception 'Cliente no disponible'; end if;
  if p_kind in ('confirm_payment','reverse_payment','reject_payment') then
   select * into payment from payments where id=(p_payload->>'payment_id')::uuid and owner_id=u;
   if not found then raise exception 'Pago no disponible'; end if;
   acc:=payment.account_id;
   perform set_config('sockit.account_id',coalesce(acc::text,''),true);
   perform set_config('sockit.order_id',coalesce(payment.order_id::text,''),true);
  end if;
  if acc is not null then
   amount_value:=case when p_kind in ('expense','withdrawal','purchase_payment') then (p_payload->>'amount')::numeric when p_kind='purchase' then coalesce((p_payload->>'paid')::numeric,0) when p_kind='reverse_payment' then payment.amount else 0 end;
   select coalesce(sum(amount),0) into balance_value from cash_movements where owner_id=u and account_id=acc;
   if amount_value>balance_value then raise exception 'Saldo insuficiente en la cuenta bancaria seleccionada'; end if;
  end if;
  if nullif(p_payload->>'receipt_id','') is not null and not exists(select 1 from private_files where id=(p_payload->>'receipt_id')::uuid and owner_id=u and purpose='receipt') then raise exception 'Comprobante no disponible'; end if;
  result:=sockit_operation_v1(p_kind,payload_value,p_key);
  -- La clave idempotente conserva el contenido original de la solicitud.
  update audit_events set payload=p_payload where id=p_key and owner_id=u;
  if p_kind in ('product','edit_product') then
   sid:=nullif(p_payload->>'supplier_id','')::uuid;
   if sid is not null and not exists(select 1 from suppliers where id=sid and owner_id=u) then raise exception 'Proveedor no disponible'; end if;
   item:=nullif(p_payload->>'photo_id','')::uuid;
   if item is not null and not exists(select 1 from private_files where id=item and owner_id=u and purpose='product') then raise exception 'Fotografía no disponible'; end if;
   update products set collection=coalesce(p_payload->>'collection',collection),sock_type=coalesce(p_payload->>'sock_type',sock_type),brand=coalesce(p_payload->>'brand',brand),supplier_id=coalesce(sid,supplier_id),photo_id=coalesce(item,photo_id) where id=result and owner_id=u;
  end if;
  if p_kind in ('sale','purchase') then
   client_value:=nullif(p_payload->>'client_id','')::uuid;
   sid:=nullif(p_payload->>'supplier_id','')::uuid;
   if sid is not null and not exists(select 1 from suppliers where id=sid and owner_id=u) then raise exception 'Proveedor no disponible'; end if;
   update documents set client_id=client_value,supplier_id=sid,due_date=nullif(p_payload->>'due_date','')::date where id=result and owner_id=u;
  end if;
  if p_kind in ('payment','sale') then
   update payments set method=coalesce(payload_value->>'method',case when account='cash' then 'cash' else 'transfer' end),origin_bank=coalesce(p_payload->>'origin_bank',''),fee=coalesce((p_payload->>'fee')::numeric,0),receipt_id=nullif(p_payload->>'receipt_id','')::uuid where owner_id=u and (id=result or (document_id=result and p_kind='sale'));
  end if;
  if p_kind='reverse_sale' then update orders set status='returned' where document_id=result and owner_id=u; end if;
  if p_kind in ('confirm_payment','sale') then
   for payment in select * from payments where owner_id=u and status='confirmed' and fee>0 and (id=result or document_id=result) loop
    perform set_config('sockit.account_id',coalesce(payment.account_id::text,''),true);
    insert into cash_movements(owner_id,account,amount,kind,description,document_id,payment_id) values(u,payment.account,-payment.fee,'expense','Comisión de tarjeta',payment.document_id,payment.id) on conflict do nothing;
   end loop;
  end if;
  return result;
 end if;
 insert into audit_events(id,owner_id,kind,result_id,payload) values(p_key,u,p_kind,result,p_payload);
 return result;
end $$;
revoke all on function public.sockit_operation(text,jsonb,uuid) from public,anon;
grant execute on function public.sockit_operation(text,jsonb,uuid) to authenticated;

create function public.sockit_snapshot() returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 with base as(select sockit_snapshot_v1() d), deposits as(select coalesce(sum(case when m.kind='collection' then m.amount when m.kind='refund' then m.amount else 0 end),0) value from cash_movements m where order_id is not null and document_id is null),
 reserved as(select coalesce(sum(quantity),0) value from reservations where status='active')
 select d||jsonb_build_object(
 'products',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('reserved',coalesce((select sum(quantity) from reservations where product_id=p.id and status='active'),0),'available',p.stock-coalesce((select sum(quantity) from reservations where product_id=p.id and status='active'),0))) from products p),'[]'::jsonb),
 'clients',coalesce((select jsonb_agg(to_jsonb(c) order by name) from clients c),'[]'::jsonb),
 'suppliers',coalesce((select jsonb_agg(to_jsonb(s) order by name) from suppliers s),'[]'::jsonb),
 'accounts',coalesce((select jsonb_agg((to_jsonb(a)-'account_number')||jsonb_build_object('masked_number','•••• '||right(account_number,4),'balance',coalesce((select sum(amount) from cash_movements where account_id=a.id),0))) from bank_accounts a),'[]'::jsonb),
 'orders',coalesce((select jsonb_agg(to_jsonb(o) order by number desc) from orders o),'[]'::jsonb),
 'order_lines',coalesce((select jsonb_agg(to_jsonb(l)) from order_lines l),'[]'::jsonb),
 'reservations',coalesce((select jsonb_agg(to_jsonb(r)) from reservations r),'[]'::jsonb),
 'order_history',coalesce((select jsonb_agg(to_jsonb(h) order by created_at desc) from order_history h),'[]'::jsonb),
 'statements',coalesce((select jsonb_agg(to_jsonb(s) order by created_at desc) from bank_statements s),'[]'::jsonb),
 'catalogs',coalesce((select jsonb_agg(to_jsonb(c)) from catalogs c),'[]'::jsonb),
 'files',coalesce((select jsonb_agg(to_jsonb(f)) from private_files f),'[]'::jsonb),
 'notification_reads',coalesce((select jsonb_agg(event_key) from read_notifications),'[]'::jsonb),
 'settings',coalesce((select to_jsonb(s) from business_settings s),'{}'::jsonb),
 'audit',coalesce((select jsonb_agg(to_jsonb(e)-'payload' order by created_at desc) from audit_events e),'[]'::jsonb),
 'metrics',(d->'metrics')||jsonb_build_object('reserved',r.value,'available',(d->'metrics'->>'pairs')::numeric-r.value,'customer_deposits',dep.value,'receivables',(d->'metrics'->>'receivables')::numeric+dep.value,'collections',(d->'metrics'->>'collections')::numeric-dep.value,'equity',(d->'metrics'->>'equity')::numeric)
 ) from base cross join deposits dep cross join reserved r;
$$;
revoke all on function public.sockit_snapshot() from public,anon;
grant execute on function public.sockit_snapshot() to authenticated;
