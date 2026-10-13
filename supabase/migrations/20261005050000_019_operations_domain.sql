-- Sprint 04A. Forward only; no business data, payment functions or launch gates changed.
create table public.operator_profiles (
 user_id uuid primary key references auth.users(id) on delete restrict,
 role text not null check (role in ('kitchen','fulfillment','driver')),
 is_active boolean not null default true,
 invited_by uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index operator_profiles_inviter on public.operator_profiles(invited_by);

-- Existing drop_slots.capacity is the logistical ORDERS limit (not drop units).
-- Preserve every configured value; no assumed 35-order or 80-unit backfill.
comment on column public.drop_slots.capacity is 'Logistical max_orders; nullable planning limit, not enforced by Sprint 02 checkout.';
alter table public.drop_slots add column max_units integer check (max_units > 0);
create table public.drop_operations_config (
 drop_id uuid primary key references public.drops(id) on delete restrict,
 cancellation_cutoff_at timestamptz,
 prep_lead_minutes integer check (prep_lead_minutes >= 0),
 delivery_lead_minutes integer check (delivery_lead_minutes >= 0),
 pickup_grace_minutes integer not null default 30 check (pickup_grace_minutes >= 0),
 updated_by uuid not null references auth.users(id) on delete restrict,
 updated_at timestamptz not null default now()
);
create index drop_operations_config_actor on public.drop_operations_config(updated_by);
create table public.drop_packing_components (
 id uuid primary key default gen_random_uuid(), drop_id uuid not null references public.drops(id) on delete restrict,
 code text not null check (code ~ '^[a-z0-9_]{1,40}$'), label text not null check (length(btrim(label)) between 1 and 120),
 units_per_item integer not null check (units_per_item > 0), unique(drop_id,code)
);
create table public.production_waves (
 id uuid primary key default gen_random_uuid(), drop_id uuid not null references public.drops(id) on delete restrict,
 sequence integer not null check (sequence > 0), planned_units integer not null check (planned_units > 0),
 target_ready_at timestamptz not null, started_at timestamptz, completed_at timestamptz,
 created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(),
 unique(drop_id,sequence), check(completed_at is null or (started_at is not null and completed_at >= started_at))
);
create index production_waves_creator on public.production_waves(created_by);
create table public.order_fulfillment (
 id uuid primary key default gen_random_uuid(), order_id uuid not null unique references public.orders(id) on delete restrict,
 status text not null default 'queued' check(status in ('queued','in_prep','packed','ready','out_for_delivery','completed','cancelled')),
 wave_id uuid references public.production_waves(id) on delete restrict,
 version integer not null default 0 check(version >= 0),
 sealed_at timestamptz, sealed_by uuid references auth.users(id) on delete restrict,
 completed_at timestamptz, cancelled_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check ((sealed_at is null) = (sealed_by is null)),
 check ((status='completed') = (completed_at is not null)), check ((status='cancelled') = (cancelled_at is not null)),
 check (status not in ('packed','ready','out_for_delivery','completed') or sealed_at is not null)
);
create index order_fulfillment_queue on public.order_fulfillment(status,created_at);
create index order_fulfillment_wave on public.order_fulfillment(wave_id);
create index order_fulfillment_sealer on public.order_fulfillment(sealed_by);
create table public.fulfillment_events (
 id bigint generated always as identity primary key,
 fulfillment_id uuid not null references public.order_fulfillment(id) on delete restrict,
 event_type text not null check(event_type in ('provisioned','transition','state_override','wave_assigned','packing_checked','packing_plan_set','issue_opened','issue_resolved','driver_assigned','logistics_override','access_rotated','access_revoked')),
 from_status text, to_status text,
 actor_user_id uuid not null references auth.users(id) on delete restrict,
 reason text check(reason is null or length(btrim(reason)) between 1 and 500),
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index fulfillment_events_timeline on public.fulfillment_events(fulfillment_id,id);
create index fulfillment_events_actor on public.fulfillment_events(actor_user_id);
create table public.fulfillment_packing_checks (
 id uuid primary key default gen_random_uuid(), fulfillment_id uuid not null references public.order_fulfillment(id) on delete restrict,
 component_code text not null, label text not null, required_quantity integer not null check(required_quantity > 0),
 checked_quantity integer not null default 0 check(checked_quantity >= 0 and checked_quantity <= required_quantity),
 checked_by uuid references auth.users(id) on delete restrict, checked_at timestamptz,
 unique(fulfillment_id,component_code), check((checked_by is null) = (checked_at is null))
);
create index fulfillment_packing_actor on public.fulfillment_packing_checks(checked_by);
create table public.fulfillment_issues (
 id uuid primary key default gen_random_uuid(), fulfillment_id uuid not null references public.order_fulfillment(id) on delete restrict,
 reason text not null check(reason in ('customer_unreachable','address_issue','missing_item','damaged_order','late','delivery_failed','pickup_no_show','other')),
 status text not null default 'open' check(status in ('open','resolved')),
 opened_by uuid not null references auth.users(id) on delete restrict, opened_at timestamptz not null default now(),
 resolved_by uuid references auth.users(id) on delete restrict, resolved_at timestamptz, resolution text,
 check ((status='resolved') = (resolved_at is not null)),
 check ((status='resolved') = (resolved_by is not null)),
 check (status<>'resolved' or length(btrim(resolution)) between 1 and 500)
);
create index fulfillment_issues_queue on public.fulfillment_issues(fulfillment_id,status);
create index fulfillment_issues_opener on public.fulfillment_issues(opened_by);
create index fulfillment_issues_resolver on public.fulfillment_issues(resolved_by);
-- Append-only assignment history; only one current assignment. Reassigning closes the former row.
create table public.delivery_assignments (
 id uuid primary key default gen_random_uuid(), fulfillment_id uuid not null references public.order_fulfillment(id) on delete restrict,
 driver_user_id uuid not null references public.operator_profiles(user_id) on delete restrict,
 assigned_by uuid not null references auth.users(id) on delete restrict, assigned_at timestamptz not null default now(),
 ended_at timestamptz, reason text not null check(length(btrim(reason)) between 1 and 500)
);
create unique index delivery_assignment_current on public.delivery_assignments(fulfillment_id) where ended_at is null;
create index delivery_assignments_driver on public.delivery_assignments(driver_user_id) where ended_at is null;
create index delivery_assignments_actor on public.delivery_assignments(assigned_by);
create table public.production_adjustments (
 id uuid primary key default gen_random_uuid(), wave_id uuid not null references public.production_waves(id) on delete restrict,
 kind text not null check(kind in ('produced','waste','damaged','replacement')), quantity integer not null check(quantity > 0),
 request_id uuid not null unique, actor_user_id uuid not null references auth.users(id) on delete restrict,
 reason text not null check(length(btrim(reason)) between 1 and 500), created_at timestamptz not null default now()
);
create index production_adjustments_wave on public.production_adjustments(wave_id);
create index production_adjustments_actor on public.production_adjustments(actor_user_id);
-- No PII duplicated by default. Each explicit founder correction is a complete logistics overlay.
-- Original commercial snapshot remains immutable in orders; historical overlays remain append-only.
create table public.fulfillment_logistics_overrides (
 id uuid primary key default gen_random_uuid(), revision bigint generated always as identity unique, fulfillment_id uuid not null references public.order_fulfillment(id) on delete restrict,
 address text not null check(length(btrim(address)) between 1 and 500),
 guatemala_zone integer not null check(guatemala_zone between 1 and 25),
 instructions text check(length(instructions) <= 1000), latitude double precision, longitude double precision,
 actor_user_id uuid not null references auth.users(id) on delete restrict,
 reason text not null check(length(btrim(reason)) between 1 and 500), created_at timestamptz not null default now(),
 check((latitude is null) = (longitude is null)), check(latitude between -90 and 90), check(longitude between -180 and 180)
);
create index fulfillment_logistics_latest on public.fulfillment_logistics_overrides(fulfillment_id,revision desc);
create index fulfillment_logistics_actor on public.fulfillment_logistics_overrides(actor_user_id);
create table public.customer_order_access (
 fulfillment_id uuid primary key references public.order_fulfillment(id) on delete restrict,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null, revoked_at timestamptz,
 created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(),
 check(expires_at > created_at)
);
create index customer_order_access_creator on public.customer_order_access(created_by);

-- Default Supabase table grants MUST be removed including the service role.
-- All staff access is through explicitly whitelisted projections/RPCs; no raw staff reads.
do $$ declare t text; begin
 foreach t in array array['operator_profiles','drop_operations_config','drop_packing_components','production_waves','order_fulfillment','fulfillment_events','fulfillment_packing_checks','fulfillment_issues','delivery_assignments','production_adjustments','fulfillment_logistics_overrides','customer_order_access'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger %I before delete on public.%I for each row execute function private.prevent_transaction_delete()',t||'_no_delete',t);
 end loop;
end $$;
revoke all on sequence public.fulfillment_events_id_seq from public,anon,authenticated,service_role;
create trigger fulfillment_events_append_only before update on public.fulfillment_events for each row execute function private.prevent_transaction_delete();
create trigger production_adjustments_append_only before update on public.production_adjustments for each row execute function private.prevent_transaction_delete();
create trigger logistics_overrides_append_only before update on public.fulfillment_logistics_overrides for each row execute function private.prevent_transaction_delete();

revoke all on sequence public.fulfillment_logistics_overrides_revision_seq from public,anon,authenticated,service_role;
-- Prevent a staff account from accidentally inheriting legacy Admin RLS access.
create function private.ops_profile_separation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('deipo:profile:'||new.user_id::text,0));
 if (tg_table_name='admin_profiles' and exists(select 1 from public.operator_profiles where user_id=new.user_id))
 or (tg_table_name='operator_profiles' and exists(select 1 from public.admin_profiles where user_id=new.user_id)) then raise exception 'OPS_ADMIN_PROFILE_CONFLICT'; end if;
 return new;
end $$;
revoke all on function private.ops_profile_separation() from public,anon,authenticated,service_role;
create trigger admin_staff_separation before insert or update on public.admin_profiles for each row execute function private.ops_profile_separation();
create trigger staff_admin_separation before insert or update on public.operator_profiles for each row execute function private.ops_profile_separation();
