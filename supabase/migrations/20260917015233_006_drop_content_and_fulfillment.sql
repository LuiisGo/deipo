create type public.drop_media_kind as enum ('hero', 'packaging_frame', 'gallery');
create type public.drop_item_type as enum ('included', 'extra');

create table public.drop_media (
  id uuid primary key default gen_random_uuid(),
  drop_id uuid not null references public.drops(id) on delete cascade,
  kind public.drop_media_kind not null,
  path text not null check (btrim(path) <> ''),
  alt_text text,
  label text,
  sort_order integer not null default 0,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drop_media_unique_order unique (drop_id, kind, sort_order)
);
create index drop_media_drop_kind_idx on public.drop_media (drop_id, kind, is_enabled, sort_order);

create table public.drop_items (
  id uuid primary key default gen_random_uuid(),
  drop_id uuid not null references public.drops(id) on delete cascade,
  item_type public.drop_item_type not null default 'included',
  name text not null check (btrim(name) <> ''),
  description text,
  price_minor bigint check (price_minor is null or price_minor >= 0),
  sort_order integer not null default 0,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drop_items_extra_price check (item_type <> 'extra' or price_minor is not null)
);
create index drop_items_drop_type_idx on public.drop_items (drop_id, item_type, is_enabled, sort_order);

create table public.drop_delivery_zones (
  id uuid primary key default gen_random_uuid(),
  drop_id uuid not null references public.drops(id) on delete cascade,
  code text not null check (btrim(code) <> ''),
  label text not null check (btrim(label) <> ''),
  fee_minor bigint check (fee_minor is null or fee_minor >= 0),
  is_enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drop_delivery_zones_unique_code unique (drop_id, code)
);
create index drop_delivery_zones_drop_idx on public.drop_delivery_zones (drop_id, is_enabled, sort_order);

create trigger drop_media_set_updated_at before update on public.drop_media for each row execute function public.set_updated_at();
create trigger drop_items_set_updated_at before update on public.drop_items for each row execute function public.set_updated_at();
create trigger drop_delivery_zones_set_updated_at before update on public.drop_delivery_zones for each row execute function public.set_updated_at();

alter table public.drop_media enable row level security;
alter table public.drop_items enable row level security;
alter table public.drop_delivery_zones enable row level security;

create policy drop_media_admin_read on public.drop_media for select to authenticated using (private.is_deipo_admin());
create policy drop_media_admin_insert on public.drop_media for insert to authenticated with check (private.is_deipo_admin(array['founder','admin']::public.admin_role[]));
create policy drop_media_admin_update on public.drop_media for update to authenticated using (private.is_deipo_admin(array['founder','admin']::public.admin_role[])) with check (private.is_deipo_admin(array['founder','admin']::public.admin_role[]));
create policy drop_media_admin_delete on public.drop_media for delete to authenticated using (private.is_deipo_admin(array['founder','admin']::public.admin_role[]));

create policy drop_items_admin_read on public.drop_items for select to authenticated using (private.is_deipo_admin());
create policy drop_items_admin_insert on public.drop_items for insert to authenticated with check (private.is_deipo_admin(array['founder','admin']::public.admin_role[]));
create policy drop_items_admin_update on public.drop_items for update to authenticated using (private.is_deipo_admin(array['founder','admin']::public.admin_role[])) with check (private.is_deipo_admin(array['founder','admin']::public.admin_role[]));
create policy drop_items_admin_delete on public.drop_items for delete to authenticated using (private.is_deipo_admin(array['founder','admin']::public.admin_role[]));

create policy drop_delivery_zones_admin_read on public.drop_delivery_zones for select to authenticated using (private.is_deipo_admin());
create policy drop_delivery_zones_admin_insert on public.drop_delivery_zones for insert to authenticated with check (private.is_deipo_admin(array['founder','admin']::public.admin_role[]));
create policy drop_delivery_zones_admin_update on public.drop_delivery_zones for update to authenticated using (private.is_deipo_admin(array['founder','admin']::public.admin_role[])) with check (private.is_deipo_admin(array['founder','admin']::public.admin_role[]));
create policy drop_delivery_zones_admin_delete on public.drop_delivery_zones for delete to authenticated using (private.is_deipo_admin(array['founder','admin']::public.admin_role[]));

revoke all on public.drop_media, public.drop_items, public.drop_delivery_zones from anon;
grant select, insert, update, delete on public.drop_media, public.drop_items, public.drop_delivery_zones to authenticated;

create or replace function private.public_drop_payload(p_drop_id uuid, p_allow_scheduled boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  d public.drops%rowtype;
  inv record;
  v_slots jsonb;
  v_packaging jsonb;
  v_items jsonb;
  v_zones jsonb;
  v_availability public.customer_availability_status;
begin
  if p_drop_id is null then return null; end if;
  select * into d from public.drops where id = p_drop_id;
  if not found then return null; end if;

  if d.lifecycle_status <> 'published' and not (p_allow_scheduled and d.lifecycle_status = 'scheduled') then
    return null;
  end if;

  select * into inv from public.drop_inventory where drop_id = p_drop_id;
  v_availability := private.derive_customer_availability(p_drop_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'starts_at', to_char(s.starts_at, 'HH24:MI'),
    'ends_at', to_char(s.ends_at, 'HH24:MI'),
    'capacity', s.capacity,
    'sort_order', s.sort_order
  ) order by s.sort_order, s.starts_at), '[]'::jsonb)
  into v_slots
  from public.drop_slots s
  where s.drop_id = p_drop_id and s.is_enabled;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'src', m.path,
    'alt', m.alt_text,
    'label', m.label,
    'sort_order', m.sort_order
  ) order by m.sort_order), '[]'::jsonb)
  into v_packaging
  from public.drop_media m
  where m.drop_id = p_drop_id and m.kind = 'packaging_frame' and m.is_enabled;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'type', i.item_type,
    'name', i.name,
    'description', i.description,
    'price_minor', i.price_minor,
    'sort_order', i.sort_order
  ) order by i.item_type, i.sort_order), '[]'::jsonb)
  into v_items
  from public.drop_items i
  where i.drop_id = p_drop_id and i.is_enabled;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', z.id,
    'code', z.code,
    'label', z.label,
    'fee_minor', z.fee_minor,
    'sort_order', z.sort_order
  ) order by z.sort_order), '[]'::jsonb)
  into v_zones
  from public.drop_delivery_zones z
  where z.drop_id = p_drop_id and z.is_enabled;

  return jsonb_build_object(
    'id', d.id,
    'number', d.number,
    'slug', d.slug,
    'name', d.name,
    'tagline', d.tagline,
    'description', d.description,
    'currency', d.currency,
    'price_minor', d.price_minor,
    'capacity', d.capacity,
    'prelaunch_sold_units', inv.prelaunch_sold_units,
    'online_sold_units', inv.online_sold_units,
    'held_units', inv.held_units,
    'total_sold', inv.total_sold,
    'available', inv.available,
    'sold_fraction', inv.sold_fraction,
    'availability', v_availability,
    'orders_open_at', d.orders_open_at,
    'orders_close_at', d.orders_close_at,
    'fulfillment_date', d.fulfillment_date,
    'fulfillment_day_label', d.fulfillment_day_label,
    'delivery_enabled', d.delivery_enabled,
    'pickup_enabled', d.pickup_enabled,
    'pickup_label', d.pickup_label,
    'hero_image_path', d.hero_image_path,
    'packaging_frames', v_packaging,
    'items', v_items,
    'delivery_zones', v_zones,
    'slots', v_slots
  );
end;
$$;
revoke all on function private.public_drop_payload(uuid, boolean) from public, anon, authenticated;
