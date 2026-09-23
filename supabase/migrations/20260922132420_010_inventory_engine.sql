-- One canonical projection. Time releases inventory even without a cleanup write.
create or replace view public.drop_inventory with (security_invoker = true) as
select d.id as drop_id, d.capacity,
  p.units::integer as prelaunch_sold_units, o.units::integer as online_sold_units,
  h.units::integer as held_units, (p.units + o.units)::integer as total_sold,
  (d.capacity - p.units - o.units - h.units)::integer as available,
  round((p.units + o.units)::numeric / d.capacity, 6) as sold_fraction
from public.drops d
cross join lateral (select coalesce(sum(quantity),0) units from public.prelaunch_sales where drop_id=d.id and voided_at is null) p
cross join lateral (select coalesce(sum(i.quantity),0) units from public.order_items i join public.orders o on o.id=i.order_id
  where i.drop_id=d.id and o.inventory_committed_at is not null and o.inventory_released_at is null) o
cross join lateral (select coalesce(sum(quantity),0) units from public.inventory_holds
  where drop_id=d.id and status='active' and expires_at > now()) h;
revoke all on public.drop_inventory from public, anon;
grant select on public.drop_inventory to authenticated;

create or replace function private.derive_customer_availability(p_drop_id uuid)
returns public.customer_availability_status language plpgsql stable security definer set search_path = '' as $$
declare d public.drops; i record;
begin
  select * into d from public.drops where id=p_drop_id;
  select * into i from public.drop_inventory where drop_id=p_drop_id;
  if i.total_sold >= d.capacity then return 'sold_out'; end if;
  if d.orders_close_at <= now() then return 'sales_closed'; end if;
  if d.orders_open_at is null or d.orders_open_at > now() then return 'upcoming'; end if;
  if i.available <= 0 and i.held_units > 0 then return 'temporarily_unavailable'; end if;
  if i.available <= d.low_stock_threshold then return 'low_stock'; end if;
  return 'active';
end; $$;

-- Existing writers must participate in the same drop-row serialization protocol.
create or replace function private.validate_prelaunch_capacity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_available integer; v_previous integer := 0;
begin
  perform 1 from public.drops where id=new.drop_id for update;
  select available into v_available from public.drop_inventory where drop_id=new.drop_id;
  if tg_op='UPDATE' and old.voided_at is null then v_previous:=old.quantity; end if;
  if (case when new.voided_at is null then new.quantity else 0 end) > v_available + v_previous then
    raise exception 'INSUFFICIENT_INVENTORY: prelaunch capacity includes sold and held units';
  end if;
  return new;
end; $$;
create or replace function private.validate_drop_capacity_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare i record;
begin
  if new.capacity is distinct from old.capacity then
    select * into i from public.drop_inventory where drop_id=old.id;
    if new.capacity < i.total_sold + i.held_units then raise exception 'Capacity cannot be lower than sold plus held units'; end if;
  end if;
  return new;
end; $$;

-- Every transaction that changes inventory facts locks its drop, including future
-- payment finalization. Deferred checks see the complete held -> sold swap.
create function private.lock_transaction_drop() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_drop uuid;
begin
  if tg_table_name='orders' then select drop_id into v_drop from public.inventory_holds where id=new.hold_id;
  else v_drop:=new.drop_id; end if;
  perform 1 from public.drops where id=v_drop for update;
  return new;
end; $$;
create trigger holds_lock_drop before insert or update on public.inventory_holds for each row execute function private.lock_transaction_drop();
create trigger orders_lock_drop before insert or update on public.orders for each row execute function private.lock_transaction_drop();
create trigger items_lock_drop before insert on public.order_items for each row execute function private.lock_transaction_drop();
create function private.check_transaction_inventory() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_drop uuid;
begin
  if tg_table_name='orders' then select drop_id into v_drop from public.inventory_holds where id=new.hold_id;
  else v_drop:=new.drop_id; end if;
  if exists(select 1 from public.drop_inventory where drop_id=v_drop and available<0) then raise exception 'INSUFFICIENT_INVENTORY'; end if;
  if exists(select 1 from public.inventory_holds h left join public.orders o on o.hold_id=h.id
    left join public.order_items i on i.order_id=o.id where h.drop_id=v_drop and (
    (h.status='converted') is distinct from (o.inventory_committed_at is not null)
    or (o.id is not null and (i.id is null or i.drop_id<>h.drop_id or i.quantity<>h.quantity or i.line_total_minor<>o.subtotal_minor))
    or (o.status='pending_payment' and (h.status<>'active' or o.inventory_committed_at is not null))
    or (o.status='cancelled' and (h.status not in ('released','expired') or o.inventory_committed_at is not null))
  )) then raise exception 'INVENTORY_RELATION_INVALID'; end if;
  return null;
end; $$;
create constraint trigger holds_inventory_check after insert or update on public.inventory_holds deferrable initially deferred for each row execute function private.check_transaction_inventory();
create constraint trigger orders_inventory_check after insert or update on public.orders deferrable initially deferred for each row execute function private.check_transaction_inventory();
create constraint trigger items_inventory_check after insert on public.order_items deferrable initially deferred for each row execute function private.check_transaction_inventory();

create function private.lock_checkout_session(p_hash text) returns void language plpgsql set search_path = '' as $$
begin
  if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_SESSION'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_hash, 20260922));
end; $$;
create function private.validate_online_drop(p_drop_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare d public.drops;
begin
  select * into d from public.drops where id=p_drop_id;
  if not found then raise exception 'DROP_NOT_FOUND'; end if;
  if not exists(select 1 from public.storefront_config where current_drop_id=d.id) then raise exception 'DROP_NOT_CURRENT'; end if;
  if d.lifecycle_status<>'published' then raise exception 'DROP_NOT_PUBLISHED'; end if;
  if not d.online_ordering_enabled then raise exception 'ONLINE_ORDERING_DISABLED'; end if;
  if d.orders_open_at is null or d.orders_open_at>clock_timestamp() then raise exception 'SALES_NOT_OPEN'; end if;
  if d.orders_close_at is null or d.orders_close_at<=clock_timestamp() then raise exception 'SALES_CLOSED'; end if;
end; $$;
create function private.expire_checkout_session(p_hash text) returns void language plpgsql security definer set search_path = '' as $$
declare h public.inventory_holds; o public.orders;
begin
  -- Caller already owns session + relevant drop locks.
  for h in select * from public.inventory_holds where checkout_session_hash=p_hash and status='active' and expires_at<=clock_timestamp() for update loop
    update public.inventory_holds set status='expired' where id=h.id;
    update public.orders set status='expired' where hold_id=h.id and status='pending_payment' and inventory_committed_at is null returning * into o;
    if found then insert into public.order_events(order_id,event_type,actor_kind) values(o.id,'hold_expired','system'); end if;
  end loop;
end; $$;

-- Customer DTO: deliberately omits internal hold/order IDs, hash, PII and events.
create function private.checkout_payload(p_hash text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare h public.inventory_holds; o public.orders; d public.drops; i public.order_items;
begin
  select * into h from public.inventory_holds where checkout_session_hash=p_hash order by created_at desc,id desc limit 1;
  if not found then return jsonb_build_object('state','none','server_time',clock_timestamp()); end if;
  select * into d from public.drops where id=h.drop_id;
  select * into o from public.orders where hold_id=h.id;
  select * into i from public.order_items where order_id=o.id;
  return jsonb_build_object(
    'state',case when h.status='active' and h.expires_at<=now() then 'expired' else h.status end,
    'server_time',clock_timestamp(),'expires_at',h.expires_at,'quantity',h.quantity,
    'drop',jsonb_build_object('number',coalesce(i.snapshot_drop_number,d.number),'name',coalesce(i.snapshot_name,d.name),
      'currency',coalesce(o.currency,d.currency),'unit_price_minor',coalesce(i.unit_price_minor,d.price_minor),
      'fulfillment_date',coalesce(o.fulfillment_date,d.fulfillment_date),'pickup_enabled',d.pickup_enabled,'delivery_enabled',d.delivery_enabled,
      'pickup_label',d.pickup_label,'online_ordering_enabled',d.online_ordering_enabled,
      'slots',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'start',to_char(s.starts_at,'HH24:MI'),'end',to_char(s.ends_at,'HH24:MI')) order by s.sort_order,s.starts_at),'[]'::jsonb) from public.drop_slots s where s.drop_id=d.id and s.is_enabled),
      'zones',(select coalesce(jsonb_agg(jsonb_build_object('id',z.id,'label',z.label,'fee_minor',z.fee_minor) order by z.sort_order),'[]'::jsonb) from public.drop_delivery_zones z where z.drop_id=d.id and z.is_enabled)),
    'order',case when o.id is null then null else jsonb_build_object('code',o.order_code,
      'status',case when o.status='pending_payment' and h.expires_at<=now() then 'expired' else o.status end,
      'subtotal_minor',o.subtotal_minor,'delivery_fee_minor',o.delivery_fee_minor,'total_minor',o.total_minor,
      'fulfillment_method',o.fulfillment_method,'fulfillment_date',o.fulfillment_date,'pickup_label',o.pickup_label,
      'zone_label',o.delivery_zone_label,'slot_start',o.slot_start,'slot_end',o.slot_end) end);
end; $$;

create function public.create_inventory_hold(p_drop_id uuid,p_quantity integer,p_checkout_session_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare h public.inventory_holds; d public.drops; v_available integer; v_ttl integer;
begin
  if p_quantity is null or p_quantity<=0 then raise exception 'INVALID_QUANTITY'; end if;
  perform private.lock_checkout_session(p_checkout_session_hash);
  -- Sorted locks also cover replacing a hold on a different drop.
  perform 1 from public.drops where id=p_drop_id or id in (select drop_id from public.inventory_holds where checkout_session_hash=p_checkout_session_hash and status='active') order by id for update;
  perform private.expire_checkout_session(p_checkout_session_hash);
  perform private.validate_online_drop(p_drop_id);
  select * into d from public.drops where id=p_drop_id;
  if d.max_quantity_per_order is not null and p_quantity>d.max_quantity_per_order then raise exception 'MAX_QUANTITY_EXCEEDED'; end if;
  select * into h from public.inventory_holds where checkout_session_hash=p_checkout_session_hash and status='active' for update;
  if found then
    if h.drop_id=p_drop_id and h.quantity=p_quantity then return private.checkout_payload(p_checkout_session_hash); end if;
    if exists(select 1 from public.orders where hold_id=h.id) then raise exception 'ORDER_ALREADY_EXISTS'; end if;
    update public.inventory_holds set status='released',released_at=clock_timestamp() where id=h.id;
  end if;
  select available into v_available from public.drop_inventory where drop_id=p_drop_id;
  if p_quantity>v_available then raise exception 'INSUFFICIENT_INVENTORY'; end if;
  select hold_ttl_seconds into v_ttl from public.storefront_config where singleton;
  insert into public.inventory_holds(drop_id,quantity,checkout_session_hash,created_at,expires_at)
    values(p_drop_id,p_quantity,p_checkout_session_hash,clock_timestamp(),least(clock_timestamp()+make_interval(secs=>v_ttl),d.orders_close_at));
  return private.checkout_payload(p_checkout_session_hash);
end; $$;
create function public.get_checkout_state(p_checkout_session_hash text) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.lock_checkout_session(p_checkout_session_hash);
  perform 1 from public.drops where id in(select drop_id from public.inventory_holds where checkout_session_hash=p_checkout_session_hash and status='active') order by id for update;
  perform private.expire_checkout_session(p_checkout_session_hash);
  return private.checkout_payload(p_checkout_session_hash);
end; $$;
create function public.release_inventory_hold(p_checkout_session_hash text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare h public.inventory_holds;
begin
  perform private.lock_checkout_session(p_checkout_session_hash);
  perform 1 from public.drops where id in(select drop_id from public.inventory_holds where checkout_session_hash=p_checkout_session_hash and status='active') order by id for update;
  perform private.expire_checkout_session(p_checkout_session_hash);
  select * into h from public.inventory_holds where checkout_session_hash=p_checkout_session_hash and status='active' for update;
  if found then
    if exists(select 1 from public.orders where hold_id=h.id) then raise exception 'ORDER_ALREADY_EXISTS'; end if;
    update public.inventory_holds set status='released',released_at=clock_timestamp() where id=h.id;
  end if;
  return private.checkout_payload(p_checkout_session_hash);
end; $$;
revoke all on function private.lock_transaction_drop(),private.check_transaction_inventory(),private.lock_checkout_session(text),private.validate_online_drop(uuid),private.expire_checkout_session(text),private.checkout_payload(text) from public, anon, authenticated;
revoke all on function public.create_inventory_hold(uuid,integer,text),public.get_checkout_state(text),public.release_inventory_hold(text) from public, anon, authenticated;
grant execute on function public.create_inventory_hold(uuid,integer,text),public.get_checkout_state(text),public.release_inventory_hold(text) to anon,authenticated;

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
    'max_quantity_per_order', d.max_quantity_per_order,
    'online_ordering_enabled', d.online_ordering_enabled,
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
