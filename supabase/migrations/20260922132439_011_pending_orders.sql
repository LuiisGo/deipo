create function public.create_pending_order_from_hold(p_checkout_session_hash text, p_details jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 h public.inventory_holds; d public.drops; o public.orders; s public.drop_slots; z public.drop_delivery_zones;
 v_name text:=btrim(p_details->>'name'); v_phone text:=p_details->>'phone'; v_email text:=nullif(btrim(p_details->>'email'),'');
 v_method text:=p_details->>'method'; v_slot uuid:=nullif(p_details->>'slot_id','')::uuid; v_zone uuid:=nullif(p_details->>'zone_id','')::uuid;
 v_address text:=nullif(btrim(p_details->>'address'),''); v_notes text:=nullif(btrim(p_details->>'notes'),''); v_fee bigint:=0;
begin
 if p_details is null or jsonb_typeof(p_details)<>'object' or p_details - array['name','phone','email','method','slot_id','zone_id','address','notes'] <> '{}'::jsonb then raise exception 'INVALID_INPUT'; end if;
 if v_name is null or length(v_name) not between 1 and 120 or v_phone is null or v_phone !~ '^\+[1-9][0-9]{7,14}$'
   or (v_email is not null and (length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
   or length(coalesce(v_address,''))>1000 or length(coalesce(v_notes,''))>1000 then raise exception 'INVALID_CONTACT'; end if;
 if v_method is null or v_method not in ('pickup','delivery') then raise exception 'INVALID_FULFILLMENT_METHOD'; end if;
 if v_method='pickup' and (v_zone is not null or v_address is not null or v_notes is not null) then raise exception 'INVALID_FULFILLMENT_METHOD'; end if;
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
   if row(o.customer_name,o.customer_phone,o.customer_email,o.fulfillment_method,o.slot_id,o.delivery_zone_id,o.delivery_address,o.delivery_notes)
     is distinct from row(v_name,v_phone,v_email,v_method,v_slot,v_zone,v_address,v_notes) then raise exception 'ORDER_DETAILS_CONFLICT'; end if;
   return private.checkout_payload(p_checkout_session_hash);
 end if;
 perform private.validate_online_drop(h.drop_id);
 select * into d from public.drops where id=h.drop_id;
 if (v_method='pickup' and (not d.pickup_enabled or nullif(btrim(d.pickup_label),'') is null))
   or (v_method='delivery' and not d.delivery_enabled) then raise exception 'INVALID_FULFILLMENT_METHOD'; end if;
 if v_slot is not null then
   select * into s from public.drop_slots where id=v_slot and drop_id=d.id and is_enabled for share;
   if not found then raise exception 'INVALID_SLOT'; end if;
 elsif exists(select 1 from public.drop_slots where drop_id=d.id and is_enabled) then raise exception 'INVALID_SLOT'; end if;
 -- Slot capacities remain planning metadata in Sprint 02, not a mixed-channel guarantee.
 if v_method='delivery' then
   select * into z from public.drop_delivery_zones where id=v_zone and drop_id=d.id and is_enabled for share;
   if not found then raise exception 'INVALID_DELIVERY_ZONE'; end if;
   if z.fee_minor is null then raise exception 'DELIVERY_FEE_NOT_CONFIGURED'; end if;
   if v_address is null then raise exception 'INVALID_ADDRESS'; end if;
   v_fee:=z.fee_minor;
 end if;
 if d.price_minor<=0 or d.price_minor::numeric*h.quantity+v_fee>9007199254740991 then raise exception 'INVALID_PRICE'; end if;
 insert into public.orders(hold_id,currency,subtotal_minor,delivery_fee_minor,customer_name,customer_phone,customer_email,
   fulfillment_method,fulfillment_date,slot_id,slot_start,slot_end,delivery_zone_id,delivery_zone_label,delivery_address,delivery_notes,pickup_label)
 values(h.id,d.currency,d.price_minor*h.quantity,v_fee,v_name,v_phone,v_email,v_method,d.fulfillment_date,s.id,s.starts_at,s.ends_at,
   z.id,z.label,v_address,v_notes,case when v_method='pickup' then d.pickup_label else null end) returning * into o;
 insert into public.order_items(order_id,drop_id,quantity,unit_price_minor,snapshot_name,snapshot_drop_number)
 values(o.id,d.id,h.quantity,d.price_minor,d.name,d.number);
 insert into public.order_events(order_id,event_type,actor_kind) values(o.id,'order_created','customer');
 return private.checkout_payload(p_checkout_session_hash);
end; $$;

create function private.cancel_pending_order_impl(p_order_id uuid,p_reason text,p_admin boolean) returns void
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
 if h.expires_at<=clock_timestamp() then perform private.expire_checkout_session(h.checkout_session_hash); return; end if;
 if h.status<>'active' then raise exception 'ORDER_NOT_CANCELLABLE'; end if;
 update public.orders set status='cancelled',cancelled_at=clock_timestamp(),cancel_reason=p_reason where id=o.id;
 update public.inventory_holds set status='released',released_at=clock_timestamp() where id=h.id;
 insert into public.order_events(order_id,event_type,actor_kind,actor_user_id,metadata)
 values(o.id,'order_cancelled',case when p_admin then 'admin' else 'customer' end,case when p_admin then auth.uid() else null end,jsonb_build_object('reason',p_reason));
 if p_admin then insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata)
   values(auth.uid(),'pending_order_cancelled','order',o.id,jsonb_build_object('reason',p_reason)); end if;
end; $$;
create function public.cancel_pending_order(p_checkout_session_hash text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_order uuid;
begin
 perform private.lock_checkout_session(p_checkout_session_hash);
 select o.id into v_order from public.orders o join public.inventory_holds h on h.id=o.hold_id
   where h.checkout_session_hash=p_checkout_session_hash order by h.created_at desc,h.id desc limit 1;
 if v_order is null then raise exception 'ORDER_NOT_FOUND'; end if;
 perform private.cancel_pending_order_impl(v_order,'Customer cancellation',false);
 return private.checkout_payload(p_checkout_session_hash);
end; $$;
create function public.admin_cancel_pending_order(p_order_id uuid,p_reason text) returns void language plpgsql security definer set search_path = '' as $$
begin
 if not private.is_deipo_admin(array['founder','admin']::public.admin_role[]) then raise exception 'NOT_AUTHORIZED'; end if;
 if p_reason is null or length(btrim(p_reason)) not between 1 and 500 then raise exception 'CANCEL_REASON_REQUIRED'; end if;
 perform private.cancel_pending_order_impl(p_order_id,btrim(p_reason),true);
end; $$;
-- Effective state is time-derived for admin lists and filters, without cron.
create view public.admin_order_state with (security_invoker=true) as
select o.*, h.drop_id,h.quantity,h.status as hold_status,h.expires_at,
  case when o.status='pending_payment' and h.expires_at<=now() then 'expired' else o.status end as effective_status
from public.orders o join public.inventory_holds h on h.id=o.hold_id;
revoke all on public.admin_order_state from public,anon;
grant select on public.admin_order_state to authenticated;
revoke all on function private.cancel_pending_order_impl(uuid,text,boolean) from public,anon,authenticated;
revoke all on function public.create_pending_order_from_hold(text,jsonb),public.cancel_pending_order(text),public.admin_cancel_pending_order(uuid,text) from public,anon,authenticated;
grant execute on function public.create_pending_order_from_hold(text,jsonb),public.cancel_pending_order(text) to anon,authenticated;
grant execute on function public.admin_cancel_pending_order(uuid,text) to authenticated;
