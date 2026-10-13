-- Sprint 04B: forward-only logistics capacity and immutable original pin.
alter table public.orders add column delivery_latitude double precision,
 add column delivery_longitude double precision,
 add constraint order_delivery_pin check (
 (delivery_latitude is null) = (delivery_longitude is null)
 and (delivery_latitude is null or (delivery_latitude between -90 and 90 and delivery_longitude between -180 and 180))
 and (fulfillment_method='delivery' or delivery_latitude is null));
-- Historical orders retain null pins. New delivery checkout requires a pair below.
-- order_facts_immutable compares all non-lifecycle columns, including these additions.
comment on column public.drop_slots.capacity is 'Maximum orders per slot; null is unconfigured/unlimited. Enforced under checkout drop lock.';
create index orders_slot_occupancy on public.orders(slot_id) where inventory_released_at is null;
create function private.slot_occupancy(p_slot uuid,p_exclude uuid default null)
returns table(orders bigint,units bigint) language sql volatile security definer set search_path='' as $$
 select count(*),coalesce(sum(h.quantity),0) from public.orders o join public.inventory_holds h on h.id=o.hold_id
 where o.slot_id=p_slot and (p_exclude is null or o.id<>p_exclude) and o.inventory_released_at is null
 and ((o.status='pending_payment' and o.inventory_committed_at is null and h.status='active' and h.expires_at>clock_timestamp())
 or (o.status='paid' and o.inventory_committed_at is not null));
$$;
create function private.slot_has_room(p_slot uuid,p_units integer,p_exclude uuid default null)
returns boolean language sql volatile security definer set search_path='' as $$
 select p_slot is null or coalesce((select (s.capacity is null or x.orders<s.capacity)
 and (s.max_units is null or x.units+p_units<=s.max_units)
 from public.drop_slots s cross join lateral private.slot_occupancy(s.id,p_exclude) x where s.id=p_slot),false);
$$;
revoke all on function private.slot_occupancy(uuid,uuid),private.slot_has_room(uuid,integer,uuid) from public,anon,authenticated,service_role;
create or replace function private.create_pending_order_from_hold_entry(p_checkout_session_hash text, p_details jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 h public.inventory_holds; d public.drops; o public.orders; s public.drop_slots; z public.drop_delivery_zones;
 v_name text:=btrim(p_details->>'name'); v_phone text:=p_details->>'phone'; v_email text:=nullif(btrim(p_details->>'email'),'');
 v_method text:=p_details->>'method'; v_slot uuid:=nullif(p_details->>'slot_id','')::uuid; v_zone uuid:=nullif(p_details->>'zone_id','')::uuid;
 v_address text:=nullif(btrim(p_details->>'address'),''); v_notes text:=nullif(btrim(p_details->>'notes'),''); v_fee bigint:=0;
 v_lat double precision:=nullif(p_details->>'delivery_latitude','')::double precision; v_lng double precision:=nullif(p_details->>'delivery_longitude','')::double precision;
begin
 if p_details is null or jsonb_typeof(p_details)<>'object' or p_details - array['name','phone','email','method','slot_id','zone_id','address','notes','delivery_latitude','delivery_longitude'] <> '{}'::jsonb then raise exception 'INVALID_INPUT'; end if;
 if v_name is null or length(v_name) not between 1 and 120 or v_phone is null or v_phone !~ '^\+[1-9][0-9]{7,14}$'
   or (v_email is not null and (length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
   or length(coalesce(v_address,''))>1000 or length(coalesce(v_notes,''))>1000 then raise exception 'INVALID_CONTACT'; end if;
 if v_method is null or v_method not in ('pickup','delivery') then raise exception 'INVALID_FULFILLMENT_METHOD'; end if;
 if v_method='pickup' and (v_zone is not null or v_address is not null or v_notes is not null) then raise exception 'INVALID_FULFILLMENT_METHOD'; end if;
 if (v_lat is null)<>(v_lng is null) or (v_lat is not null and not(v_lat between -90 and 90 and v_lng between -180 and 180)) or (v_method='pickup' and v_lat is not null) then raise exception 'INVALID_DELIVERY_PIN'; end if;
 perform private.lock_checkout_session(p_checkout_session_hash);
 select * into h from public.inventory_holds where checkout_session_hash=p_checkout_session_hash order by created_at desc,id desc limit 1;
 if not found then raise exception 'HOLD_NOT_FOUND'; end if;
 perform 1 from public.drops where id=h.drop_id for update;
 select * into h from public.inventory_holds where id=h.id for update;
 if h.status='expired' or h.expires_at<=clock_timestamp() then raise exception 'HOLD_EXPIRED'; end if;
 if h.status<>'active' then raise exception 'HOLD_NOT_FOUND'; end if;
 select * into o from public.orders where hold_id=h.id for update;
 if found then
   if o.status<>'pending_payment' or o.inventory_committed_at is not null then raise exception 'ORDER_ALREADY_EXISTS'; end if;
   if row(o.customer_name,o.customer_phone,o.customer_email,o.fulfillment_method,o.slot_id,o.delivery_zone_id,o.delivery_address,o.delivery_notes,o.delivery_latitude,o.delivery_longitude)
     is distinct from row(v_name,v_phone,v_email,v_method,v_slot,v_zone,v_address,v_notes,v_lat,v_lng) then raise exception 'ORDER_DETAILS_CONFLICT'; end if;
   return private.checkout_payload(p_checkout_session_hash);
 end if;
 if v_method='delivery' and v_lat is null then raise exception 'DELIVERY_PIN_REQUIRED'; end if;
 perform private.validate_online_drop(h.drop_id);
 select * into d from public.drops where id=h.drop_id;
 if (v_method='pickup' and (not d.pickup_enabled or nullif(btrim(d.pickup_label),'') is null))
   or (v_method='delivery' and not d.delivery_enabled) then raise exception 'INVALID_FULFILLMENT_METHOD'; end if;
 if v_slot is not null then
   select * into s from public.drop_slots where id=v_slot and drop_id=d.id and is_enabled for share;
   if not found then raise exception 'INVALID_SLOT'; end if;
 elsif exists(select 1 from public.drop_slots where drop_id=d.id and is_enabled) then raise exception 'INVALID_SLOT'; end if;
 -- Drop row lock already held, shared by pending creation and payment finalization.
 if not private.slot_has_room(v_slot,h.quantity) then raise exception 'SLOT_FULL'; end if;
 if v_method='delivery' then
   select * into z from public.drop_delivery_zones where id=v_zone and drop_id=d.id and is_enabled for share;
   if not found then raise exception 'INVALID_DELIVERY_ZONE'; end if;
   if z.fee_minor is null then raise exception 'DELIVERY_FEE_NOT_CONFIGURED'; end if;
   if v_address is null then raise exception 'INVALID_ADDRESS'; end if;
   v_fee:=z.fee_minor;
 end if;
 if d.price_minor<=0 or d.price_minor::numeric*h.quantity+v_fee>9007199254740991 then raise exception 'INVALID_PRICE'; end if;
 insert into public.orders(hold_id,currency,subtotal_minor,delivery_fee_minor,customer_name,customer_phone,customer_email,
   fulfillment_method,fulfillment_date,slot_id,slot_start,slot_end,delivery_zone_id,delivery_zone_label,delivery_address,delivery_notes,pickup_label,delivery_latitude,delivery_longitude)
 values(h.id,d.currency,d.price_minor*h.quantity,v_fee,v_name,v_phone,v_email,v_method,d.fulfillment_date,s.id,s.starts_at,s.ends_at,
   z.id,z.label,v_address,v_notes,case when v_method='pickup' then d.pickup_label else null end,v_lat,v_lng) returning * into o;
 insert into public.order_items(order_id,drop_id,quantity,unit_price_minor,snapshot_name,snapshot_drop_number)
 values(o.id,d.id,h.quantity,d.price_minor,d.name,d.number);
 insert into public.order_events(order_id,event_type,actor_kind) values(o.id,'order_created','customer');
 return private.checkout_payload(p_checkout_session_hash);
end; $$;

-- Preserve 018 finalizer; add only slot gate before its existing review/commit branch.
create or replace function private.process_payment_webhook(p_event_id uuid,p_sandbox_id text) returns text
language plpgsql security definer set search_path='' as $$
declare e public.payment_webhook_events; a public.payment_attempts; o public.orders; h public.inventory_holds;
 d jsonb; v_reason text; v_available integer; v_time timestamptz; v_status text; v_duplicate boolean:=false;
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
   then v_reason:='METADATA_MISMATCH';
 elsif o.inventory_committed_at is not null then v_reason:='POSSIBLE_DUPLICATE_PAYMENT';
 elsif o.status not in ('pending_payment','expired') or h.status not in ('active','expired') then v_reason:='ORDER_NOT_ELIGIBLE';
 end if;
 if v_reason is null then
  -- now() matches the canonical projection and is conservative if the hold
  -- expires while waiting on a lock. Conversion itself never renews the hold.
  if not (h.status='active' and h.expires_at>now()) then
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
   if h.status='active' then update public.inventory_holds set status=case when expires_at<=v_time then 'expired' else 'released' end,
    released_at=case when expires_at>v_time then v_time end where id=h.id; end if;
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

-- Advisory customer-safe availability; no other order identities or contact data.
create or replace function private.checkout_payload(p_hash text) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
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
      'slots',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'start',to_char(s.starts_at,'HH24:MI'),'end',to_char(s.ends_at,'HH24:MI'), 'available',private.slot_has_room(s.id,h.quantity,o.id)) order by s.sort_order,s.starts_at),'[]'::jsonb) from public.drop_slots s where s.drop_id=d.id and s.is_enabled),
      'zones',(select coalesce(jsonb_agg(jsonb_build_object('id',z.id,'label',z.label,'fee_minor',z.fee_minor) order by z.sort_order),'[]'::jsonb) from public.drop_delivery_zones z where z.drop_id=d.id and z.is_enabled)),
    'order',case when o.id is null then null else jsonb_build_object('code',o.order_code,
      'status',case when o.status='pending_payment' and h.expires_at<=now() then 'expired' else o.status end,
      'subtotal_minor',o.subtotal_minor,'delivery_fee_minor',o.delivery_fee_minor,'total_minor',o.total_minor,
      'fulfillment_method',o.fulfillment_method,'fulfillment_date',o.fulfillment_date,'pickup_label',o.pickup_label,
      'zone_label',o.delivery_zone_label,'slot_start',o.slot_start,'slot_end',o.slot_end) end);
end; $$;
