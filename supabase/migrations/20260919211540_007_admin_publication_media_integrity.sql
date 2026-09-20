CREATE OR REPLACE FUNCTION private.validate_drop_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'UPDATE'
     and old.lifecycle_status in ('archived','cancelled')
     and new.lifecycle_status is distinct from old.lifecycle_status then
    raise exception 'Archived or cancelled drops are terminal';
  end if;

  if new.lifecycle_status in ('scheduled','published') then
    if not (new.delivery_enabled or new.pickup_enabled) then raise exception 'A fulfillment method is required'; end if;
    if new.hero_image_path is null or not exists (
      select 1 from storage.objects where bucket_id = 'drop-assets' and name = new.hero_image_path
    ) then raise exception 'A stored hero asset is required'; end if;
    if new.price_minor <= 0 then raise exception 'Scheduled/published drops require a positive price'; end if;
    if new.orders_open_at is null or new.orders_close_at is null then raise exception 'Scheduled/published drops require opening and closing timestamps'; end if;
    if new.orders_close_at <= new.orders_open_at then raise exception 'Closing must be after opening'; end if;
    if new.fulfillment_date is null then raise exception 'Scheduled/published drops require a fulfillment date'; end if;
  end if;

  if new.lifecycle_status = 'published' then
    new.published_at := coalesce(new.published_at, case when tg_op = 'UPDATE' then old.published_at else null end, now());
  elsif tg_op = 'INSERT' then
    new.published_at := null;
  elsif old.lifecycle_status <> 'published' then
    new.published_at := old.published_at;
  end if;

  return new;
end;
$function$
;
revoke all on function private.validate_drop_lifecycle() from public, anon, authenticated;
CREATE OR REPLACE FUNCTION private.public_drop_payload(p_drop_id uuid, p_allow_scheduled boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
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
    'low_stock_threshold', d.low_stock_threshold,
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
$function$
;
revoke all on function private.public_drop_payload(uuid, boolean) from public, anon, authenticated;

-- Hero metadata and the drop's canonical reference change in the same transaction.
create or replace function private.sync_drop_hero()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_drop uuid := coalesce(new.drop_id, old.drop_id); v_path text;
begin
  if tg_op = 'UPDATE' and (new.drop_id <> old.drop_id or new.kind <> old.kind) then
    raise exception 'Media identity cannot be changed';
  end if;
  if coalesce(new.kind, old.kind) = 'hero' then
    perform 1 from public.drops where id = v_drop for update;
    select path into v_path from public.drop_media
      where drop_id = v_drop and kind = 'hero' and is_enabled
      order by sort_order, id limit 1;
    update public.drops set hero_image_path = v_path where id = v_drop;
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function private.sync_drop_hero() from public, anon, authenticated;
create trigger drop_media_sync_hero after insert or update or delete on public.drop_media
for each row execute function private.sync_drop_hero();

-- Keep assignment integrity when an assigned drop is archived/cancelled/unpublished.
create or replace function private.guard_assigned_drop()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.lifecycle_status is distinct from old.lifecycle_status and exists (
    select 1 from public.storefront_config
    where (current_drop_id = new.id and new.lifecycle_status <> 'published')
       or (next_drop_id = new.id and new.lifecycle_status not in ('scheduled','published'))
  ) then raise exception 'Unassign the drop before changing its lifecycle'; end if;
  return new;
end;
$$;
revoke all on function private.guard_assigned_drop() from public, anon, authenticated;
create trigger drops_assignment_guard before update on public.drops for each row execute function private.guard_assigned_drop();
