create extension if not exists pgcrypto with schema extensions;

create type public.admin_role as enum ('founder', 'admin', 'operator');
create type public.drop_lifecycle_status as enum ('draft', 'scheduled', 'published', 'archived', 'cancelled');
create type public.customer_availability_status as enum ('upcoming', 'active', 'low_stock', 'sales_closed', 'sold_out');

create table public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.admin_role not null default 'operator',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.drops (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique check (number > 0),
  slug text not null,
  name text not null check (btrim(name) <> ''),
  tagline text,
  description text,
  lifecycle_status public.drop_lifecycle_status not null default 'draft',
  currency text not null default 'GTQ' check (currency ~ '^[A-Z]{3}$'),
  price_minor bigint not null default 0 check (price_minor >= 0),
  capacity integer not null check (capacity > 0),
  low_stock_threshold integer not null default 8 check (low_stock_threshold >= 0 and low_stock_threshold <= capacity),
  orders_open_at timestamptz,
  orders_close_at timestamptz,
  fulfillment_date date,
  fulfillment_day_label text,
  delivery_enabled boolean not null default true,
  pickup_enabled boolean not null default true,
  pickup_label text,
  hero_image_path text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint drops_slug_format check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint drops_schedule_order check (orders_open_at is null or orders_close_at is null or orders_close_at > orders_open_at)
);
create unique index drops_slug_lower_uidx on public.drops ((lower(slug)));
create index drops_lifecycle_idx on public.drops (lifecycle_status);
create index drops_open_close_idx on public.drops (orders_open_at, orders_close_at);

create table public.drop_slots (
  id uuid primary key default gen_random_uuid(),
  drop_id uuid not null references public.drops(id) on delete cascade,
  starts_at time not null,
  ends_at time not null,
  capacity integer check (capacity is null or capacity > 0),
  is_enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drop_slots_valid_time check (ends_at > starts_at),
  constraint drop_slots_unique_window unique (drop_id, starts_at, ends_at)
);
create index drop_slots_drop_sort_idx on public.drop_slots (drop_id, sort_order, starts_at);

create table public.prelaunch_sales (
  id uuid primary key default gen_random_uuid(),
  drop_id uuid not null references public.drops(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  source text not null check (btrim(source) <> ''),
  note text,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete set null,
  void_reason text,
  constraint prelaunch_sales_void_consistency check (
    (voided_at is null and voided_by is null and void_reason is null)
    or
    (voided_at is not null and voided_by is not null and btrim(coalesce(void_reason, '')) <> '')
  )
);
create index prelaunch_sales_drop_active_idx on public.prelaunch_sales (drop_id) where voided_at is null;

create table public.storefront_config (
  singleton boolean primary key default true check (singleton),
  current_drop_id uuid references public.drops(id) on delete set null,
  next_drop_id uuid references public.drops(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint storefront_distinct_drops check (current_drop_id is null or next_drop_id is null or current_drop_id <> next_drop_id)
);
insert into public.storefront_config (singleton) values (true);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (btrim(action) <> ''),
  entity_type text not null check (btrim(entity_type) <> ''),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger admin_profiles_set_updated_at before update on public.admin_profiles for each row execute function public.set_updated_at();
create trigger drops_set_updated_at before update on public.drops for each row execute function public.set_updated_at();
create trigger drop_slots_set_updated_at before update on public.drop_slots for each row execute function public.set_updated_at();
create trigger storefront_config_set_updated_at before update on public.storefront_config for each row execute function public.set_updated_at();

create or replace function public.is_deipo_admin(required_roles public.admin_role[] default null)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.admin_profiles ap
    where ap.user_id = auth.uid()
      and ap.is_active
      and (required_roles is null or ap.role = any(required_roles))
  );
$$;

create or replace function public.validate_prelaunch_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity integer;
  v_other_sold integer;
  v_new_counted integer;
begin
  select d.capacity into v_capacity
  from public.drops d
  where d.id = new.drop_id
  for update;

  if v_capacity is null then
    raise exception 'Drop does not exist';
  end if;

  select coalesce(sum(ps.quantity), 0)::integer into v_other_sold
  from public.prelaunch_sales ps
  where ps.drop_id = new.drop_id
    and ps.voided_at is null
    and (tg_op = 'INSERT' or ps.id <> new.id);

  v_new_counted := case when new.voided_at is null then new.quantity else 0 end;

  if v_other_sold + v_new_counted > v_capacity then
    raise exception 'Confirmed pre-launch sales would exceed drop capacity';
  end if;

  return new;
end;
$$;

create trigger prelaunch_sales_capacity_guard
before insert or update on public.prelaunch_sales
for each row execute function public.validate_prelaunch_capacity();

create or replace function public.validate_drop_capacity_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sold integer;
begin
  if new.capacity is distinct from old.capacity then
    select coalesce(sum(ps.quantity), 0)::integer into v_sold
    from public.prelaunch_sales ps
    where ps.drop_id = old.id and ps.voided_at is null;

    if new.capacity < v_sold then
      raise exception 'Capacity cannot be lower than confirmed sold units';
    end if;

    if new.low_stock_threshold > new.capacity then
      raise exception 'Low-stock threshold cannot exceed capacity';
    end if;
  end if;
  return new;
end;
$$;
create trigger drops_capacity_guard
before update on public.drops
for each row execute function public.validate_drop_capacity_change();

create or replace function public.prevent_prelaunch_sale_delete()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'Confirmed pre-launch sales cannot be deleted; void the record instead';
end;
$$;
create trigger prelaunch_sales_no_delete
before delete on public.prelaunch_sales
for each row execute function public.prevent_prelaunch_sale_delete();

create or replace function public.prevent_prelaunch_sale_rewrite()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.drop_id is distinct from old.drop_id
     or new.quantity is distinct from old.quantity
     or new.source is distinct from old.source
     or new.note is distinct from old.note
     or new.confirmed_at is distinct from old.confirmed_at
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Confirmed pre-launch sale facts are immutable; void and create a new record instead';
  end if;

  if old.voided_at is not null and (
      new.voided_at is distinct from old.voided_at
      or new.voided_by is distinct from old.voided_by
      or new.void_reason is distinct from old.void_reason
  ) then
    raise exception 'Voided pre-launch sales cannot be changed';
  end if;

  return new;
end;
$$;
create trigger prelaunch_sales_immutable
before update on public.prelaunch_sales
for each row execute function public.prevent_prelaunch_sale_rewrite();

create or replace view public.drop_inventory as
select
  d.id as drop_id,
  d.capacity,
  coalesce(sum(ps.quantity) filter (where ps.voided_at is null), 0)::integer as prelaunch_sold_units,
  0::integer as online_sold_units,
  0::integer as held_units,
  coalesce(sum(ps.quantity) filter (where ps.voided_at is null), 0)::integer as total_sold,
  (d.capacity - coalesce(sum(ps.quantity) filter (where ps.voided_at is null), 0))::integer as available,
  case when d.capacity = 0 then 0::numeric else round((coalesce(sum(ps.quantity) filter (where ps.voided_at is null), 0)::numeric / d.capacity::numeric), 6) end as sold_fraction
from public.drops d
left join public.prelaunch_sales ps on ps.drop_id = d.id
group by d.id, d.capacity;

create or replace function public.derive_customer_availability(p_drop_id uuid)
returns public.customer_availability_status
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d public.drops%rowtype;
  inv record;
begin
  select * into d from public.drops where id = p_drop_id;
  if not found then raise exception 'Drop does not exist'; end if;
  select * into inv from public.drop_inventory where drop_id = p_drop_id;

  if inv.total_sold >= d.capacity then return 'sold_out'; end if;
  if d.orders_close_at is not null and now() >= d.orders_close_at then return 'sales_closed'; end if;
  if d.orders_open_at is null or now() < d.orders_open_at then return 'upcoming'; end if;
  if inv.available <= d.low_stock_threshold then return 'low_stock'; end if;
  return 'active';
end;
$$;

create or replace function public.audit_drop_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'drop_created';
  elsif new.lifecycle_status is distinct from old.lifecycle_status then
    v_action := case new.lifecycle_status
      when 'published' then 'drop_published'
      when 'archived' then 'drop_archived'
      when 'cancelled' then 'drop_cancelled'
      else 'drop_updated'
    end;
  else
    v_action := 'drop_updated';
  end if;

  insert into public.audit_log(actor_user_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), v_action, 'drop', new.id,
    jsonb_build_object('number', new.number, 'lifecycle_status', new.lifecycle_status));
  return new;
end;
$$;
create trigger drops_audit after insert or update on public.drops for each row execute function public.audit_drop_change();

create or replace function public.audit_prelaunch_sale_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log(actor_user_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), 'prelaunch_sale_added', 'prelaunch_sale', new.id,
      jsonb_build_object('drop_id', new.drop_id, 'quantity', new.quantity, 'source', new.source));
  elsif old.voided_at is null and new.voided_at is not null then
    insert into public.audit_log(actor_user_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), 'prelaunch_sale_voided', 'prelaunch_sale', new.id,
      jsonb_build_object('drop_id', new.drop_id, 'quantity', new.quantity, 'reason', new.void_reason));
  end if;
  return new;
end;
$$;
create trigger prelaunch_sales_audit after insert or update on public.prelaunch_sales for each row execute function public.audit_prelaunch_sale_change();

create or replace function public.audit_storefront_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.current_drop_id is distinct from old.current_drop_id then
    insert into public.audit_log(actor_user_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), 'storefront_current_changed', 'storefront_config', new.current_drop_id,
      jsonb_build_object('previous_drop_id', old.current_drop_id, 'new_drop_id', new.current_drop_id));
  end if;
  if new.next_drop_id is distinct from old.next_drop_id then
    insert into public.audit_log(actor_user_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), 'storefront_next_changed', 'storefront_config', new.next_drop_id,
      jsonb_build_object('previous_drop_id', old.next_drop_id, 'new_drop_id', new.next_drop_id));
  end if;
  return new;
end;
$$;
create trigger storefront_config_audit after update on public.storefront_config for each row execute function public.audit_storefront_change();

create or replace function public.record_prelaunch_sale(
  p_drop_id uuid,
  p_quantity integer,
  p_source text,
  p_note text default null,
  p_confirmed_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid;
begin
  if not public.is_deipo_admin(array['founder','admin']::public.admin_role[]) then
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
security definer
set search_path = public, auth
as $$
begin
  if not public.is_deipo_admin(array['founder','admin']::public.admin_role[]) then
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
security definer
set search_path = public, auth
as $$
declare
  d public.drops%rowtype;
  inv record;
begin
  if not public.is_deipo_admin(array['founder','admin']::public.admin_role[]) then
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
security definer
set search_path = public, auth
as $$
declare
  v_status public.drop_lifecycle_status;
begin
  if not public.is_deipo_admin(array['founder','admin']::public.admin_role[]) then
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

create or replace function public.public_drop_payload(p_drop_id uuid, p_allow_scheduled boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
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
  v_availability := public.derive_customer_availability(p_drop_id);

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

create or replace function public.get_storefront_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cfg public.storefront_config%rowtype;
begin
  select * into cfg from public.storefront_config where singleton;
  return jsonb_build_object(
    'current', public.public_drop_payload(cfg.current_drop_id, false),
    'next', public.public_drop_payload(cfg.next_drop_id, true)
  );
end;
$$;

alter table public.admin_profiles enable row level security;
alter table public.drops enable row level security;
alter table public.drop_slots enable row level security;
alter table public.prelaunch_sales enable row level security;
alter table public.storefront_config enable row level security;
alter table public.audit_log enable row level security;

create policy admin_profiles_self_read on public.admin_profiles for select to authenticated using (user_id = auth.uid() or public.is_deipo_admin());
create policy admin_profiles_founder_insert on public.admin_profiles for insert to authenticated with check (public.is_deipo_admin(array['founder']::public.admin_role[]));
create policy admin_profiles_founder_update on public.admin_profiles for update to authenticated using (public.is_deipo_admin(array['founder']::public.admin_role[])) with check (public.is_deipo_admin(array['founder']::public.admin_role[]));
create policy admin_profiles_founder_delete on public.admin_profiles for delete to authenticated using (public.is_deipo_admin(array['founder']::public.admin_role[]));

create policy drops_admin_read on public.drops for select to authenticated using (public.is_deipo_admin());
create policy drops_admin_insert on public.drops for insert to authenticated with check (public.is_deipo_admin(array['founder','admin']::public.admin_role[]));
create policy drops_admin_update on public.drops for update to authenticated using (public.is_deipo_admin(array['founder','admin']::public.admin_role[])) with check (public.is_deipo_admin(array['founder','admin']::public.admin_role[]));
create policy drops_admin_delete on public.drops for delete to authenticated using (public.is_deipo_admin(array['founder','admin']::public.admin_role[]) and lifecycle_status = 'draft');

create policy drop_slots_admin_read on public.drop_slots for select to authenticated using (public.is_deipo_admin());
create policy drop_slots_admin_insert on public.drop_slots for insert to authenticated with check (public.is_deipo_admin(array['founder','admin']::public.admin_role[]));
create policy drop_slots_admin_update on public.drop_slots for update to authenticated using (public.is_deipo_admin(array['founder','admin']::public.admin_role[])) with check (public.is_deipo_admin(array['founder','admin']::public.admin_role[]));
create policy drop_slots_admin_delete on public.drop_slots for delete to authenticated using (public.is_deipo_admin(array['founder','admin']::public.admin_role[]));

create policy prelaunch_sales_admin_read on public.prelaunch_sales for select to authenticated using (public.is_deipo_admin());
create policy storefront_config_admin_read on public.storefront_config for select to authenticated using (public.is_deipo_admin());
create policy storefront_config_admin_update on public.storefront_config for update to authenticated using (public.is_deipo_admin(array['founder','admin']::public.admin_role[])) with check (public.is_deipo_admin(array['founder','admin']::public.admin_role[]));
create policy audit_log_admin_read on public.audit_log for select to authenticated using (public.is_deipo_admin());

revoke all on public.admin_profiles, public.drops, public.drop_slots, public.prelaunch_sales, public.storefront_config, public.audit_log from anon;
revoke all on public.audit_log from authenticated;
grant select on public.admin_profiles, public.drops, public.drop_slots, public.prelaunch_sales, public.storefront_config to authenticated;
grant insert, update, delete on public.admin_profiles, public.drops, public.drop_slots to authenticated;
grant update on public.storefront_config to authenticated;
grant select on public.audit_log to authenticated;

revoke all on public.drop_inventory from anon, authenticated;
revoke all on function public.set_updated_at() from public;
revoke all on function public.validate_prelaunch_capacity() from public;
revoke all on function public.validate_drop_capacity_change() from public;
revoke all on function public.prevent_prelaunch_sale_delete() from public;
revoke all on function public.prevent_prelaunch_sale_rewrite() from public;
revoke all on function public.audit_drop_change() from public;
revoke all on function public.audit_prelaunch_sale_change() from public;
revoke all on function public.audit_storefront_change() from public;
revoke all on function public.public_drop_payload(uuid, boolean) from public;
revoke all on function public.derive_customer_availability(uuid) from public;

revoke all on function public.is_deipo_admin(public.admin_role[]) from public;
grant execute on function public.is_deipo_admin(public.admin_role[]) to authenticated;

revoke all on function public.record_prelaunch_sale(uuid, integer, text, text, timestamptz) from public;
grant execute on function public.record_prelaunch_sale(uuid, integer, text, text, timestamptz) to authenticated;
revoke all on function public.void_prelaunch_sale(uuid, text) from public;
grant execute on function public.void_prelaunch_sale(uuid, text) to authenticated;
revoke all on function public.publish_drop(uuid) from public;
grant execute on function public.publish_drop(uuid) to authenticated;
revoke all on function public.set_storefront_drop(text, uuid) from public;
grant execute on function public.set_storefront_drop(text, uuid) to authenticated;

revoke all on function public.get_storefront_state() from public;
grant execute on function public.get_storefront_state() to anon, authenticated;
