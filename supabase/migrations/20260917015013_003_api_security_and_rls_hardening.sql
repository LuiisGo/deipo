create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

-- Move internal SECURITY DEFINER helpers out of the exposed public API schema.
alter function public.is_deipo_admin(public.admin_role[]) set schema private;
alter function public.audit_drop_change() set schema private;
alter function public.audit_prelaunch_sale_change() set schema private;
alter function public.audit_storefront_change() set schema private;
alter function public.validate_drop_capacity_change() set schema private;
alter function public.validate_prelaunch_capacity() set schema private;
alter function public.derive_customer_availability(uuid) set schema private;
alter function public.public_drop_payload(uuid, boolean) set schema private;

revoke all on function private.is_deipo_admin(public.admin_role[]) from public, anon;
grant execute on function private.is_deipo_admin(public.admin_role[]) to authenticated;
revoke all on function private.audit_drop_change() from public, anon, authenticated;
revoke all on function private.audit_prelaunch_sale_change() from public, anon, authenticated;
revoke all on function private.audit_storefront_change() from public, anon, authenticated;
revoke all on function private.validate_drop_capacity_change() from public, anon, authenticated;
revoke all on function private.validate_prelaunch_capacity() from public, anon, authenticated;
revoke all on function private.derive_customer_availability(uuid) from public, anon, authenticated;
revoke all on function private.public_drop_payload(uuid, boolean) from public, anon, authenticated;

-- RLS helper references use a scalar subquery for auth.uid() so PostgreSQL can init-plan it once.
drop policy if exists admin_profiles_self_read on public.admin_profiles;
create policy admin_profiles_self_read on public.admin_profiles
for select to authenticated
using (user_id = (select auth.uid()) or private.is_deipo_admin());

-- Pre-launch records can only be created/voided by founder/admin, and actor identity must be the session user.
create policy prelaunch_sales_admin_insert on public.prelaunch_sales
for insert to authenticated
with check (
  private.is_deipo_admin(array['founder','admin']::public.admin_role[])
  and created_by = (select auth.uid())
  and voided_at is null
  and voided_by is null
  and void_reason is null
);
create policy prelaunch_sales_admin_update on public.prelaunch_sales
for update to authenticated
using (private.is_deipo_admin(array['founder','admin']::public.admin_role[]))
with check (
  private.is_deipo_admin(array['founder','admin']::public.admin_role[])
  and created_by is not null
);
grant insert, update on public.prelaunch_sales to authenticated;

-- Public admin RPCs now run with the caller's RLS permissions instead of bypassing them.
create or replace function public.record_prelaunch_sale(
  p_drop_id uuid,
  p_quantity integer,
  p_source text,
  p_note text default null,
  p_confirmed_at timestamptz default now()
)
returns uuid
language plpgsql
security invoker
set search_path = public, private, auth
as $$
declare
  v_id uuid;
begin
  if not private.is_deipo_admin(array['founder','admin']::public.admin_role[]) then
    raise exception 'Not authorized';
  end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantity must be positive'; end if;
  if btrim(coalesce(p_source, '')) = '' then raise exception 'Source is required'; end if;

  insert into public.prelaunch_sales(drop_id, quantity, source, note, confirmed_at, created_by)
  values (p_drop_id, p_quantity, btrim(p_source), nullif(btrim(coalesce(p_note, '')), ''), p_confirmed_at, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.void_prelaunch_sale(p_sale_id uuid, p_reason text)
returns void
language plpgsql
security invoker
set search_path = public, private, auth
as $$
begin
  if not private.is_deipo_admin(array['founder','admin']::public.admin_role[]) then
    raise exception 'Not authorized';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Void reason is required'; end if;

  update public.prelaunch_sales
  set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
  where id = p_sale_id and voided_at is null;

  if not found then raise exception 'Active pre-launch sale not found'; end if;
end;
$$;

create or replace function public.publish_drop(p_drop_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, private, auth
as $$
declare
  d public.drops%rowtype;
  inv record;
begin
  if not private.is_deipo_admin(array['founder','admin']::public.admin_role[]) then
    raise exception 'Not authorized';
  end if;

  select * into d from public.drops where id = p_drop_id for update;
  if not found then raise exception 'Drop not found'; end if;
  select * into inv from public.drop_inventory where drop_id = p_drop_id;

  if d.lifecycle_status in ('archived','cancelled') then raise exception 'Archived or cancelled drops cannot be published'; end if;
  if d.price_minor <= 0 then raise exception 'A positive price is required before publishing'; end if;
  if d.orders_open_at is null or d.orders_close_at is null then raise exception 'Opening and closing timestamps are required before publishing'; end if;
  if d.orders_close_at <= d.orders_open_at then raise exception 'Closing must be after opening'; end if;
  if d.fulfillment_date is null then raise exception 'Fulfillment date is required before publishing'; end if;
  if inv.total_sold > d.capacity then raise exception 'Sold units exceed capacity'; end if;

  update public.drops
  set lifecycle_status = 'published', published_at = coalesce(published_at, now()), updated_by = auth.uid()
  where id = p_drop_id;
end;
$$;

create or replace function public.set_storefront_drop(p_slot text, p_drop_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, private, auth
as $$
declare
  v_status public.drop_lifecycle_status;
begin
  if not private.is_deipo_admin(array['founder','admin']::public.admin_role[]) then
    raise exception 'Not authorized';
  end if;
  if p_slot not in ('current','next') then raise exception 'Slot must be current or next'; end if;

  if p_drop_id is not null then
    select lifecycle_status into v_status from public.drops where id = p_drop_id;
    if not found then raise exception 'Drop not found'; end if;
    if p_slot = 'current' and v_status <> 'published' then raise exception 'Current drop must be published'; end if;
    if p_slot = 'next' and v_status not in ('scheduled','published') then raise exception 'Next drop must be scheduled or published'; end if;
  end if;

  if p_slot = 'current' then
    update public.storefront_config set current_drop_id = p_drop_id, updated_by = auth.uid() where singleton;
  else
    update public.storefront_config set next_drop_id = p_drop_id, updated_by = auth.uid() where singleton;
  end if;
end;
$$;

-- Rewrite internal payload after helper functions moved to private.
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
    'slots', v_slots
  );
end;
$$;
revoke all on function private.public_drop_payload(uuid, boolean) from public, anon, authenticated;

create or replace function private.get_storefront_state_impl()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  cfg public.storefront_config%rowtype;
begin
  select * into cfg from public.storefront_config where singleton;
  return jsonb_build_object(
    'current', private.public_drop_payload(cfg.current_drop_id, false),
    'next', private.public_drop_payload(cfg.next_drop_id, true)
  );
end;
$$;
revoke all on function private.get_storefront_state_impl() from public;
grant execute on function private.get_storefront_state_impl() to anon, authenticated;

create or replace function public.get_storefront_state()
returns jsonb
language sql
stable
security invoker
set search_path = public, private
as $$
  select private.get_storefront_state_impl();
$$;
revoke all on function public.get_storefront_state() from public;
grant execute on function public.get_storefront_state() to anon, authenticated;

-- Keep authenticated API grants explicit after replacing RPC definitions.
revoke all on function public.record_prelaunch_sale(uuid, integer, text, text, timestamptz) from public, anon;
revoke all on function public.void_prelaunch_sale(uuid, text) from public, anon;
revoke all on function public.publish_drop(uuid) from public, anon;
revoke all on function public.set_storefront_drop(text, uuid) from public, anon;
grant execute on function public.record_prelaunch_sale(uuid, integer, text, text, timestamptz) to authenticated;
grant execute on function public.void_prelaunch_sale(uuid, text) to authenticated;
grant execute on function public.publish_drop(uuid) to authenticated;
grant execute on function public.set_storefront_drop(text, uuid) to authenticated;
