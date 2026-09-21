insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'drop-assets',
  'drop-assets',
  true,
  15728640,
  array['image/jpeg','image/png','image/webp','image/avif']
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "deipo_drop_assets_admin_select" on storage.objects;
drop policy if exists "deipo_drop_assets_admin_insert" on storage.objects;
drop policy if exists "deipo_drop_assets_admin_update" on storage.objects;
drop policy if exists "deipo_drop_assets_admin_delete" on storage.objects;

create policy "deipo_drop_assets_admin_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'drop-assets'
  and private.is_deipo_admin()
);

create policy "deipo_drop_assets_admin_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'drop-assets'
  and private.is_deipo_admin(array['founder'::public.admin_role, 'admin'::public.admin_role])
);

create policy "deipo_drop_assets_admin_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'drop-assets'
  and private.is_deipo_admin(array['founder'::public.admin_role, 'admin'::public.admin_role])
)
with check (
  bucket_id = 'drop-assets'
  and private.is_deipo_admin(array['founder'::public.admin_role, 'admin'::public.admin_role])
);

create policy "deipo_drop_assets_admin_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'drop-assets'
  and private.is_deipo_admin(array['founder'::public.admin_role, 'admin'::public.admin_role])
);
