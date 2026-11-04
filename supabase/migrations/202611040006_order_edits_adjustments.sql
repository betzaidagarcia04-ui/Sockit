alter table public.cash_movements add column category text not null default '';
alter table public.cash_movements drop constraint cash_movements_kind_check;
alter table public.cash_movements add constraint cash_movements_kind_check check(kind in ('capital','withdrawal','expense','purchase','collection','transfer','refund','adjustment'));
alter function public.sockit_operation(text,jsonb,uuid) rename to sockit_operation_v3;
revoke all on function public.sockit_operation_v3(text,jsonb,uuid) from public,anon,authenticated;
create function public.sockit_operation(p_kind text,p_payload jsonb,p_key uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid();o orders%rowtype;previous audit_events%rowtype;item jsonb;line order_lines%rowtype;total_value numeric(18,2):=0;discount_value numeric(18,2);delivery_value numeric(18,2);paid numeric(18,2);available integer;result uuid;account_value uuid;amount_value numeric(18,2);balance numeric(18,2);
begin
 if u is null or p_key is null then raise exception 'Debes iniciar sesión';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));select * into previous from audit_events where id=p_key and owner_id=u;
 if found then if previous.kind<>p_kind or previous.payload<>p_payload then raise exception 'Clave de operación reutilizada';end if;return previous.result_id;end if;
 if p_kind='edit_order' then
  select * into o from orders where id=(p_payload->>'id')::uuid and owner_id=u and document_id is null and status in ('new','confirmed','preparing','ready') for update;
  if not found then raise exception 'Solo se editan pedidos activos antes de su salida';end if;
  if not exists(select 1 from clients where id=(p_payload->>'client_id')::uuid and owner_id=u and active) then raise exception 'Cliente no disponible';end if;
  if jsonb_typeof(p_payload->'lines') is distinct from 'array' or jsonb_array_length(p_payload->'lines') not between 1 and 100 then raise exception 'Agrega diseños al pedido';end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'lines') x group by x->>'product_id' having count(*)>1) then raise exception 'Combina los pares del mismo diseño';end if;
  for item in select * from jsonb_array_elements(p_payload->'lines') loop
   if (item->>'quantity')::integer<=0 or (item->>'unit_price')::numeric<0 or not exists(select 1 from products where id=(item->>'product_id')::uuid and owner_id=u and active) then raise exception 'Componente inválido';end if;
   total_value:=total_value+(item->>'quantity')::integer*(item->>'unit_price')::numeric;
  end loop;
  discount_value:=coalesce((p_payload->>'discount')::numeric,0);delivery_value:=coalesce((p_payload->>'delivery_cost')::numeric,0);
  if discount_value<0 or discount_value>=total_value or delivery_value<0 then raise exception 'Descuento o entrega inválidos';end if;
  total_value:=total_value-discount_value+delivery_value;
  select coalesce(sum(amount-refunded_amount),0) into paid from payments where order_id=o.id and owner_id=u and status in ('pending','confirmed');
  if total_value<paid then raise exception 'El nuevo total es menor que los pagos reportados; procesa primero su reverso';end if;
  update reservations set status='released' where order_id=o.id and owner_id=u and status='active';
  -- No hay venta ni movimientos definitivos: los borradores se reconstruyen con historial en auditoría.
  delete from order_lines where order_id=o.id and owner_id=u;
  for item in select * from jsonb_array_elements(p_payload->'lines') loop
   insert into order_lines(owner_id,order_id,product_id,quantity,unit_price) values(u,o.id,(item->>'product_id')::uuid,(item->>'quantity')::integer,(item->>'unit_price')::numeric);
   if o.status<>'new' then
    select stock-coalesce((select sum(quantity) from reservations where product_id=(item->>'product_id')::uuid and owner_id=u and status='active'),0) into available from products where id=(item->>'product_id')::uuid and owner_id=u for update;
    if available<(item->>'quantity')::integer then raise exception 'Existencias insuficientes para editar la reserva';end if;
    insert into reservations(owner_id,order_id,product_id,quantity,status) values(u,o.id,(item->>'product_id')::uuid,(item->>'quantity')::integer,'active') on conflict(order_id,product_id) do update set quantity=excluded.quantity,status='active';
   end if;
  end loop;
  update orders set client_id=(p_payload->>'client_id')::uuid,total=total_value,discount=discount_value,delivery_cost=delivery_value,delivery_date=(p_payload->>'delivery_date')::date,delivery_method=p_payload->>'delivery_method',address=coalesce(p_payload->>'address',''),notes=coalesce(p_payload->>'notes','') where id=o.id;
  insert into order_history(owner_id,order_id,status,notes) values(u,o.id,o.status,'Pedido editado; detalle de cambios conservado en auditoría');result:=o.id;
 elsif p_kind='bank_adjustment' then
  account_value:=(p_payload->>'account_id')::uuid;amount_value:=(p_payload->>'amount')::numeric;
  if amount_value is null or amount_value=0 or length(trim(coalesce(p_payload->>'description','')))=0 or not exists(select 1 from bank_accounts where id=account_value and owner_id=u and active) then raise exception 'Selecciona una cuenta, monto distinto de cero y explicación';end if;
  select coalesce(sum(amount),0) into balance from cash_movements where account_id=account_value and owner_id=u;
  if balance+amount_value<0 then raise exception 'El ajuste dejaría un saldo bancario negativo';end if;
  perform set_config('sockit.account_id',account_value::text,true);perform set_config('sockit.order_id','',true);
  insert into cash_movements(owner_id,account,amount,kind,description) values(u,'bank',amount_value,'adjustment',p_payload->>'description') returning id into result;
 else
  result:=sockit_operation_v3(p_kind,p_payload,p_key);
  if p_kind='expense' then update cash_movements set category=left(coalesce(p_payload->>'expense_category','Otros'),160) where id=result and owner_id=u;end if;
  return result;
 end if;
 insert into audit_events(id,owner_id,kind,result_id,payload) values(p_key,u,p_kind,result,p_payload);return result;
end $$;
revoke all on function public.sockit_operation(text,jsonb,uuid) from public,anon;grant execute on function public.sockit_operation(text,jsonb,uuid) to authenticated;
