-- La cuenta histórica sin asignar también es un saldo independiente: no puede
-- gastar el dinero de las cuentas nuevas ni viceversa.
alter function public.sockit_operation(text,jsonb,uuid) rename to sockit_operation_v4;
revoke all on function public.sockit_operation_v4(text,jsonb,uuid) from public,anon,authenticated;
create function public.sockit_operation(p_kind text,p_payload jsonb,p_key uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid();previous audit_events%rowtype;account_value uuid;account_kind text;amount_value numeric(18,2):=0;balance_value numeric(18,2);
begin
 if u is null or p_key is null then raise exception 'Debes iniciar sesión';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));select * into previous from audit_events where id=p_key and owner_id=u;
 if found then if previous.kind<>p_kind or previous.payload<>p_payload then raise exception 'Clave de operación reutilizada';end if;return previous.result_id;end if;
 account_value:=nullif(p_payload->>'account_id','')::uuid;
 account_kind:=case when account_value is not null then 'bank' else coalesce(p_payload->>'account','cash') end;
 if p_kind in ('expense','withdrawal','transfer','purchase_payment') then amount_value:=(p_payload->>'amount')::numeric;
 elsif p_kind='purchase' then amount_value:=coalesce((p_payload->>'paid')::numeric,0);
 elsif p_kind='reverse_payment' then select account,account_id,amount-refunded_amount into account_kind,account_value,amount_value from payments where id=(p_payload->>'payment_id')::uuid and owner_id=u and status='confirmed';end if;
 if account_kind='bank' and amount_value>0 then
  select coalesce(sum(amount),0) into balance_value from cash_movements where owner_id=u and account='bank' and account_id is not distinct from account_value;
  if balance_value<amount_value then raise exception 'Saldo insuficiente en la cuenta bancaria seleccionada';end if;
 end if;
 return sockit_operation_v4(p_kind,p_payload,p_key);
end $$;
revoke all on function public.sockit_operation(text,jsonb,uuid) from public,anon;grant execute on function public.sockit_operation(text,jsonb,uuid) to authenticated;
