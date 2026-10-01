-- Unified Sandbox intent events may omit live_mode. Exact Sandbox identity is
-- mandatory; explicit LIVE remains rejected. Preserve terminal diagnostics.
-- Only replace the environment gate; no history, grants or business-data edits.
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
