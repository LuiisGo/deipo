-- Sprint 04C. Forward-only commercial attribution and effective reservation deadline.
alter table public.orders add column sales_channel text not null default 'web'
 check(sales_channel in ('web','whatsapp_manual','admin_assisted','whatsapp_api')),
 add column assisted_by_user_id uuid references auth.users(id) on delete restrict;
create index orders_sales_channel on public.orders(sales_channel,created_at);
create index orders_assisted_by on public.orders(assisted_by_user_id);
-- Existing order_facts_immutable covers both columns. No historical guessing.
alter table public.drops add column bank_transfer_grace_seconds integer
 check(bank_transfer_grace_seconds between 1 and 604800),
 add column tracker_access_seconds integer check(tracker_access_seconds between 1 and 31536000);
-- These are technical upper bounds, NOT seeded business durations.
alter table public.inventory_holds add column payment_pending_until timestamptz,
 add column payment_pending_attempt_id uuid references public.payment_attempts(id) on delete restrict,
 add constraint pending_reservation_pair check((payment_pending_until is null)=(payment_pending_attempt_id is null));
create index holds_pending_attempt on public.inventory_holds(payment_pending_attempt_id);
create function private.effective_hold_deadline(p_hold public.inventory_holds) returns timestamptz
 language sql immutable set search_path='' as $$ select greatest(p_hold.expires_at,p_hold.payment_pending_until) $$;
revoke all on function private.effective_hold_deadline(public.inventory_holds) from public,anon,authenticated,service_role;
-- View uses the same expression without a private-function grant for authenticated readers.
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
  where drop_id=d.id and status='active' and greatest(expires_at,payment_pending_until) > clock_timestamp()) h;
revoke all on public.drop_inventory from public, anon;
grant select on public.drop_inventory to authenticated;


create or replace function private.hold_facts_immutable() returns trigger language plpgsql set search_path = '' as $$
begin
 if (to_jsonb(new)-array['status','updated_at','released_at','converted_at','payment_pending_until','payment_pending_attempt_id']) is distinct from
    (to_jsonb(old)-array['status','updated_at','released_at','converted_at','payment_pending_until','payment_pending_attempt_id']) then raise exception 'TRANSACTION_FACTS_IMMUTABLE'; end if;
 if old.status<>'active' and new.status<>old.status and not (
   old.status='expired' and new.status='converted' and exists (
     select 1 from public.orders o join public.payment_attempts a on a.order_id=o.id
     where o.hold_id=new.id and o.status='paid' and o.inventory_committed_at is not null
       and a.internal_status='succeeded' and a.resolution_status='committed'
   )) then raise exception 'TRANSACTION_FACTS_IMMUTABLE'; end if;
 return new;
end; $$;

create or replace function private.expire_checkout_session(p_hash text) returns void language plpgsql security definer set search_path = '' as $$
declare h public.inventory_holds; o public.orders;
begin
  -- Caller already owns session + relevant drop locks.
  for h in select * from public.inventory_holds where checkout_session_hash=p_hash and status='active' and greatest(expires_at,payment_pending_until)<=clock_timestamp() for update loop
    update public.inventory_holds set status='expired' where id=h.id;
    update public.orders set status='expired' where hold_id=h.id and status='pending_payment' and inventory_committed_at is null returning * into o;
    if found then insert into public.order_events(order_id,event_type,actor_kind) values(o.id,'hold_expired','system'); end if;
  end loop;
end; $$;

create or replace function private.slot_occupancy(p_slot uuid,p_exclude uuid default null)
returns table(orders bigint,units bigint) language sql volatile security definer set search_path='' as $$
 select count(*),coalesce(sum(h.quantity),0) from public.orders o join public.inventory_holds h on h.id=o.hold_id
 where o.slot_id=p_slot and (p_exclude is null or o.id<>p_exclude) and o.inventory_released_at is null
 and ((o.status='pending_payment' and o.inventory_committed_at is null and h.status='active' and private.effective_hold_deadline(h)>clock_timestamp())
 or (o.status='paid' and o.inventory_committed_at is not null));
$$;

create or replace function private.checkout_payload(p_hash text) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare h public.inventory_holds; o public.orders; d public.drops; i public.order_items;
begin
  select * into h from public.inventory_holds where checkout_session_hash=p_hash order by created_at desc,id desc limit 1;
  if not found then return jsonb_build_object('state','none','server_time',clock_timestamp()); end if;
  select * into d from public.drops where id=h.drop_id;
  select * into o from public.orders where hold_id=h.id;
  select * into i from public.order_items where order_id=o.id;
  return jsonb_build_object(
    'state',case when h.status='active' and private.effective_hold_deadline(h)<=clock_timestamp() then 'expired' else h.status end,
    'server_time',clock_timestamp(),'expires_at',private.effective_hold_deadline(h),'quantity',h.quantity,
    'drop',jsonb_build_object('number',coalesce(i.snapshot_drop_number,d.number),'name',coalesce(i.snapshot_name,d.name),
      'currency',coalesce(o.currency,d.currency),'unit_price_minor',coalesce(i.unit_price_minor,d.price_minor),
      'fulfillment_date',coalesce(o.fulfillment_date,d.fulfillment_date),'pickup_enabled',d.pickup_enabled,'delivery_enabled',d.delivery_enabled,
      'pickup_label',d.pickup_label,'online_ordering_enabled',d.online_ordering_enabled,
      'slots',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'start',to_char(s.starts_at,'HH24:MI'),'end',to_char(s.ends_at,'HH24:MI'), 'available',private.slot_has_room(s.id,h.quantity,o.id)) order by s.sort_order,s.starts_at),'[]'::jsonb) from public.drop_slots s where s.drop_id=d.id and s.is_enabled),
      'zones',(select coalesce(jsonb_agg(jsonb_build_object('id',z.id,'label',z.label,'fee_minor',z.fee_minor) order by z.sort_order),'[]'::jsonb) from public.drop_delivery_zones z where z.drop_id=d.id and z.is_enabled)),
    'order',case when o.id is null then null else jsonb_build_object('code',o.order_code,
      'status',case when o.status='pending_payment' and private.effective_hold_deadline(h)<=clock_timestamp() then 'expired' else o.status end,
      'subtotal_minor',o.subtotal_minor,'delivery_fee_minor',o.delivery_fee_minor,'total_minor',o.total_minor,
      'fulfillment_method',o.fulfillment_method,'fulfillment_date',o.fulfillment_date,'pickup_label',o.pickup_label,
      'zone_label',o.delivery_zone_label,'slot_start',o.slot_start,'slot_end',o.slot_end) end);
end; $$;

create or replace function private.prepare_payment_checkout(p_session_hash text,p_sandbox_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare h public.inventory_holds; o public.orders; a public.payment_attempts; i public.order_items;
begin
 if nullif(p_sandbox_id,'') is null then raise exception 'INVALID_PAYMENT_ENVIRONMENT'; end if;
 perform private.lock_checkout_session(p_session_hash);
 select * into h from public.inventory_holds where checkout_session_hash=p_session_hash order by created_at desc,id desc limit 1;
 if not found then raise exception 'HOLD_NOT_FOUND'; end if;
 perform 1 from public.drops where id=h.drop_id for update;
 select * into h from public.inventory_holds where id=h.id for update;
 select * into o from public.orders where hold_id=h.id for update;
 if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
 if o.inventory_committed_at is not null then raise exception 'ORDER_ALREADY_PAID'; end if;
 if o.status<>'pending_payment' then raise exception 'PAYMENT_NOT_AVAILABLE'; end if;
 if h.status<>'active' or private.effective_hold_deadline(h)<=clock_timestamp() then raise exception 'HOLD_EXPIRED'; end if;
 perform private.validate_online_drop(h.drop_id);
 if o.currency<>'GTQ' then raise exception 'PAYMENT_NOT_AVAILABLE'; end if;
 select * into a from public.payment_attempts where order_id=o.id order by attempt_number desc limit 1 for update;
 if a.id is not null then
  if a.sandbox_id<>p_sandbox_id or a.environment<>'sandbox' then raise exception 'INVALID_PAYMENT_ENVIRONMENT'; end if;
  if a.internal_status='creating' and a.created_at<clock_timestamp()-interval '45 seconds' then
   update public.payment_attempts set internal_status='creation_unknown',review_reason='CREATION_OUTCOME_UNKNOWN' where id=a.id returning * into a;
  end if;
  if a.internal_status in ('creating','creation_unknown','checkout_ready','pending','succeeded') or a.resolution_status='review_required' then
   return jsonb_build_object('action','reuse','attempt',to_jsonb(a));
  end if;
 end if;
 insert into public.payment_attempts(order_id,attempt_number,amount_minor,currency,environment,sandbox_id,expires_at)
 values(o.id,coalesce(a.attempt_number,0)+1,o.total_minor,o.currency,'sandbox',p_sandbox_id,private.effective_hold_deadline(h)) returning * into a;
 select * into i from public.order_items where order_id=o.id;
 return jsonb_build_object('action','create','attempt',to_jsonb(a),'order_code',o.order_code,'sales_channel',o.sales_channel,
  'item',jsonb_build_object('name',i.snapshot_name,'quantity',i.quantity,'unit_price_minor',i.unit_price_minor),
  'delivery_fee_minor',o.delivery_fee_minor);
end; $$;

create or replace function private.customer_payment_state(p_session_hash text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare h public.inventory_holds; o public.orders; a public.payment_attempts; i public.order_items; v_state text;
begin
 if p_session_hash is null or p_session_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_SESSION'; end if;
 select * into h from public.inventory_holds where checkout_session_hash=p_session_hash order by created_at desc,id desc limit 1;
 select * into o from public.orders where hold_id=h.id;
 if o.id is null then return jsonb_build_object('status','none'); end if;
 select * into a from public.payment_attempts where order_id=o.id order by (resolution_status='committed') desc,attempt_number desc limit 1;
 v_state:=case
  when o.status='paid' and o.inventory_committed_at is not null and o.paid_at is not null and a.internal_status='succeeded' and a.resolution_status='committed' then 'paid'
  when o.status='payment_review_required' or a.resolution_status='review_required' then 'review_required'
  when a.internal_status='creation_unknown' or (a.internal_status='creating' and a.created_at<now()-interval '45 seconds') then 'creation_unknown'
  when o.status='cancelled' then 'canceled'
  when private.effective_hold_deadline(h)<=clock_timestamp() and o.inventory_committed_at is null then 'expired'
  when a.internal_status in ('failed','canceled') then a.internal_status
  when a.internal_status='pending' and a.payment_method_type='bank_transfer' then 'bank_transfer_pending'
  else 'confirming' end;
 if v_state<>'paid' then return jsonb_build_object('status',v_state,'order_code',o.order_code,'reservation_until',case when h.status='active' and private.effective_hold_deadline(h)>clock_timestamp() then private.effective_hold_deadline(h) end); end if;
 select * into i from public.order_items where order_id=o.id;
 return jsonb_build_object('status',v_state,'order_code',o.order_code,'receipt',jsonb_build_object(
  'code',o.order_code,'drop_number',i.snapshot_drop_number,'drop_name',i.snapshot_name,'quantity',i.quantity,
  'unit_price_minor',i.unit_price_minor,'subtotal_minor',o.subtotal_minor,'delivery_fee_minor',o.delivery_fee_minor,'total_minor',o.total_minor,
  'currency',o.currency,'fulfillment_method',o.fulfillment_method,'fulfillment_date',o.fulfillment_date,
  'pickup_label',o.pickup_label,'zone_label',o.delivery_zone_label,'slot_start',o.slot_start,'slot_end',o.slot_end,
  'payment_method',a.payment_method_type,'paid_at',o.paid_at,'environment',a.environment));
end; $$;

create or replace function private.process_payment_webhook(p_event_id uuid,p_sandbox_id text) returns text
language plpgsql security definer set search_path='' as $$
declare e public.payment_webhook_events; a public.payment_attempts; o public.orders; h public.inventory_holds;
 d jsonb; v_reason text; v_available integer; v_time timestamptz; v_status text; v_duplicate boolean:=false; v_grace integer; v_deadline timestamptz;
begin
 select * into e from public.payment_webhook_events where id=p_event_id for update;
 if not found then raise exception 'WEBHOOK_NOT_FOUND'; end if;
 if e.processing_status not in ('received','unmatched') then return e.processing_status; end if;
 d:=e.payload;
 if e.event_type not in ('intent.succeeded','intent.pending','intent.failed','intent.canceled') then
  update public.payment_webhook_events set processing_status='ignored',processed_at=clock_timestamp(),processing_error='NON_FULFILLMENT_EVENT' where id=e.id;return 'ignored';
 end if;
 if nullif(p_sandbox_id,'') is null or nullif(e.sandbox_id,'') is null
  or e.sandbox_id is distinct from p_sandbox_id or e.live_mode is true then
  update public.payment_webhook_events set processing_status='environment_mismatch',processing_error='ENVIRONMENT_MISMATCH',processed_at=clock_timestamp() where id=e.id;return 'environment_mismatch';
 end if;
 if d->>'event_type' is distinct from e.event_type or d->>'status' is distinct from split_part(e.event_type,'.',2)
  or nullif(e.provider_intent_id,'') is null or nullif(e.provider_checkout_id,'') is null then
  update public.payment_webhook_events set processing_status='review_required',processing_error='INVALID_EVENT_CONTRACT',processed_at=clock_timestamp() where id=e.id;return 'review_required';
 end if;
 select * into a from public.payment_attempts where provider_checkout_id=e.provider_checkout_id;
 if not found then
  update public.payment_webhook_events set processing_status='unmatched',processing_error='UNMATCHED_CHECKOUT' where id=e.id;return 'unmatched';
 end if;
 select * into o from public.orders where id=a.order_id;
 select * into h from public.inventory_holds where id=o.hold_id;
 -- Same order as Sprint 02: session -> drop -> hold -> order -> attempt.
 perform private.lock_checkout_session(h.checkout_session_hash);
 perform 1 from public.drops where id=h.drop_id for update;
 select * into h from public.inventory_holds where id=h.id for update;
 select * into o from public.orders where id=o.id for update;
 select * into a from public.payment_attempts where id=a.id for update;
 update public.payment_webhook_events set payment_attempt_id=a.id where id=e.id;
 if a.environment<>'sandbox' or a.sandbox_id is distinct from e.sandbox_id then
  update public.payment_webhook_events set processing_status='environment_mismatch',processing_error='ATTEMPT_ENVIRONMENT_MISMATCH',processed_at=clock_timestamp() where id=e.id;return 'environment_mismatch';
 end if;
 v_status:=split_part(e.event_type,'.',2);v_time:=clock_timestamp();
 -- Success is monotonic. A distinct second success on the same checkout is an
 -- operational anomaly, never another inventory allocation.
 if a.internal_status='succeeded' then
  if v_status='succeeded' and (a.provider_intent_id is distinct from e.provider_intent_id or
    (a.provider_payment_id is not null and d#>>'{payment,id}' is not null and a.provider_payment_id<>d#>>'{payment,id}')) then
   update public.payment_attempts set review_reason='POSSIBLE_DUPLICATE_PAYMENT' where id=a.id;
   update public.payment_webhook_events set processing_status='review_required',processing_error='POSSIBLE_DUPLICATE_PAYMENT',processed_at=v_time where id=e.id;
   insert into public.order_events(order_id,event_type,actor_kind,metadata) values(o.id,'payment_review_required','system',jsonb_build_object('reason','POSSIBLE_DUPLICATE_PAYMENT'));
   return 'review_required';
  end if;
  update public.payment_webhook_events set processing_status='ignored',processing_error='ALREADY_SUCCEEDED',processed_at=v_time where id=e.id;return 'ignored';
 end if;
 -- Pending cannot regress a failed/canceled attempt; a later valid success can.
 if v_status='pending' and a.internal_status in ('failed','canceled','expired') then
  update public.payment_webhook_events set processing_status='ignored',processing_error='STALE_PENDING',processed_at=v_time where id=e.id;return 'ignored';
 end if;
 -- 04C: reservation effects require exact provider correlation, including non-success events.
 if v_status<>'succeeded' and (
   e.payment_type not in ('payment','bank_transfer') or e.payment_type is null
   or jsonb_typeof(d->'amount_in_cents') is distinct from 'number'
   or d->>'amount_in_cents' !~ '^[0-9]+$'
   or (d->>'amount_in_cents')::numeric is distinct from a.amount_minor
   or a.amount_minor<>o.total_minor or d->>'currency' is distinct from o.currency or a.currency<>o.currency or a.currency<>'GTQ'
   or (d#>>'{metadata,integration}' is not null and d#>>'{metadata,integration}'<>'deipo')
   or (d#>>'{checkout,metadata,integration}' is not null and d#>>'{checkout,metadata,integration}'<>'deipo')
   or (d#>>'{metadata,integration_version}' is not null and d#>>'{metadata,integration_version}'<>'sprint-03')
   or (d#>>'{checkout,metadata,integration_version}' is not null and d#>>'{checkout,metadata,integration_version}'<>'sprint-03')
   or (d#>>'{metadata,deipo_order_code}' is not null and d#>>'{metadata,deipo_order_code}'<>o.order_code)
   or (d#>>'{metadata,deipo_payment_attempt_id}' is not null and d#>>'{metadata,deipo_payment_attempt_id}'<>a.id::text)
   or (d#>>'{checkout,metadata,deipo_order_code}' is not null and d#>>'{checkout,metadata,deipo_order_code}'<>o.order_code)
   or (d#>>'{checkout,metadata,deipo_payment_attempt_id}' is not null and d#>>'{checkout,metadata,deipo_payment_attempt_id}'<>a.id::text)
   or (a.provider_intent_id is not null and a.provider_intent_id<>e.provider_intent_id)
 ) then
  update public.payment_webhook_events set processing_status='review_required',processing_error='PENDING_CORRELATION_MISMATCH',processed_at=v_time where id=e.id;
  return 'review_required';
 end if;
 if v_status<>'succeeded' and ((d#>>'{metadata,sales_channel}' is not null and d#>>'{metadata,sales_channel}'<>o.sales_channel)
 or (d#>>'{checkout,metadata,sales_channel}' is not null and d#>>'{checkout,metadata,sales_channel}'<>o.sales_channel)) then
  update public.payment_webhook_events set processing_status='review_required',processing_error='CHANNEL_MISMATCH',processed_at=v_time where id=e.id; return 'review_required';
 end if;
 v_duplicate:=a.internal_status=v_status and a.provider_intent_id=e.provider_intent_id;
 update public.payment_attempts set internal_status=v_status,provider_intent_id=e.provider_intent_id,
  provider_payment_id=coalesce(d#>>'{payment,id}',provider_payment_id),provider_status=d->>'status',provider_raw_status=left(d->>'raw_status',200),
  payment_method_type=e.payment_type,provider_pending_at=case when v_status='pending' then coalesce(provider_pending_at,v_time) else provider_pending_at end,
  provider_succeeded_at=case when v_status='succeeded' then v_time else provider_succeeded_at end,
  provider_failed_at=case when v_status in ('failed','canceled') then v_time else provider_failed_at end,
  failure_code=case when v_status in ('failed','canceled') then 'PROVIDER_PAYMENT_FAILED' else null end,
  failure_message=case when v_status in ('failed','canceled') then 'El proveedor no confirmó el pago. Consultar Recurrente.' else null end
 where id=a.id;
 if v_status<>'succeeded' then
  -- Only the first pending observation can extend. A retry/new event cannot roll the deadline.
  if v_status='pending' and e.payment_type='bank_transfer' and a.provider_pending_at is null
    and h.status='active' and private.effective_hold_deadline(h)>v_time and o.status='pending_payment'
    and o.inventory_committed_at is null then
   select bank_transfer_grace_seconds into v_grace from public.drops where id=h.drop_id;
   if v_grace is not null then
    v_deadline:=v_time+make_interval(secs=>v_grace);
    update public.inventory_holds set payment_pending_until=v_deadline,payment_pending_attempt_id=a.id where id=h.id;
   end if;
  elsif v_status in ('failed','canceled') and h.payment_pending_attempt_id=a.id then
   update public.inventory_holds set payment_pending_until=null,payment_pending_attempt_id=null where id=h.id;
  end if;
  if not v_duplicate then insert into public.order_events(order_id,event_type,actor_kind) values(o.id,'payment_'||v_status,'system'); end if;
  update public.payment_webhook_events set processing_status='processed',processed_at=v_time where id=e.id;return 'processed';
 end if;
 if e.payment_type not in ('payment','bank_transfer') or e.payment_type is null then v_reason:='UNSUPPORTED_PAYMENT_METHOD';
 elsif jsonb_typeof(d->'amount_in_cents') is distinct from 'number' or d->>'amount_in_cents' !~ '^[0-9]+$' then v_reason:='AMOUNT_MISMATCH';
 elsif (d->>'amount_in_cents')::numeric<>a.amount_minor or a.amount_minor<>o.total_minor then v_reason:='AMOUNT_MISMATCH';
 elsif d->>'currency' is distinct from o.currency or o.currency<>a.currency or a.currency<>'GTQ' then v_reason:='CURRENCY_MISMATCH';
 elsif (d#>>'{checkout,metadata,deipo_payment_attempt_id}' is not null and d#>>'{checkout,metadata,deipo_payment_attempt_id}'<>a.id::text)
   or (d#>>'{checkout,metadata,deipo_order_code}' is not null and d#>>'{checkout,metadata,deipo_order_code}'<>o.order_code)
   or (d#>>'{metadata,deipo_payment_attempt_id}' is not null and d#>>'{metadata,deipo_payment_attempt_id}'<>a.id::text)
   or (d#>>'{metadata,deipo_order_code}' is not null and d#>>'{metadata,deipo_order_code}'<>o.order_code)
   or (d#>>'{metadata,integration}' is not null and d#>>'{metadata,integration}'<>'deipo')
   or (d#>>'{checkout,metadata,integration}' is not null and d#>>'{checkout,metadata,integration}'<>'deipo')
   or (d#>>'{metadata,integration_version}' is not null and d#>>'{metadata,integration_version}'<>'sprint-03')
   or (d#>>'{checkout,metadata,integration_version}' is not null and d#>>'{checkout,metadata,integration_version}'<>'sprint-03')
   or (d#>>'{metadata,sales_channel}' is not null and d#>>'{metadata,sales_channel}'<>o.sales_channel)
   or (d#>>'{checkout,metadata,sales_channel}' is not null and d#>>'{checkout,metadata,sales_channel}'<>o.sales_channel)
   then v_reason:='METADATA_MISMATCH';
 elsif o.inventory_committed_at is not null then v_reason:='POSSIBLE_DUPLICATE_PAYMENT';
 elsif o.status not in ('pending_payment','expired') or h.status not in ('active','expired') then v_reason:='ORDER_NOT_ELIGIBLE';
 end if;
 if v_reason is null then
  -- now() matches the canonical projection and is conservative if the hold
  -- expires while waiting on a lock. Conversion itself never renews the hold.
  if not (h.status='active' and private.effective_hold_deadline(h)>clock_timestamp()) then
   select available into v_available from public.drop_inventory where drop_id=h.drop_id;
   if v_available<h.quantity then v_reason:='PAYMENT_RECEIVED_NO_CAPACITY'; end if;
  end if;
 end if;
 if v_reason is null and not private.slot_has_room(o.slot_id,h.quantity,o.id) then
  v_reason:='PAYMENT_RECEIVED_SLOT_FULL';
 end if;
 insert into public.order_events(order_id,event_type,actor_kind) values(o.id,'payment_succeeded','system');
 if v_reason is not null then
  update public.payment_attempts set resolution_status='review_required',review_reason=v_reason where id=a.id;
  if o.inventory_committed_at is null then
   update public.orders set status='payment_review_required',cancelled_at=null where id=o.id;
   if h.status='active' then update public.inventory_holds set status=case when greatest(expires_at,payment_pending_until)<=v_time then 'expired' else 'released' end,
    released_at=case when greatest(expires_at,payment_pending_until)>v_time then v_time end where id=h.id; end if;
  end if;
  insert into public.order_events(order_id,event_type,actor_kind,metadata) values(o.id,'payment_review_required','system',jsonb_build_object('reason',v_reason));
  update public.payment_webhook_events set processing_status='review_required',processing_error=v_reason,processed_at=v_time where id=e.id;return 'review_required';
 end if;
 update public.orders set status='paid',paid_at=v_time,inventory_committed_at=v_time where id=o.id;
 update public.payment_attempts set resolution_status='committed',review_reason=null where id=a.id;
 update public.inventory_holds set status='converted',converted_at=v_time where id=h.id;
 insert into public.order_events(order_id,event_type,actor_kind) values(o.id,'payment_committed','system');
 update public.payment_webhook_events set processing_status='processed',processing_error=null,processed_at=v_time where id=e.id;
 return 'processed';
end; $$;

create or replace function private.cancel_pending_order_impl(p_order_id uuid,p_reason text,p_admin boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders; h public.inventory_holds;
begin
 select * into o from public.orders where id=p_order_id;
 if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 select * into h from public.inventory_holds where id=o.hold_id;
 perform private.lock_checkout_session(h.checkout_session_hash);
 perform 1 from public.drops where id=h.drop_id for update;
 select * into h from public.inventory_holds where id=h.id for update;
 select * into o from public.orders where id=o.id for update;
 if o.status='cancelled' then return; end if;
 if o.status<>'pending_payment' or o.inventory_committed_at is not null then raise exception 'ORDER_NOT_CANCELLABLE'; end if;
 if private.effective_hold_deadline(h)<=clock_timestamp() then perform private.expire_checkout_session(h.checkout_session_hash); return; end if;
 if h.status<>'active' then raise exception 'ORDER_NOT_CANCELLABLE'; end if;
 update public.orders set status='cancelled',cancelled_at=clock_timestamp(),cancel_reason=p_reason where id=o.id;
 update public.inventory_holds set status='released',released_at=clock_timestamp() where id=h.id;
 insert into public.order_events(order_id,event_type,actor_kind,actor_user_id,metadata)
 values(o.id,'order_cancelled',case when p_admin then 'admin' else 'customer' end,case when p_admin then auth.uid() else null end,jsonb_build_object('reason',p_reason));
 if p_admin then insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata)
   values(auth.uid(),'pending_order_cancelled','order',o.id,jsonb_build_object('reason',p_reason)); end if;
end; $$;

-- Preserve existing admin view column order and append new snapshots.
create or replace view public.admin_order_state with (security_invoker=true) as
select o.id,o.order_code,o.hold_id,o.status,o.currency,o.subtotal_minor,o.delivery_fee_minor,o.total_minor,o.customer_name,o.customer_phone,o.customer_email,o.fulfillment_method,o.fulfillment_date,o.slot_id,o.slot_start,o.slot_end,o.delivery_zone_id,o.delivery_zone_label,o.delivery_address,o.delivery_notes,o.pickup_label,o.created_at,o.updated_at,o.cancelled_at,o.cancel_reason,o.paid_at,o.inventory_committed_at,o.inventory_released_at,h.drop_id,h.quantity,h.status as hold_status,greatest(h.expires_at,h.payment_pending_until) as expires_at,
case when o.status='pending_payment' and greatest(h.expires_at,h.payment_pending_until)<=clock_timestamp() then 'expired' else o.status end as effective_status,
o.delivery_latitude,o.delivery_longitude,o.sales_channel,o.assisted_by_user_id
from public.orders o join public.inventory_holds h on h.id=o.hold_id;

-- Service endpoints use controlled functions, never direct reservation writes.
revoke insert,update,delete on public.inventory_holds from service_role;

-- Response facts remain on the existing attempt, with null historical compatibility.
alter table public.payment_attempts add column provider_payment_methods jsonb check(provider_payment_methods is null or jsonb_typeof(provider_payment_methods)='array'),
 add column provider_bank_transfer_memo text check(provider_bank_transfer_memo ~ '^[A-Z0-9]{3,32}$');

create or replace function private.save_payment_checkout(p_attempt_id uuid,p_result jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare a public.payment_attempts; v_status text:=p_result->>'status';
begin
 select * into a from public.payment_attempts where id=p_attempt_id for update;
 if not found then raise exception 'PAYMENT_NOT_AVAILABLE'; end if;
 if a.internal_status not in ('creating','creation_unknown') then return; end if;
 if v_status='checkout_ready' then
  if nullif(p_result->>'id','') is null or (p_result->>'checkout_url') !~ '^https://app[.]recurrente[.]com/checkout-session/[A-Za-z0-9_-]+$'
   then raise exception 'INVALID_PROVIDER_RESULT'; end if;
  update public.payment_attempts set internal_status='checkout_ready',provider_checkout_id=p_result->>'id',checkout_url=p_result->>'checkout_url',
   provider_payment_methods=p_result->'payment_method_types',provider_bank_transfer_memo=p_result->>'bank_transfer_memo',provider_status=p_result->>'provider_status',provider_created_at=(p_result->>'created_at')::timestamptz,review_reason=null where id=a.id;
  insert into public.order_events(order_id,event_type,actor_kind) values(a.order_id,'payment_checkout_created','system');
 elsif v_status in ('failed','creation_unknown') then
  update public.payment_attempts set internal_status=v_status,failure_code=p_result->>'code',
   review_reason=case when v_status='creation_unknown' then 'CREATION_OUTCOME_UNKNOWN' end where id=a.id;
 else raise exception 'INVALID_PROVIDER_RESULT'; end if;
end; $$;
