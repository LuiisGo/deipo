-- Service-only entrypoints. Customer identity is checked again inside SQL.
create function private.prepare_payment_checkout(p_session_hash text,p_sandbox_id text) returns jsonb
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
 if h.status<>'active' or h.expires_at<=clock_timestamp() then raise exception 'HOLD_EXPIRED'; end if;
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
 values(o.id,coalesce(a.attempt_number,0)+1,o.total_minor,o.currency,'sandbox',p_sandbox_id,h.expires_at) returning * into a;
 select * into i from public.order_items where order_id=o.id;
 return jsonb_build_object('action','create','attempt',to_jsonb(a),'order_code',o.order_code,
  'item',jsonb_build_object('name',i.snapshot_name,'quantity',i.quantity,'unit_price_minor',i.unit_price_minor),
  'delivery_fee_minor',o.delivery_fee_minor);
end; $$;

create function private.save_payment_checkout(p_attempt_id uuid,p_result jsonb) returns void
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
   provider_status=p_result->>'provider_status',provider_created_at=(p_result->>'created_at')::timestamptz,review_reason=null where id=a.id;
  insert into public.order_events(order_id,event_type,actor_kind) values(a.order_id,'payment_checkout_created','system');
 elsif v_status in ('failed','creation_unknown') then
  update public.payment_attempts set internal_status=v_status,failure_code=p_result->>'code',
   review_reason=case when v_status='creation_unknown' then 'CREATION_OUTCOME_UNKNOWN' end where id=a.id;
 else raise exception 'INVALID_PROVIDER_RESULT'; end if;
end; $$;

create function private.customer_payment_state(p_session_hash text) returns jsonb
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
  when h.expires_at<=now() and o.inventory_committed_at is null then 'expired'
  when a.internal_status in ('failed','canceled') then a.internal_status
  when a.internal_status='pending' and a.payment_method_type='bank_transfer' then 'bank_transfer_pending'
  else 'confirming' end;
 if v_state<>'paid' then return jsonb_build_object('status',v_state,'order_code',o.order_code); end if;
 select * into i from public.order_items where order_id=o.id;
 return jsonb_build_object('status',v_state,'order_code',o.order_code,'receipt',jsonb_build_object(
  'code',o.order_code,'drop_number',i.snapshot_drop_number,'drop_name',i.snapshot_name,'quantity',i.quantity,
  'unit_price_minor',i.unit_price_minor,'subtotal_minor',o.subtotal_minor,'delivery_fee_minor',o.delivery_fee_minor,'total_minor',o.total_minor,
  'currency',o.currency,'fulfillment_method',o.fulfillment_method,'fulfillment_date',o.fulfillment_date,
  'pickup_label',o.pickup_label,'zone_label',o.delivery_zone_label,'slot_start',o.slot_start,'slot_end',o.slot_end,
  'payment_method',a.payment_method_type,'paid_at',o.paid_at,'environment',a.environment));
end; $$;

create function public.prepare_payment_checkout(p_session_hash text,p_sandbox_id text) returns jsonb language sql security invoker set search_path='' as $$select private.prepare_payment_checkout(p_session_hash,p_sandbox_id)$$;
create function public.save_payment_checkout(p_attempt_id uuid,p_result jsonb) returns void language sql security invoker set search_path='' as $$select private.save_payment_checkout(p_attempt_id,p_result)$$;
create function public.customer_payment_state(p_session_hash text) returns jsonb language sql security invoker set search_path='' as $$select private.customer_payment_state(p_session_hash)$$;
revoke all on function private.prepare_payment_checkout(text,text),private.save_payment_checkout(uuid,jsonb),private.customer_payment_state(text),public.prepare_payment_checkout(text,text),public.save_payment_checkout(uuid,jsonb),public.customer_payment_state(text) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.prepare_payment_checkout(text,text),private.save_payment_checkout(uuid,jsonb),private.customer_payment_state(text),public.prepare_payment_checkout(text,text),public.save_payment_checkout(uuid,jsonb),public.customer_payment_state(text) to service_role;
