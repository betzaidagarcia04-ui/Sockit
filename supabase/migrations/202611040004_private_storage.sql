-- En PostgreSQL local no existe el esquema Storage; en Supabase sí.
do $$ begin
 if to_regclass('storage.buckets') is not null then
  execute $sql$insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('sockit-private','sockit-private',false,5242880,array['image/png','image/jpeg','image/webp','application/pdf']) on conflict(id) do nothing$sql$;
  execute $sql$create policy sockit_private_read on storage.objects for select to authenticated using(bucket_id='sockit-private' and (storage.foldername(name))[1]=auth.uid()::text)$sql$;
  execute $sql$create policy sockit_private_insert on storage.objects for insert to authenticated with check(bucket_id='sockit-private' and (storage.foldername(name))[1]=auth.uid()::text)$sql$;
 end if;
end $$;
