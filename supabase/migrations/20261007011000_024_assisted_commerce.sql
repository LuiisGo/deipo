-- Canonical creation is shared, never a parallel hold/order schema.
create or replace function private.create_commercial_order(p_checkout_session_hash text, p_details jsonb,p_channel text,p_creator uuid) returns jsonb
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
 if h.status='expired' or private.effective_hold_deadline(h)<=clock_timestamp() then raise exception 'HOLD_EXPIRED'; end if;
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
   fulfillment_method,fulfillment_date,slot_id,slot_start,slot_end,delivery_zone_id,delivery_zone_label,delivery_address,delivery_notes,pickup_label,delivery_latitude,delivery_longitude,sales_channel,assisted_by_user_id)
 values(h.id,d.currency,d.price_minor*h.quantity,v_fee,v_name,v_phone,v_email,v_method,d.fulfillment_date,s.id,s.starts_at,s.ends_at,
   z.id,z.label,v_address,v_notes,case when v_method='pickup' then d.pickup_label else null end,v_lat,v_lng,p_channel,p_creator) returning * into o;
 insert into public.order_items(order_id,drop_id,quantity,unit_price_minor,snapshot_name,snapshot_drop_number)
 values(o.id,d.id,h.quantity,d.price_minor,d.name,d.number);
 insert into public.order_events(order_id,event_type,actor_kind) values(o.id,'order_created','customer');
 return private.checkout_payload(p_checkout_session_hash);
end; $$;
revoke all on function private.create_commercial_order(text,jsonb,text,uuid) from public,anon,authenticated,service_role;
create or replace function private.create_pending_order_from_hold_entry(p_checkout_session_hash text,p_details jsonb) returns jsonb
language sql security definer set search_path='' as $$ select private.create_commercial_order(p_checkout_session_hash,p_details,'web',null) $$;

create table public.assisted_sale_drafts (
 id uuid primary key default gen_random_uuid(),
 drop_id uuid not null references public.drops(id) on delete restrict,
 quantity integer not null check(quantity>0),
 sales_channel text not null check(sales_channel in ('whatsapp_manual','admin_assisted')),
 created_by uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null check(expires_at>created_at),
 claim_hash text not null unique check(claim_hash ~ '^[a-f0-9]{64}$'),
 details jsonb not null check(jsonb_typeof(details)='object'),
 unit_price_minor bigint not null check(unit_price_minor>0),
 delivery_fee_minor bigint not null check(delivery_fee_minor>=0),
 claimed_at timestamptz, claimed_session_hash text check(claimed_session_hash ~ '^[a-f0-9]{64}$'),
 order_id uuid unique references public.orders(id) on delete restrict,
 check((claimed_at is null)=(order_id is null)), check((claimed_at is null)=(claimed_session_hash is null))
);
create index assisted_drafts_drop on public.assisted_sale_drafts(drop_id,created_at);
create index assisted_drafts_creator on public.assisted_sale_drafts(created_by);
alter table public.assisted_sale_drafts enable row level security;
revoke all on public.assisted_sale_drafts from public,anon,authenticated,service_role;
create trigger assisted_no_delete before delete on public.assisted_sale_drafts for each row execute function private.prevent_transaction_delete();
create function private.assisted_facts_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if to_jsonb(new)-array['claimed_at','claimed_session_hash','order_id'] is distinct from to_jsonb(old)-array['claimed_at','claimed_session_hash','order_id']
 or (old.claimed_at is not null and new is distinct from old) then raise exception 'TRANSACTION_FACTS_IMMUTABLE'; end if;
 return new;
end $$;
revoke all on function private.assisted_facts_immutable() from public,anon,authenticated,service_role;
create trigger assisted_immutable before update on public.assisted_sale_drafts for each row execute function private.assisted_facts_immutable();

create function private.sales_create_draft(p_drop uuid,p_quantity integer,p_channel text,p_details jsonb,p_hash text,p_expires timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
declare d public.drops; fee bigint:=0; draft uuid; begin
 perform private.ops_require(array['founder','admin']);
 if p_channel is null or p_channel not in ('whatsapp_manual','admin_assisted') or p_hash is null or p_hash !~ '^[a-f0-9]{64}$'
 or p_expires is null or p_expires<=clock_timestamp() or p_expires>clock_timestamp()+interval '7 days'
 or p_quantity is null or p_quantity<1 then raise exception 'INVALID_INPUT'; end if;
 perform private.validate_online_drop(p_drop);
 select * into d from public.drops where id=p_drop;
 if d.max_quantity_per_order is not null and p_quantity>d.max_quantity_per_order then raise exception 'MAX_QUANTITY_EXCEEDED'; end if;
 if p_details is null or jsonb_typeof(p_details)<>'object' or p_details-array['name','phone','email','method','slot_id','zone_id','address','notes','delivery_latitude','delivery_longitude']<>'{}' then raise exception 'INVALID_INPUT'; end if;
 if nullif(btrim(p_details->>'name'),'') is null or length(p_details->>'name')>120
 or coalesce(p_details->>'phone','') !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'INVALID_CONTACT'; end if;
 if p_details->>'method'='delivery' then
  select fee_minor into fee from public.drop_delivery_zones where id=nullif(p_details->>'zone_id','')::uuid and drop_id=d.id and is_enabled;
  if fee is null then raise exception 'INVALID_DELIVERY_ZONE'; end if;
 elsif p_details->>'method' is distinct from 'pickup' then raise exception 'INVALID_FULFILLMENT_METHOD'; end if;
 insert into public.assisted_sale_drafts(drop_id,quantity,sales_channel,created_by,expires_at,claim_hash,details,unit_price_minor,delivery_fee_minor)
 values(d.id,p_quantity,p_channel,auth.uid(),p_expires,p_hash,p_details,d.price_minor,fee) returning id into draft;
 insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'assisted_draft_created','assisted_sale_draft',draft,'{}');
 return draft;
end $$;

create function private.sales_claim(p_hash text,p_session text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.assisted_sale_drafts; d public.drops; fee bigint:=0; result jsonb; oid uuid; begin
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'CLAIM_UNAVAILABLE'; end if;
 -- Draft lock precedes canonical session/drop locks; no canonical path locks a draft.
 select * into a from public.assisted_sale_drafts where claim_hash=p_hash for update;
 if not found then raise exception 'CLAIM_UNAVAILABLE'; end if;
 perform private.lock_checkout_session(p_session);
 if a.claimed_at is not null then
  if a.claimed_session_hash<>p_session then raise exception 'CLAIM_UNAVAILABLE'; end if;
  select o.id into oid from public.orders o join public.inventory_holds h on h.id=o.hold_id where h.checkout_session_hash=p_session order by h.created_at desc,h.id desc limit 1;
  if oid is distinct from a.order_id then raise exception 'CHECKOUT_ALREADY_EXISTS'; end if;
  return private.checkout_payload(p_session);
 end if;
 if a.expires_at<=clock_timestamp() then raise exception 'CLAIM_UNAVAILABLE'; end if;
 -- A claim never replaces another checkout, even if its hold has expired.
 if exists(select 1 from public.inventory_holds where checkout_session_hash=p_session) then raise exception 'CHECKOUT_ALREADY_EXISTS'; end if;
 perform 1 from public.drops where id=a.drop_id for update;
 perform private.validate_online_drop(a.drop_id);
 select * into d from public.drops where id=a.drop_id;
 if a.details->>'method'='delivery' then
  select fee_minor into fee from public.drop_delivery_zones where id=nullif(a.details->>'zone_id','')::uuid and drop_id=d.id and is_enabled;
 end if;
 if d.price_minor<>a.unit_price_minor or fee is distinct from a.delivery_fee_minor then raise exception 'CLAIM_PRICE_CHANGED'; end if;
 perform private.create_inventory_hold_entry(a.drop_id,a.quantity,p_session);
 result:=private.create_commercial_order(p_session,a.details,a.sales_channel,a.created_by);
 -- The canonical zone read is locked; catch any fee edit racing the earlier advisory quote check.
 if (result#>>'{order,delivery_fee_minor}')::bigint<>a.delivery_fee_minor then raise exception 'CLAIM_PRICE_CHANGED'; end if;
 select o.id into oid from public.orders o join public.inventory_holds h on h.id=o.hold_id where h.checkout_session_hash=p_session;
 update public.assisted_sale_drafts set claimed_at=clock_timestamp(),claimed_session_hash=p_session,order_id=oid where id=a.id;
 return result;
end $$;

create function private.sales_desk(p_drop uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.ops_require(array['founder','admin']);
 return jsonb_build_object(
 'drop',(select jsonb_build_object('id',d.id,'number',d.number,'name',d.name,'price',d.price_minor,'pickup',d.pickup_enabled,'delivery',d.delivery_enabled,
 'grace_seconds',d.bank_transfer_grace_seconds,'tracker_seconds',d.tracker_access_seconds,
 'slots',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'start',starts_at,'end',ends_at)),'[]') from public.drop_slots where drop_id=d.id and is_enabled),
 'zones',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',label,'fee',fee_minor)),'[]') from public.drop_delivery_zones where drop_id=d.id and is_enabled)) from public.drops d where id=p_drop),
 'drafts',(select coalesce(jsonb_agg(x order by x.created_at desc),'[]') from (
 select a.id,a.created_at,a.expires_at,a.sales_channel,a.quantity,a.details->>'name' as customer,a.order_id,
 case when o.status='paid' and o.inventory_committed_at is not null then 'PAID'
 when o.status='payment_review_required' or p.resolution_status='review_required' then 'REVIEW'
 when o.status='cancelled' then 'CANCELED'
 when a.order_id is not null and (h.status='expired' or private.effective_hold_deadline(h)<=clock_timestamp()) then 'EXPIRED'
 when p.internal_status='pending' and p.payment_method_type='bank_transfer' then 'TRANSFER PENDING'
 when p.id is not null then 'AWAITING PAYMENT'
 when a.order_id is not null then 'RESERVED'
 when a.expires_at<=clock_timestamp() then 'EXPIRED' else 'DRAFT' end as status
 from public.assisted_sale_drafts a left join public.orders o on o.id=a.order_id left join public.inventory_holds h on h.id=o.hold_id
 left join lateral(select * from public.payment_attempts where order_id=o.id order by attempt_number desc limit 1) p on true
 where a.drop_id=p_drop order by a.created_at desc limit 100) x),
 'channels',(select coalesce(jsonb_agg(x),'[]') from (
 select o.sales_channel,count(*) as orders,sum(i.quantity) as units,sum(o.total_minor) as gross_order_value_minor,
 coalesce(sum(o.total_minor) filter(where o.status='paid' and o.inventory_committed_at is not null and p.resolution_status='committed'),0) as paid_revenue_minor,
 count(*) filter(where o.status='paid' and p.resolution_status='committed' and p.payment_method_type='payment') as card_paid,
 count(*) filter(where o.status='paid' and p.resolution_status='committed' and p.payment_method_type='bank_transfer') as transfer_paid
 from public.orders o join public.order_items i on i.order_id=o.id
 left join lateral(select * from public.payment_attempts where order_id=o.id order by (resolution_status='committed') desc,attempt_number desc limit 1) p on true
 where i.drop_id=p_drop group by o.sales_channel) x));
end $$;
create function private.sales_configure(p_drop uuid,p_grace integer,p_tracker integer,p_reason text) returns void
language plpgsql security definer set search_path='' as $$ begin
 perform private.ops_require(array['founder','admin']); perform private.ops_reason(p_reason);
 update public.drops set bank_transfer_grace_seconds=p_grace,tracker_access_seconds=p_tracker where id=p_drop;
 insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'commerce_policy_changed','drop',p_drop,jsonb_build_object('reason',p_reason,'grace_seconds',p_grace,'tracker_seconds',p_tracker));
end $$;

create function public.sales_create_draft(p_drop uuid,p_quantity integer,p_channel text,p_details jsonb,p_hash text,p_expires timestamptz) returns uuid language sql security invoker set search_path='' as $$ select private.sales_create_draft(p_drop,p_quantity,p_channel,p_details,p_hash,p_expires) $$;
revoke all on function private.sales_create_draft(uuid,integer,text,jsonb,text,timestamptz),public.sales_create_draft(uuid,integer,text,jsonb,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function private.sales_create_draft(uuid,integer,text,jsonb,text,timestamptz),public.sales_create_draft(uuid,integer,text,jsonb,text,timestamptz) to authenticated;

create function public.sales_claim(p_hash text,p_session text) returns jsonb language sql security invoker set search_path='' as $$ select private.sales_claim(p_hash,p_session) $$;
revoke all on function private.sales_claim(text,text),public.sales_claim(text,text) from public,anon,authenticated,service_role;
grant execute on function private.sales_claim(text,text),public.sales_claim(text,text) to service_role;

create function public.sales_desk(p_drop uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.sales_desk(p_drop) $$;
revoke all on function private.sales_desk(uuid),public.sales_desk(uuid) from public,anon,authenticated,service_role;
grant execute on function private.sales_desk(uuid),public.sales_desk(uuid) to authenticated;

create function public.sales_configure(p_drop uuid,p_grace integer,p_tracker integer,p_reason text) returns void language sql security invoker set search_path='' as $$ select private.sales_configure(p_drop,p_grace,p_tracker,p_reason) $$;
revoke all on function private.sales_configure(uuid,integer,integer,text),public.sales_configure(uuid,integer,integer,text) from public,anon,authenticated,service_role;
grant execute on function private.sales_configure(uuid,integer,integer,text),public.sales_configure(uuid,integer,integer,text) to authenticated;
