alter table public.products add column photo_ids jsonb not null default '[]' check(jsonb_typeof(photo_ids)='array');
update public.products set photo_ids=jsonb_build_array(photo_id) where photo_id is not null;
alter function public.sockit_operation(text,jsonb,uuid) rename to sockit_operation_v5;
revoke all on function public.sockit_operation_v5(text,jsonb,uuid) from public,anon,authenticated;
create function public.sockit_operation(p_kind text,p_payload jsonb,p_key uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid();previous audit_events%rowtype;result uuid;photo jsonb;
begin
 if u is null or p_key is null then raise exception 'Debes iniciar sesión';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));select * into previous from audit_events where id=p_key and owner_id=u;
 if found then if previous.kind<>p_kind or previous.payload<>p_payload then raise exception 'Clave de operación reutilizada';end if;return previous.result_id;end if;
 if p_kind in ('product','edit_product') and p_payload?'photo_ids' then
  if jsonb_typeof(p_payload->'photo_ids') is distinct from 'array' or jsonb_array_length(p_payload->'photo_ids')>12 then raise exception 'Máximo 12 fotografías por diseño';end if;
  for photo in select * from jsonb_array_elements(p_payload->'photo_ids') loop
   if not exists(select 1 from private_files where id=(photo#>>'{}')::uuid and owner_id=u and purpose='product') then raise exception 'Fotografía no disponible';end if;
  end loop;
 end if;
 result:=sockit_operation_v5(p_kind,p_payload,p_key);
 if p_kind in ('product','edit_product') and p_payload?'photo_ids' then update products set photo_ids=p_payload->'photo_ids',photo_id=nullif(p_payload->'photo_ids'->>0,'')::uuid where id=result and owner_id=u;end if;
 return result;
end $$;
revoke all on function public.sockit_operation(text,jsonb,uuid) from public,anon;grant execute on function public.sockit_operation(text,jsonb,uuid) to authenticated;
