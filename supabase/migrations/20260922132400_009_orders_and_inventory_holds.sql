-- Forward only. Defaults preserve all existing business rows and keep ordering off.
alter type public.customer_availability_status add value 'temporarily_unavailable';
alter table public.storefront_config add column hold_ttl_seconds integer not null default 600
  check (hold_ttl_seconds between 60 and 3600);
alter table public.drops add column max_quantity_per_order integer
  check (max_quantity_per_order > 0 and max_quantity_per_order <= capacity),
  add column online_ordering_enabled boolean not null default false;

create table public.inventory_holds (
  id uuid primary key default gen_random_uuid(),
  drop_id uuid not null references public.drops(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  status text not null default 'active' check (status in ('active','released','converted','expired')),
  checkout_session_hash text not null check (checkout_session_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  released_at timestamptz,
  converted_at timestamptz,
  check (expires_at > created_at),
  check ((status = 'released') = (released_at is not null)),
  check ((status = 'converted') = (converted_at is not null))
);
create unique index inventory_holds_one_active_session on public.inventory_holds(checkout_session_hash) where status = 'active';
create index inventory_holds_session_history on public.inventory_holds(checkout_session_hash, created_at desc);
create index inventory_holds_drop_active on public.inventory_holds(drop_id, status, expires_at);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique default ('D-' || upper(encode(extensions.gen_random_bytes(6),'hex'))),
  hold_id uuid not null unique references public.inventory_holds(id) on delete restrict,
  status text not null default 'pending_payment' check (status in ('pending_payment','paid','cancelled','expired','refunded')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  subtotal_minor bigint not null check (subtotal_minor between 0 and 9007199254740991),
  delivery_fee_minor bigint not null check (delivery_fee_minor between 0 and 9007199254740991),
  total_minor bigint generated always as (subtotal_minor + delivery_fee_minor) stored check (total_minor <= 9007199254740991),
  customer_name text not null check (length(btrim(customer_name)) between 1 and 120),
  customer_phone text not null check (customer_phone ~ '^\+[1-9][0-9]{7,14}$'),
  customer_email text check (length(customer_email) <= 254),
  fulfillment_method text not null check (fulfillment_method in ('pickup','delivery')),
  fulfillment_date date not null,
  slot_id uuid references public.drop_slots(id) on delete restrict,
  slot_start time,
  slot_end time,
  delivery_zone_id uuid references public.drop_delivery_zones(id) on delete restrict,
  delivery_zone_label text,
  delivery_address text,
  delivery_notes text,
  pickup_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancel_reason text,
  paid_at timestamptz,
  inventory_committed_at timestamptz,
  inventory_released_at timestamptz,
  check (inventory_released_at is null or inventory_committed_at is not null),
  check (status <> 'paid' or (paid_at is not null and inventory_committed_at is not null)),
  check ((status = 'cancelled') = (cancelled_at is not null)),
  check (status <> 'cancelled' or length(btrim(cancel_reason)) > 0),
  check ((slot_id is null and slot_start is null and slot_end is null) or (slot_id is not null and slot_start is not null and slot_end > slot_start)),
  check ((fulfillment_method = 'pickup' and delivery_fee_minor = 0 and delivery_zone_id is null and delivery_address is null and pickup_label is not null)
    or (fulfillment_method = 'delivery' and delivery_zone_id is not null and delivery_zone_label is not null and length(btrim(delivery_address)) > 0))
);
create index orders_status_created on public.orders(status, created_at desc);
create index orders_slot on public.orders(slot_id) where slot_id is not null;
create index orders_zone on public.orders(delivery_zone_id) where delivery_zone_id is not null;
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  drop_id uuid not null references public.drops(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price_minor bigint not null check (unit_price_minor between 1 and 9007199254740991),
  line_total_minor bigint generated always as (unit_price_minor * quantity) stored check (line_total_minor <= 9007199254740991),
  snapshot_name text not null,
  snapshot_drop_number integer not null,
  created_at timestamptz not null default now()
);
create index order_items_drop on public.order_items(drop_id);
create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete restrict,
  event_type text not null check (event_type in ('order_created','order_cancelled','hold_expired')),
  actor_kind text not null check (actor_kind in ('customer','admin','system')),
  actor_user_id uuid references auth.users(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index order_events_timeline on public.order_events(order_id, created_at, id);
create index order_events_actor on public.order_events(actor_user_id) where actor_user_id is not null;

alter table public.inventory_holds enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
revoke all on public.inventory_holds, public.orders, public.order_items, public.order_events from public, anon, authenticated;
grant select on public.inventory_holds, public.orders, public.order_items, public.order_events to authenticated;
create policy holds_admin_read on public.inventory_holds for select to authenticated using ((select private.is_deipo_admin()));
create policy orders_admin_read on public.orders for select to authenticated using ((select private.is_deipo_admin()));
create policy items_admin_read on public.order_items for select to authenticated using ((select private.is_deipo_admin()));
create policy events_admin_read on public.order_events for select to authenticated using ((select private.is_deipo_admin()));

create function private.prevent_transaction_delete() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'TRANSACTION_FACTS_IMMUTABLE'; end; $$;
create trigger holds_no_delete before delete on public.inventory_holds for each row execute function private.prevent_transaction_delete();
create trigger orders_no_delete before delete on public.orders for each row execute function private.prevent_transaction_delete();
create trigger items_immutable before update or delete on public.order_items for each row execute function private.prevent_transaction_delete();
create trigger events_append_only before update or delete on public.order_events for each row execute function private.prevent_transaction_delete();
create trigger holds_updated before update on public.inventory_holds for each row execute function public.set_updated_at();
create trigger orders_updated before update on public.orders for each row execute function public.set_updated_at();
create function private.order_facts_immutable() returns trigger language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - array['total_minor','status','updated_at','cancelled_at','cancel_reason','paid_at','inventory_committed_at','inventory_released_at'])
    is distinct from (to_jsonb(old) - array['total_minor','status','updated_at','cancelled_at','cancel_reason','paid_at','inventory_committed_at','inventory_released_at']) then
    raise exception 'TRANSACTION_FACTS_IMMUTABLE';
  end if;
  return new;
end; $$;
create trigger orders_facts_immutable before update on public.orders for each row execute function private.order_facts_immutable();
create function private.hold_facts_immutable() returns trigger language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - array['status','updated_at','released_at','converted_at']) is distinct from
     (to_jsonb(old) - array['status','updated_at','released_at','converted_at'])
     or (old.status <> 'active' and new.status <> old.status) then raise exception 'TRANSACTION_FACTS_IMMUTABLE'; end if;
  return new;
end; $$;
create trigger holds_facts_immutable before update on public.inventory_holds for each row execute function private.hold_facts_immutable();
revoke all on function private.prevent_transaction_delete(), private.order_facts_immutable(), private.hold_facts_immutable() from public, anon, authenticated;
