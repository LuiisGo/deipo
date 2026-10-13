-- Privileged functions are private. Public invoker wrappers are installed at the end.
create function private.ops_role() returns text language sql stable security definer set search_path='' as $$
 select case when private.is_deipo_admin(array['founder']::public.admin_role[]) then 'founder'
 when private.is_deipo_admin(array['admin']::public.admin_role[]) then 'admin'
 else (select role from public.operator_profiles where user_id=auth.uid() and is_active
       and not exists(select 1 from public.admin_profiles where user_id=auth.uid())) end;
$$;
create function private.ops_require(p_roles text[]) returns text language plpgsql stable security definer set search_path='' as $$
declare r text:=private.ops_role(); begin
 if r is null or not r=any(p_roles) then raise exception 'OPS_NOT_AUTHORIZED'; end if; return r;
end $$;
create function private.ops_reason(p_reason text) returns void language plpgsql set search_path='' as $$
begin if p_reason is null or length(btrim(p_reason)) not between 1 and 500 then raise exception 'OPS_REASON_REQUIRED'; end if; end $$;
-- Operations never acquire payment inbox/session/drop/hold locks. The order lock serializes
-- with payment finalization. All operations for a drop first take this operations-only lock.
create function private.ops_drop_lock(p_drop_id uuid) returns void language sql set search_path='' as $$
 select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('deipo:ops:'||p_drop_id::text,0));
$$;
create function private.ops_lock(p_id uuid) returns public.order_fulfillment language plpgsql security definer set search_path='' as $$
declare f public.order_fulfillment; o public.orders; d uuid; begin
 select i.drop_id into d from public.order_fulfillment ful join public.order_items i on i.order_id=ful.order_id where ful.id=p_id;
 if d is null then raise exception 'OPS_NOT_FOUND'; end if;
 perform private.ops_drop_lock(d);
 select ord.* into o from public.orders ord join public.order_fulfillment ful on ful.order_id=ord.id where ful.id=p_id for update of ord;
 select * into f from public.order_fulfillment where id=p_id for update;
 if o.status<>'paid' or o.inventory_committed_at is null or o.inventory_released_at is not null or not exists(
  select 1 from public.payment_attempts where order_id=o.id and resolution_status='committed' and internal_status='succeeded'
 ) then raise exception 'OPS_ORDER_NOT_COMMITTED'; end if;
 return f;
end $$;
create function private.ops_can_access(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.ops_role() in ('founder','admin','kitchen','fulfillment') or (private.ops_role()='driver' and exists(
 select 1 from public.delivery_assignments where fulfillment_id=p_id and driver_user_id=auth.uid() and ended_at is null)),false);
$$;
create function private.ops_event(p_id uuid,p_type text,p_from text default null,p_to text default null,p_reason text default null,p_metadata jsonb default '{}') returns void language sql security definer set search_path='' as $$
 insert into public.fulfillment_events(fulfillment_id,event_type,from_status,to_status,actor_user_id,reason,metadata)
 values(p_id,p_type,p_from,p_to,auth.uid(),p_reason,p_metadata);
$$;
create function private.ops_set_operator(p_user_id uuid,p_role text,p_active boolean,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.ops_require(array['founder','admin']); perform private.ops_reason(p_reason);
 if exists(select 1 from public.admin_profiles where user_id=p_user_id) then raise exception 'OPS_ADMIN_PROFILE_CONFLICT'; end if;
 insert into public.operator_profiles(user_id,role,is_active,invited_by) values(p_user_id,p_role,p_active,auth.uid())
 on conflict(user_id) do update set role=excluded.role,is_active=excluded.is_active,updated_at=now();
 insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),'ops_staff_access','operator_profile',p_user_id,jsonb_build_object('role',p_role,'active',p_active,'reason',p_reason));
end $$;
create function private.ops_configure_drop(p_drop_id uuid,p_config jsonb,p_components jsonb,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare previous_config jsonb; begin
 perform private.ops_require(array['founder','admin']); perform private.ops_reason(p_reason); perform private.ops_drop_lock(p_drop_id);
 if jsonb_typeof(p_config) is distinct from 'object' or jsonb_typeof(p_components) is distinct from 'array' or jsonb_array_length(p_components)=0 then raise exception 'OPS_INVALID_CONFIG'; end if;
 -- Configure once before prep. Already queued orders receive the same checklist atomically.
 if exists(select 1 from public.order_fulfillment f join public.order_items i on i.order_id=f.order_id where i.drop_id=p_drop_id and f.status<>'queued')
 or exists(select 1 from public.drop_packing_components where drop_id=p_drop_id) then raise exception 'OPS_PACKING_PLAN_LOCKED'; end if;
 select to_jsonb(c) into previous_config from public.drop_operations_config c where drop_id=p_drop_id;
 insert into public.drop_operations_config(drop_id,cancellation_cutoff_at,prep_lead_minutes,delivery_lead_minutes,pickup_grace_minutes,updated_by)
 values(p_drop_id,(p_config->>'cancellation_cutoff_at')::timestamptz,(p_config->>'prep_lead_minutes')::integer,
 (p_config->>'delivery_lead_minutes')::integer,coalesce((p_config->>'pickup_grace_minutes')::integer,30),auth.uid())
 on conflict(drop_id) do update set cancellation_cutoff_at=excluded.cancellation_cutoff_at,prep_lead_minutes=excluded.prep_lead_minutes,
 delivery_lead_minutes=excluded.delivery_lead_minutes,pickup_grace_minutes=excluded.pickup_grace_minutes,updated_by=auth.uid(),updated_at=now();
 insert into public.drop_packing_components(drop_id,code,label,units_per_item)
 select p_drop_id,x.code,x.label,x.units_per_item from jsonb_to_recordset(p_components) as x(code text,label text,units_per_item integer);
 insert into public.fulfillment_packing_checks(fulfillment_id,component_code,label,required_quantity)
 select f.id,c.code,c.label,c.units_per_item*i.quantity from public.order_fulfillment f join public.order_items i on i.order_id=f.order_id join public.drop_packing_components c on c.drop_id=i.drop_id where i.drop_id=p_drop_id;
 insert into public.fulfillment_events(fulfillment_id,event_type,actor_user_id) select f.id,'packing_plan_set',auth.uid() from public.order_fulfillment f join public.order_items i on i.order_id=f.order_id where i.drop_id=p_drop_id;
 insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),'ops_drop_configured','drop',p_drop_id,jsonb_build_object('reason',p_reason,'previous_config',previous_config,'config',p_config,'components',p_components));
end $$;
create function private.ops_provision(p_order_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.orders; i public.order_items; f uuid; begin
 perform private.ops_require(array['founder','admin','fulfillment']);
 select * into i from public.order_items where order_id=p_order_id;
 if not found then raise exception 'OPS_ORDER_NOT_COMMITTED'; end if;
 perform private.ops_drop_lock(i.drop_id);
 select * into o from public.orders where id=p_order_id for update;
 if o.status<>'paid' or o.inventory_committed_at is null or o.inventory_released_at is not null or not exists(
 select 1 from public.payment_attempts where order_id=o.id and resolution_status='committed' and internal_status='succeeded') then raise exception 'OPS_ORDER_NOT_COMMITTED'; end if;
 select id into f from public.order_fulfillment where order_id=o.id;
 if f is not null then return f; end if;
 insert into public.order_fulfillment(order_id) values(o.id) returning id into f;
 insert into public.fulfillment_packing_checks(fulfillment_id,component_code,label,required_quantity)
 select f,code,label,units_per_item*i.quantity from public.drop_packing_components where drop_id=i.drop_id;
 perform private.ops_event(f,'provisioned',null,'queued'); return f;
end $$;
create function private.ops_transition(p_id uuid,p_version integer,p_to text,p_reason text default null,p_sealed boolean default false,p_override boolean default false) returns integer language plpgsql security definer set search_path='' as $$
declare r text; f public.order_fulfillment; o public.orders; cutoff timestamptz; begin
 r:=private.ops_require(array['founder','admin','kitchen','fulfillment','driver']);
 if not private.ops_can_access(p_id) then raise exception 'OPS_NOT_AUTHORIZED'; end if;
 f:=private.ops_lock(p_id);
 -- Recheck assignment after waiting on the operations lock.
 if not private.ops_can_access(p_id) then raise exception 'OPS_NOT_AUTHORIZED'; end if;
 if p_version is null or f.version<>p_version then raise exception 'OPS_STALE_VERSION'; end if;
 select * into o from public.orders where id=f.order_id;
 if p_to is null or p_override is null or p_sealed is null or f.status in ('completed','cancelled') then raise exception 'OPS_INVALID_TRANSITION'; end if;
 if p_override then
  perform private.ops_require(array['founder','admin']); perform private.ops_reason(p_reason);
  if p_to not in ('queued','in_prep','cancelled') or p_to=f.status then raise exception 'OPS_INVALID_OVERRIDE'; end if;
 else
  if not ((f.status='queued' and p_to='in_prep') or (f.status='in_prep' and p_to='packed') or
    (f.status='packed' and p_to='ready') or (f.status='ready' and p_to=case when o.fulfillment_method='pickup' then 'completed' else 'out_for_delivery' end) or
    (f.status='out_for_delivery' and p_to='completed') or p_to='cancelled') then raise exception 'OPS_INVALID_TRANSITION'; end if;
 end if;
 if r='kitchen' and not(f.status='queued' and p_to='in_prep') then raise exception 'OPS_NOT_AUTHORIZED'; end if;
 if r='fulfillment' and p_to not in ('packed','ready','out_for_delivery','completed') then raise exception 'OPS_NOT_AUTHORIZED'; end if;
 if r='driver' and not((f.status='ready' and p_to='out_for_delivery') or (f.status='out_for_delivery' and p_to='completed')) then raise exception 'OPS_NOT_AUTHORIZED'; end if;
 if p_to='cancelled' then
  perform private.ops_require(array['founder','admin']); perform private.ops_reason(p_reason);
  select c.cancellation_cutoff_at into cutoff from public.drop_operations_config c join public.order_items i on i.drop_id=c.drop_id where i.order_id=o.id;
  if not p_override and (cutoff is null or now()>cutoff) then raise exception 'OPS_CANCELLATION_OVERRIDE_REQUIRED'; end if;
 end if;
 if p_to='in_prep' and not exists(select 1 from public.production_waves where id=f.wave_id and started_at is not null and completed_at is null) then raise exception 'OPS_ACTIVE_WAVE_REQUIRED'; end if;
 if p_to='packed' and (not p_sealed or not exists(select 1 from public.fulfillment_packing_checks where fulfillment_id=f.id)
 or exists(select 1 from public.fulfillment_packing_checks where fulfillment_id=f.id and (checked_quantity<>required_quantity or checked_at is null))) then raise exception 'OPS_PACKING_INCOMPLETE'; end if;
 if p_to='out_for_delivery' and (o.fulfillment_method<>'delivery' or not exists(
 select 1 from public.delivery_assignments a join public.operator_profiles p on p.user_id=a.driver_user_id
 where a.fulfillment_id=f.id and a.ended_at is null and p.is_active and p.role='driver')) then raise exception 'OPS_ACTIVE_DRIVER_REQUIRED'; end if;
 update public.order_fulfillment set status=p_to,version=version+1,updated_at=now(),
 sealed_at=case when p_to in ('queued','in_prep') then null when p_to='packed' then now() else sealed_at end,
 sealed_by=case when p_to in ('queued','in_prep') then null when p_to='packed' then auth.uid() else sealed_by end,
 completed_at=case when p_to='completed' then now() end,cancelled_at=case when p_to='cancelled' then now() end where id=f.id;
 if p_override and p_to in ('queued','in_prep') then
 update public.fulfillment_packing_checks set checked_quantity=0,checked_by=null,checked_at=null where fulfillment_id=f.id;
 end if;
 perform private.ops_event(f.id,case when p_override then 'state_override' else 'transition' end,f.status,p_to,p_reason,jsonb_build_object('version',f.version+1));
 return f.version+1;
end $$;
create function private.ops_check_packing(p_id uuid,p_component text,p_quantity integer) returns void language plpgsql security definer set search_path='' as $$
declare f public.order_fulfillment; begin
 perform private.ops_require(array['founder','admin','fulfillment']); f:=private.ops_lock(p_id);
 if f.status<>'in_prep' then raise exception 'OPS_INVALID_TRANSITION'; end if;
 update public.fulfillment_packing_checks set checked_quantity=p_quantity,checked_by=auth.uid(),checked_at=now() where fulfillment_id=p_id and component_code=p_component;
 if not found then raise exception 'OPS_COMPONENT_NOT_FOUND'; end if;
 perform private.ops_event(p_id,'packing_checked',null,null,null,jsonb_build_object('component',p_component,'quantity',p_quantity));
end $$;
create function private.ops_create_wave(p_drop_id uuid,p_sequence integer,p_units integer,p_target timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare w uuid; begin
 perform private.ops_require(array['founder','admin','kitchen']); perform private.ops_drop_lock(p_drop_id);
 insert into public.production_waves(drop_id,sequence,planned_units,target_ready_at,created_by) values(p_drop_id,p_sequence,p_units,p_target,auth.uid()) returning id into w;
 insert into public.audit_log(actor_user_id,action,entity_type,entity_id) values(auth.uid(),'ops_wave_created','wave',w); return w;
end $$;
create function private.ops_wave_action(p_wave_id uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
declare w public.production_waves; begin
 perform private.ops_require(array['founder','admin','kitchen']);
 select * into w from public.production_waves where id=p_wave_id; if not found then raise exception 'OPS_NOT_FOUND'; end if;
 perform private.ops_drop_lock(w.drop_id); select * into w from public.production_waves where id=p_wave_id for update;
 if p_action='start' and w.started_at is null then update public.production_waves set started_at=now() where id=w.id;
 elsif p_action='complete' and w.started_at is not null and w.completed_at is null and not exists(
 select 1 from public.order_fulfillment where wave_id=w.id and status in ('queued','in_prep')) then update public.production_waves set completed_at=now() where id=w.id;
 else raise exception 'OPS_INVALID_WAVE_ACTION'; end if;
 insert into public.audit_log(actor_user_id,action,entity_type,entity_id) values(auth.uid(),'ops_wave_'||p_action,'wave',w.id);
end $$;
create function private.ops_assign_wave(p_id uuid,p_wave_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare f public.order_fulfillment; w public.production_waves; d uuid; q integer; assigned bigint; begin
 perform private.ops_require(array['founder','admin','kitchen']); f:=private.ops_lock(p_id);
 if f.status<>'queued' then raise exception 'OPS_INVALID_TRANSITION'; end if;
 select drop_id,quantity into d,q from public.order_items where order_id=f.order_id;
 select * into w from public.production_waves where id=p_wave_id;
 if w.id is null or w.drop_id<>d or w.completed_at is not null then raise exception 'OPS_INVALID_WAVE'; end if;
 select coalesce(sum(i.quantity),0) into assigned from public.order_fulfillment assigned_f join public.order_items i on i.order_id=assigned_f.order_id where assigned_f.wave_id=w.id and assigned_f.id<>p_id and assigned_f.status<>'cancelled';
 if assigned+q>w.planned_units then raise exception 'OPS_WAVE_CAPACITY'; end if;
 if f.wave_id is not distinct from p_wave_id then return; end if;
 update public.order_fulfillment set wave_id=p_wave_id,version=version+1,updated_at=now() where id=p_id;
 perform private.ops_event(p_id,'wave_assigned',null,null,null,jsonb_build_object('old_wave',f.wave_id,'wave',p_wave_id));
end $$;
create function private.ops_record_production(p_wave_id uuid,p_kind text,p_quantity integer,p_request_id uuid,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare w public.production_waves; a public.production_adjustments; n uuid; begin
 perform private.ops_require(array['founder','admin','kitchen']); perform private.ops_reason(p_reason);
 select * into w from public.production_waves where id=p_wave_id; if not found then raise exception 'OPS_NOT_FOUND'; end if;
 perform private.ops_drop_lock(w.drop_id);
 select * into a from public.production_adjustments where request_id=p_request_id;
 if found then
  if a.wave_id<>p_wave_id or a.kind<>p_kind or a.quantity<>p_quantity or a.reason<>p_reason or a.actor_user_id<>auth.uid() then raise exception 'OPS_REQUEST_CONFLICT'; end if;
  return a.id;
 end if;
 select * into w from public.production_waves where id=p_wave_id;
 if w.started_at is null or w.completed_at is not null then raise exception 'OPS_INVALID_WAVE_ACTION'; end if;
 insert into public.production_adjustments(wave_id,kind,quantity,request_id,actor_user_id,reason) values(p_wave_id,p_kind,p_quantity,p_request_id,auth.uid(),p_reason) returning id into n; return n;
end $$;
create function private.ops_assign_driver(p_id uuid,p_driver uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare f public.order_fulfillment; begin
 perform private.ops_require(array['founder','admin','fulfillment']); perform private.ops_reason(p_reason); f:=private.ops_lock(p_id);
 if f.status in ('completed','cancelled') or not exists(select 1 from public.orders where id=f.order_id and fulfillment_method='delivery') then raise exception 'OPS_DELIVERY_REQUIRED'; end if;
 if not exists(select 1 from public.operator_profiles where user_id=p_driver and role='driver' and is_active) then raise exception 'OPS_ACTIVE_DRIVER_REQUIRED'; end if;
 if exists(select 1 from public.delivery_assignments where fulfillment_id=p_id and driver_user_id=p_driver and ended_at is null) then return; end if;
 update public.delivery_assignments set ended_at=now() where fulfillment_id=p_id and ended_at is null;
 insert into public.delivery_assignments(fulfillment_id,driver_user_id,assigned_by,reason) values(p_id,p_driver,auth.uid(),p_reason);
 perform private.ops_event(p_id,'driver_assigned',null,null,p_reason,jsonb_build_object('driver',p_driver));
end $$;
create function private.ops_open_issue(p_id uuid,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare f public.order_fulfillment; n uuid; o public.orders; grace integer; begin
 perform private.ops_require(array['founder','admin','fulfillment','driver']);
 if not private.ops_can_access(p_id) then raise exception 'OPS_NOT_AUTHORIZED'; end if;
 f:=private.ops_lock(p_id);
 if not private.ops_can_access(p_id) then raise exception 'OPS_NOT_AUTHORIZED'; end if;
 if p_reason='pickup_no_show' then
  select * into o from public.orders where id=f.order_id;
  select coalesce(c.pickup_grace_minutes,30) into grace from public.order_items i left join public.drop_operations_config c on c.drop_id=i.drop_id where i.order_id=o.id;
  if o.fulfillment_method<>'pickup' or o.slot_end is null or f.status in ('completed','cancelled') or now()<((o.fulfillment_date+o.slot_end) at time zone 'America/Guatemala')+make_interval(mins=>grace) then raise exception 'OPS_NO_SHOW_NOT_DUE'; end if;
 end if;
 insert into public.fulfillment_issues(fulfillment_id,reason,opened_by) values(p_id,p_reason,auth.uid()) returning id into n;
 perform private.ops_event(p_id,'issue_opened',null,null,null,jsonb_build_object('issue',n,'reason',p_reason)); return n;
end $$;
create function private.ops_resolve_issue(p_issue_id uuid,p_resolution text) returns void language plpgsql security definer set search_path='' as $$
declare i public.fulfillment_issues; begin
 perform private.ops_require(array['founder','admin','fulfillment','driver']); perform private.ops_reason(p_resolution);
 select * into i from public.fulfillment_issues where id=p_issue_id;
 if i.id is null or not private.ops_can_access(i.fulfillment_id) then raise exception 'OPS_NOT_AUTHORIZED'; end if;
 perform private.ops_lock(i.fulfillment_id);
 if not private.ops_can_access(i.fulfillment_id) then raise exception 'OPS_NOT_AUTHORIZED'; end if;
 update public.fulfillment_issues set status='resolved',resolved_by=auth.uid(),resolved_at=now(),resolution=p_resolution where id=i.id and status='open';
 if found then perform private.ops_event(i.fulfillment_id,'issue_resolved',null,null,null,jsonb_build_object('issue',i.id)); end if;
end $$;
create function private.ops_override_logistics(p_id uuid,p_logistics jsonb,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare f public.order_fulfillment; n uuid; begin
 perform private.ops_require(array['founder','admin']); perform private.ops_reason(p_reason); f:=private.ops_lock(p_id);
 if f.status in ('completed','cancelled') or not exists(select 1 from public.orders where id=f.order_id and fulfillment_method='delivery') then raise exception 'OPS_DELIVERY_REQUIRED'; end if;
 insert into public.fulfillment_logistics_overrides(fulfillment_id,address,guatemala_zone,instructions,latitude,longitude,actor_user_id,reason)
 values(p_id,p_logistics->>'address',(p_logistics->>'guatemala_zone')::integer,p_logistics->>'instructions',
 (p_logistics->>'latitude')::double precision,(p_logistics->>'longitude')::double precision,auth.uid(),p_reason) returning id into n;
 perform private.ops_event(p_id,'logistics_override',null,null,null,jsonb_build_object('override',n)); return n;
end $$;
create function private.ops_rotate_access(p_id uuid,p_hash text,p_expires_at timestamptz) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.ops_require(array['founder','admin']); perform private.ops_lock(p_id);
 if p_expires_at is null or p_expires_at<=now() then raise exception 'OPS_INVALID_EXPIRY'; end if;
 insert into public.customer_order_access(fulfillment_id,token_hash,expires_at,created_by) values(p_id,p_hash,p_expires_at,auth.uid())
 on conflict(fulfillment_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at,revoked_at=null,created_by=auth.uid(),created_at=now();
 perform private.ops_event(p_id,'access_rotated');
end $$;
create function private.ops_revoke_access(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin perform private.ops_require(array['founder','admin']); perform private.ops_lock(p_id);
 update public.customer_order_access set revoked_at=now() where fulfillment_id=p_id and revoked_at is null;
 if found then perform private.ops_event(p_id,'access_revoked'); end if;
end $$;
create function private.ops_update_schedule(p_drop_id uuid,p_cutoff timestamptz,p_prep_minutes integer,p_delivery_minutes integer,p_grace_minutes integer,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.ops_require(array['founder','admin']); perform private.ops_reason(p_reason); perform private.ops_drop_lock(p_drop_id);
 insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),'ops_schedule_updated','drop',p_drop_id,jsonb_build_object('reason',p_reason,
 'previous',(select to_jsonb(c)-array['updated_by','updated_at'] from public.drop_operations_config c where drop_id=p_drop_id),
 'cutoff',p_cutoff,'prep_minutes',p_prep_minutes,'delivery_minutes',p_delivery_minutes,'grace_minutes',p_grace_minutes));
 insert into public.drop_operations_config(drop_id,cancellation_cutoff_at,prep_lead_minutes,delivery_lead_minutes,pickup_grace_minutes,updated_by)
 values(p_drop_id,p_cutoff,p_prep_minutes,p_delivery_minutes,p_grace_minutes,auth.uid()) on conflict(drop_id) do update
 set cancellation_cutoff_at=p_cutoff,prep_lead_minutes=p_prep_minutes,delivery_lead_minutes=p_delivery_minutes,pickup_grace_minutes=p_grace_minutes,updated_by=auth.uid(),updated_at=now();
end $$;
-- Explicit projections: never serialize orders, attempts, event metadata or an override row to staff.
create function private.ops_queue(p_drop_id uuid,p_expected_role text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r text; oid uuid; result jsonb; begin
 r:=private.ops_require(array['founder','admin','kitchen','fulfillment','driver']);
 if p_expected_role is not null and p_expected_role<>r then raise exception 'OPS_NOT_AUTHORIZED'; end if;
 if r in ('founder','admin','fulfillment') then
  perform private.ops_drop_lock(p_drop_id);
  for oid in select o.id from public.orders o join public.order_items i on i.order_id=o.id
   where i.drop_id=p_drop_id and o.status='paid' and o.inventory_committed_at is not null and o.inventory_released_at is null
   and exists(select 1 from public.payment_attempts a where a.order_id=o.id and a.internal_status='succeeded' and a.resolution_status='committed') order by o.id
  loop perform private.ops_provision(oid); end loop;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
 'id',f.id,'version',f.version,'order_code',o.order_code,'product',i.snapshot_name,'quantity',i.quantity,'status',f.status,
 'method',o.fulfillment_method,'wave_id',f.wave_id,'wave_sequence',w.sequence,'target_ready_at',w.target_ready_at,
 'slot_start_at',case when o.slot_start is not null then (o.fulfillment_date+o.slot_start) at time zone 'America/Guatemala' end,
 'slot_end_at',case when o.slot_end is not null then (o.fulfillment_date+o.slot_end) at time zone 'America/Guatemala' end,
 'open_issues',(select count(*) from public.fulfillment_issues x where x.fulfillment_id=f.id and x.status='open'),
 'packing',(select coalesce(jsonb_agg(jsonb_build_object('code',c.component_code,'label',c.label,'required',c.required_quantity,'checked',c.checked_quantity) order by c.component_code),'[]') from public.fulfillment_packing_checks c where c.fulfillment_id=f.id)
 ) || case when r in ('founder','admin','fulfillment','driver') then jsonb_build_object('logistics',jsonb_build_object(
 'name',o.customer_name,'phone',o.customer_phone,'address',coalesce(l.address,o.delivery_address),
 'zone',coalesce('Zona '||l.guatemala_zone::text,o.delivery_zone_label),'instructions',case when l.id is null then o.delivery_notes else l.instructions end,
 'latitude',l.latitude,'longitude',l.longitude,'pickup_label',o.pickup_label)) else '{}'::jsonb end
 || case when r in ('founder','admin') then jsonb_build_object('order_id',o.id) else '{}'::jsonb end
 order by o.fulfillment_date,o.slot_start,f.created_at,f.id),'[]') into result
 from public.order_fulfillment f join public.orders o on o.id=f.order_id join public.order_items i on i.order_id=o.id
 left join public.production_waves w on w.id=f.wave_id
 left join lateral(select * from public.fulfillment_logistics_overrides where fulfillment_id=f.id order by revision desc limit 1) l on true
 where i.drop_id=p_drop_id and private.ops_can_access(f.id);
 return result;
end $$;
create function private.ops_waves(p_drop_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.ops_require(array['founder','admin','kitchen','fulfillment']);
 return (select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'sequence',w.sequence,'planned_units',w.planned_units,
 'target_ready_at',w.target_ready_at,'planned_start_at',w.target_ready_at-make_interval(mins=>c.prep_lead_minutes),
 'started_at',w.started_at,'completed_at',w.completed_at,
 'counts',(select jsonb_build_object('produced',coalesce(sum(quantity) filter(where kind='produced'),0),
 'waste',coalesce(sum(quantity) filter(where kind='waste'),0),'damaged',coalesce(sum(quantity) filter(where kind='damaged'),0),
 'replacement',coalesce(sum(quantity) filter(where kind='replacement'),0)) from public.production_adjustments where wave_id=w.id)) order by w.sequence),'[]')
 from public.production_waves w left join public.drop_operations_config c on c.drop_id=w.drop_id where w.drop_id=p_drop_id);
end $$;
create function private.ops_timeline(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.ops_require(array['founder','admin','fulfillment']);
 return jsonb_build_object('events',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'type',event_type,'from',from_status,'to',to_status,'actor',actor_user_id,'at',created_at,'reason',reason,'metadata',metadata) order by id),'[]') from public.fulfillment_events where fulfillment_id=p_id),
 'issues',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'reason',reason,'status',status,'opened_at',opened_at,'resolved_at',resolved_at,'resolution',resolution) order by opened_at,id),'[]') from public.fulfillment_issues where fulfillment_id=p_id));
end $$;
create function private.ops_command_center() returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.drops; q jsonb; inv public.drop_inventory; metrics jsonb; begin
 perform private.ops_require(array['founder']);
 select dr.* into d from public.drops dr join public.storefront_config c on c.current_drop_id=dr.id;
 if d.id is null then return jsonb_build_object('drop',null,'queue','[]'::jsonb,'waves','[]'::jsonb,'metrics',null); end if;
 q:=private.ops_queue(d.id);
 select * into inv from public.drop_inventory where drop_id=d.id;
 select jsonb_build_object('sold_units',inv.total_sold,'capacity',d.capacity,
 'paid_orders',(select count(*) from public.orders o join public.order_items i on i.order_id=o.id where i.drop_id=d.id and o.status='paid' and o.inventory_committed_at is not null and o.inventory_released_at is null),
 'queued',count(*) filter(where x->>'status'='queued'),'in_prep',count(*) filter(where x->>'status'='in_prep'),
 'packed',count(*) filter(where x->>'status'='packed'),'ready',count(*) filter(where x->>'status'='ready'),
 'out_for_delivery',count(*) filter(where x->>'status'='out_for_delivery'),'completed',count(*) filter(where x->>'status'='completed'),
 'cancelled',count(*) filter(where x->>'status'='cancelled'),
 'open_issues',coalesce(sum((x->>'open_issues')::integer),0),
 'late',count(*) filter(where x->>'status' not in ('completed','cancelled') and (x->>'slot_end_at')::timestamptz<now())) into metrics from jsonb_array_elements(q) x;
 return jsonb_build_object('drop',jsonb_build_object('id',d.id,'number',d.number,'name',d.name),'metrics',metrics,'queue',q,'waves',private.ops_waves(d.id));
end $$;
-- Server-only tracker lookup: possession grants ONLY this whitelist. No auth/user impersonation.
create function private.ops_customer_tracker(p_hash text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('order_code',o.order_code,'product',i.snapshot_name,'quantity',i.quantity,'status',f.status,'method',o.fulfillment_method,
 'slot_start_at',case when o.slot_start is not null then (o.fulfillment_date+o.slot_start) at time zone 'America/Guatemala' end,
 'slot_end_at',case when o.slot_end is not null then (o.fulfillment_date+o.slot_end) at time zone 'America/Guatemala' end)
 from public.customer_order_access a join public.order_fulfillment f on f.id=a.fulfillment_id join public.orders o on o.id=f.order_id join public.order_items i on i.order_id=o.id
 where p_hash ~ '^[a-f0-9]{64}$' and a.token_hash=p_hash and a.revoked_at is null and a.expires_at>now();
$$;

-- Revoke PostgreSQL implicit PUBLIC execute on EVERY new helper before exposing wrappers.
revoke all on function private.ops_role() from public,anon,authenticated,service_role;
revoke all on function private.ops_require(text[]) from public,anon,authenticated,service_role;
revoke all on function private.ops_reason(text) from public,anon,authenticated,service_role;
revoke all on function private.ops_drop_lock(uuid) from public,anon,authenticated,service_role;
revoke all on function private.ops_lock(uuid) from public,anon,authenticated,service_role;
revoke all on function private.ops_can_access(uuid) from public,anon,authenticated,service_role;
revoke all on function private.ops_event(uuid,text,text,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.ops_set_operator(uuid,text,boolean,text) from public,anon,authenticated,service_role;
create function public.ops_set_operator(p_user_id uuid,p_role text,p_active boolean,p_reason text) returns void language sql security invoker set search_path='' as $$ select private.ops_set_operator(p_user_id,p_role,p_active,p_reason); $$;
revoke all on function public.ops_set_operator(uuid,text,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.ops_set_operator(uuid,text,boolean,text), private.ops_set_operator(uuid,text,boolean,text) to authenticated;
revoke all on function private.ops_configure_drop(uuid,jsonb,jsonb,text) from public,anon,authenticated,service_role;
create function public.ops_configure_drop(p_drop_id uuid,p_config jsonb,p_components jsonb,p_reason text) returns void language sql security invoker set search_path='' as $$ select private.ops_configure_drop(p_drop_id,p_config,p_components,p_reason); $$;
revoke all on function public.ops_configure_drop(uuid,jsonb,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.ops_configure_drop(uuid,jsonb,jsonb,text), private.ops_configure_drop(uuid,jsonb,jsonb,text) to authenticated;
revoke all on function private.ops_provision(uuid) from public,anon,authenticated,service_role;
create function public.ops_provision(p_order_id uuid) returns uuid language sql security invoker set search_path='' as $$ select private.ops_provision(p_order_id); $$;
revoke all on function public.ops_provision(uuid) from public,anon,authenticated,service_role;
grant execute on function public.ops_provision(uuid), private.ops_provision(uuid) to authenticated;
revoke all on function private.ops_transition(uuid,integer,text,text,boolean,boolean) from public,anon,authenticated,service_role;
create function public.ops_transition(p_id uuid,p_version integer,p_to text,p_reason text default null,p_sealed boolean default false,p_override boolean default false) returns integer language sql security invoker set search_path='' as $$ select private.ops_transition(p_id,p_version,p_to,p_reason,p_sealed,p_override); $$;
revoke all on function public.ops_transition(uuid,integer,text,text,boolean,boolean) from public,anon,authenticated,service_role;
grant execute on function public.ops_transition(uuid,integer,text,text,boolean,boolean), private.ops_transition(uuid,integer,text,text,boolean,boolean) to authenticated;
revoke all on function private.ops_check_packing(uuid,text,integer) from public,anon,authenticated,service_role;
create function public.ops_check_packing(p_id uuid,p_component text,p_quantity integer) returns void language sql security invoker set search_path='' as $$ select private.ops_check_packing(p_id,p_component,p_quantity); $$;
revoke all on function public.ops_check_packing(uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.ops_check_packing(uuid,text,integer), private.ops_check_packing(uuid,text,integer) to authenticated;
revoke all on function private.ops_create_wave(uuid,integer,integer,timestamptz) from public,anon,authenticated,service_role;
create function public.ops_create_wave(p_drop_id uuid,p_sequence integer,p_units integer,p_target timestamptz) returns uuid language sql security invoker set search_path='' as $$ select private.ops_create_wave(p_drop_id,p_sequence,p_units,p_target); $$;
revoke all on function public.ops_create_wave(uuid,integer,integer,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.ops_create_wave(uuid,integer,integer,timestamptz), private.ops_create_wave(uuid,integer,integer,timestamptz) to authenticated;
revoke all on function private.ops_wave_action(uuid,text) from public,anon,authenticated,service_role;
create function public.ops_wave_action(p_wave_id uuid,p_action text) returns void language sql security invoker set search_path='' as $$ select private.ops_wave_action(p_wave_id,p_action); $$;
revoke all on function public.ops_wave_action(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.ops_wave_action(uuid,text), private.ops_wave_action(uuid,text) to authenticated;
revoke all on function private.ops_assign_wave(uuid,uuid) from public,anon,authenticated,service_role;
create function public.ops_assign_wave(p_id uuid,p_wave_id uuid) returns void language sql security invoker set search_path='' as $$ select private.ops_assign_wave(p_id,p_wave_id); $$;
revoke all on function public.ops_assign_wave(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.ops_assign_wave(uuid,uuid), private.ops_assign_wave(uuid,uuid) to authenticated;
revoke all on function private.ops_record_production(uuid,text,integer,uuid,text) from public,anon,authenticated,service_role;
create function public.ops_record_production(p_wave_id uuid,p_kind text,p_quantity integer,p_request_id uuid,p_reason text) returns uuid language sql security invoker set search_path='' as $$ select private.ops_record_production(p_wave_id,p_kind,p_quantity,p_request_id,p_reason); $$;
revoke all on function public.ops_record_production(uuid,text,integer,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.ops_record_production(uuid,text,integer,uuid,text), private.ops_record_production(uuid,text,integer,uuid,text) to authenticated;
revoke all on function private.ops_assign_driver(uuid,uuid,text) from public,anon,authenticated,service_role;
create function public.ops_assign_driver(p_id uuid,p_driver uuid,p_reason text) returns void language sql security invoker set search_path='' as $$ select private.ops_assign_driver(p_id,p_driver,p_reason); $$;
revoke all on function public.ops_assign_driver(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.ops_assign_driver(uuid,uuid,text), private.ops_assign_driver(uuid,uuid,text) to authenticated;
revoke all on function private.ops_open_issue(uuid,text) from public,anon,authenticated,service_role;
create function public.ops_open_issue(p_id uuid,p_reason text) returns uuid language sql security invoker set search_path='' as $$ select private.ops_open_issue(p_id,p_reason); $$;
revoke all on function public.ops_open_issue(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.ops_open_issue(uuid,text), private.ops_open_issue(uuid,text) to authenticated;
revoke all on function private.ops_resolve_issue(uuid,text) from public,anon,authenticated,service_role;
create function public.ops_resolve_issue(p_issue_id uuid,p_resolution text) returns void language sql security invoker set search_path='' as $$ select private.ops_resolve_issue(p_issue_id,p_resolution); $$;
revoke all on function public.ops_resolve_issue(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.ops_resolve_issue(uuid,text), private.ops_resolve_issue(uuid,text) to authenticated;
revoke all on function private.ops_override_logistics(uuid,jsonb,text) from public,anon,authenticated,service_role;
create function public.ops_override_logistics(p_id uuid,p_logistics jsonb,p_reason text) returns uuid language sql security invoker set search_path='' as $$ select private.ops_override_logistics(p_id,p_logistics,p_reason); $$;
revoke all on function public.ops_override_logistics(uuid,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.ops_override_logistics(uuid,jsonb,text), private.ops_override_logistics(uuid,jsonb,text) to authenticated;
revoke all on function private.ops_rotate_access(uuid,text,timestamptz) from public,anon,authenticated,service_role;
create function public.ops_rotate_access(p_id uuid,p_hash text,p_expires_at timestamptz) returns void language sql security invoker set search_path='' as $$ select private.ops_rotate_access(p_id,p_hash,p_expires_at); $$;
revoke all on function public.ops_rotate_access(uuid,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.ops_rotate_access(uuid,text,timestamptz), private.ops_rotate_access(uuid,text,timestamptz) to authenticated;
revoke all on function private.ops_revoke_access(uuid) from public,anon,authenticated,service_role;
create function public.ops_revoke_access(p_id uuid) returns void language sql security invoker set search_path='' as $$ select private.ops_revoke_access(p_id); $$;
revoke all on function public.ops_revoke_access(uuid) from public,anon,authenticated,service_role;
grant execute on function public.ops_revoke_access(uuid), private.ops_revoke_access(uuid) to authenticated;
revoke all on function private.ops_update_schedule(uuid,timestamptz,integer,integer,integer,text) from public,anon,authenticated,service_role;
create function public.ops_update_schedule(p_drop_id uuid,p_cutoff timestamptz,p_prep_minutes integer,p_delivery_minutes integer,p_grace_minutes integer,p_reason text) returns void language sql security invoker set search_path='' as $$ select private.ops_update_schedule(p_drop_id,p_cutoff,p_prep_minutes,p_delivery_minutes,p_grace_minutes,p_reason); $$;
revoke all on function public.ops_update_schedule(uuid,timestamptz,integer,integer,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.ops_update_schedule(uuid,timestamptz,integer,integer,integer,text), private.ops_update_schedule(uuid,timestamptz,integer,integer,integer,text) to authenticated;
revoke all on function private.ops_queue(uuid,text) from public,anon,authenticated,service_role;
create function public.ops_queue(p_drop_id uuid,p_expected_role text default null) returns jsonb language sql security invoker set search_path='' as $$ select private.ops_queue(p_drop_id,p_expected_role); $$;
revoke all on function public.ops_queue(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.ops_queue(uuid,text), private.ops_queue(uuid,text) to authenticated;
revoke all on function private.ops_waves(uuid) from public,anon,authenticated,service_role;
create function public.ops_waves(p_drop_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.ops_waves(p_drop_id); $$;
revoke all on function public.ops_waves(uuid) from public,anon,authenticated,service_role;
grant execute on function public.ops_waves(uuid), private.ops_waves(uuid) to authenticated;
revoke all on function private.ops_timeline(uuid) from public,anon,authenticated,service_role;
create function public.ops_timeline(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.ops_timeline(p_id); $$;
revoke all on function public.ops_timeline(uuid) from public,anon,authenticated,service_role;
grant execute on function public.ops_timeline(uuid), private.ops_timeline(uuid) to authenticated;
revoke all on function private.ops_command_center() from public,anon,authenticated,service_role;
create function public.ops_command_center() returns jsonb language sql security invoker set search_path='' as $$ select private.ops_command_center(); $$;
revoke all on function public.ops_command_center() from public,anon,authenticated,service_role;
grant execute on function public.ops_command_center(), private.ops_command_center() to authenticated;
revoke all on function private.ops_customer_tracker(text) from public,anon,authenticated,service_role;
create function public.ops_customer_tracker(p_hash text) returns jsonb language sql security invoker set search_path='' as $$ select private.ops_customer_tracker(p_hash); $$;
revoke all on function public.ops_customer_tracker(text) from public,anon,authenticated,service_role;
grant execute on function public.ops_customer_tracker(text), private.ops_customer_tracker(text) to service_role;
grant usage on schema private to service_role;
create function private.ops_current_role() returns text language sql stable security definer set search_path='' as $$ select private.ops_role(); $$;
revoke all on function private.ops_current_role() from public,anon,authenticated,service_role;
create function public.ops_current_role() returns text language sql stable security invoker set search_path='' as $$ select private.ops_current_role(); $$;
revoke all on function public.ops_current_role() from public,anon,authenticated,service_role;
grant execute on function public.ops_current_role(), private.ops_current_role() to authenticated;
