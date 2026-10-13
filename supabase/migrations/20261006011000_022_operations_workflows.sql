-- Sprint 04B staff identity, explicit reconciliation, pure queues and bulk workflow.
-- Legacy operators must be named by the founder before launch; this label grants nothing.
alter table public.operator_profiles add column display_name text not null default 'Pendiente de identificar'
 check(display_name=btrim(display_name) and length(display_name) between 1 and 100);
create function private.ops_save_operator(p_user_id uuid,p_role text,p_active boolean,p_name text,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.ops_require(array['founder']); perform private.ops_reason(p_reason);
 if p_name is null or p_name<>btrim(p_name) or length(p_name) not between 1 and 100 then raise exception 'OPS_INVALID_NAME'; end if;
 perform private.ops_set_operator(p_user_id,p_role,p_active,p_reason);
 update public.operator_profiles set display_name=p_name where user_id=p_user_id;
end $$;
create function private.ops_operators() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r text; begin
 r:=private.ops_require(array['founder','admin','fulfillment']);
 return (select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'display_name',display_name,'role',role,'is_active',is_active) order by display_name,user_id),'[]')
 from public.operator_profiles where r in ('founder','admin') or (role='driver' and is_active));
end $$;
create function private.ops_drops() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r text; begin
 r:=private.ops_require(array['founder','admin','kitchen','fulfillment','driver']);
 return (select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'number',d.number,'name',d.name,'date',d.fulfillment_date,'current',coalesce(c.current_drop_id=d.id,false)) order by (c.current_drop_id=d.id) desc nulls last,d.fulfillment_date desc nulls last,d.number desc),'[]')
 from public.drops d cross join public.storefront_config c
 where (r<>'driver' and (d.id=c.current_drop_id or exists(select 1 from public.orders o join public.order_items i on i.order_id=o.id where i.drop_id=d.id and o.status='paid')))
 or (r='driver' and exists(select 1 from public.order_fulfillment f join public.order_items i on i.order_id=f.order_id join public.delivery_assignments a on a.fulfillment_id=f.id where i.drop_id=d.id and a.driver_user_id=auth.uid() and a.ended_at is null and f.status not in ('completed','cancelled'))));
end $$;
create function private.ops_sync_paid_orders(p_drop_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare oid uuid; scanned integer:=0; present integer:=0; provisioned integer:=0; begin
 perform private.ops_require(array['founder','admin','fulfillment']); perform private.ops_drop_lock(p_drop_id);
 perform private.ops_require(array['founder','admin','fulfillment']);
 for oid in select o.id from public.orders o join public.order_items i on i.order_id=o.id
 where i.drop_id=p_drop_id and o.status='paid' and o.inventory_committed_at is not null and o.inventory_released_at is null
 and exists(select 1 from public.payment_attempts a where a.order_id=o.id and a.internal_status='succeeded' and a.resolution_status='committed') order by o.id loop
 scanned:=scanned+1;
 if exists(select 1 from public.order_fulfillment where order_id=oid) then present:=present+1; else
 perform private.ops_provision(oid); provisioned:=provisioned+1; end if;
 end loop;
 return jsonb_build_object('scanned',scanned,'already_present',present,'provisioned',provisioned);
end $$;
create or replace function private.ops_queue(p_drop_id uuid,p_expected_role text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r text; result jsonb; begin
 r:=private.ops_require(array['founder','admin','kitchen','fulfillment','driver']);
 if p_expected_role is not null and p_expected_role<>r then raise exception 'OPS_NOT_AUTHORIZED'; end if;
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
 'latitude',case when l.id is null then o.delivery_latitude else l.latitude end,'longitude',case when l.id is null then o.delivery_longitude else l.longitude end,'pickup_label',o.pickup_label)) else '{}'::jsonb end
 || case when r in ('founder','admin','fulfillment') then jsonb_build_object('driver_user_id',(select driver_user_id from public.delivery_assignments where fulfillment_id=f.id and ended_at is null)) else '{}'::jsonb end
 || case when r in ('founder','admin') then jsonb_build_object('order_id',o.id) else '{}'::jsonb end
 order by o.fulfillment_date,o.slot_start,f.created_at,f.id),'[]') into result
 from public.order_fulfillment f join public.orders o on o.id=f.order_id join public.order_items i on i.order_id=o.id
 left join public.production_waves w on w.id=f.wave_id
 left join lateral(select * from public.fulfillment_logistics_overrides where fulfillment_id=f.id order by revision desc limit 1) l on true
 where i.drop_id=p_drop_id and private.ops_can_access(f.id) and (r<>'driver' or (o.fulfillment_method='delivery' and f.status not in ('completed','cancelled')));
 return result;
end $$;

-- One transaction, one drop, sorted order locks then fulfillment locks. No partial bulk result.
create function private.ops_bulk_wave(p_drop_id uuid,p_wave_id uuid,p_orders jsonb,p_action text) returns integer
language plpgsql security definer set search_path='' as $$
declare item record; current_f public.order_fulfillment; n integer:=0; begin
 perform private.ops_require(array['founder','admin','kitchen']);
 if jsonb_typeof(p_orders) is distinct from 'array' or jsonb_array_length(p_orders) not between 1 and 200 or p_action not in ('assign','prep') or p_action is null then raise exception 'OPS_INVALID_BULK'; end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_orders))<>jsonb_array_length(p_orders) then raise exception 'OPS_INVALID_BULK'; end if;
 perform private.ops_drop_lock(p_drop_id);
 perform private.ops_require(array['founder','admin','kitchen']);
 if not exists(select 1 from public.production_waves where id=p_wave_id and drop_id=p_drop_id) then raise exception 'OPS_INVALID_WAVE'; end if;
 if (select count(*) from jsonb_to_recordset(p_orders) as x(id uuid,version integer) join public.order_fulfillment f on f.id=x.id join public.order_items i on i.order_id=f.order_id where i.drop_id=p_drop_id)<>jsonb_array_length(p_orders) then raise exception 'OPS_INVALID_BULK'; end if;
 for item in select f.id,x.version from jsonb_to_recordset(p_orders) as x(id uuid,version integer) join public.order_fulfillment f on f.id=x.id order by f.order_id,f.id loop
 current_f:=private.ops_lock(item.id);
 if item.version is null or item.version<>current_f.version then raise exception 'OPS_STALE_VERSION'; end if;
 if p_action='assign' then perform private.ops_assign_wave(current_f.id,p_wave_id);
 else
 if current_f.wave_id is distinct from p_wave_id then raise exception 'OPS_INVALID_WAVE'; end if;
 perform private.ops_transition(current_f.id,item.version,'in_prep'); end if;
 n:=n+1;
 end loop; return n;
end $$;
-- Versioned packing prevents a stale device from restoring checks after an override.
create function private.ops_pack_check(p_id uuid,p_version integer,p_component text,p_quantity integer) returns integer
language plpgsql security definer set search_path='' as $$
declare f public.order_fulfillment; begin
 perform private.ops_require(array['founder','admin','fulfillment']); f:=private.ops_lock(p_id);
 perform private.ops_require(array['founder','admin','fulfillment']);
 if p_version is null or f.version<>p_version then raise exception 'OPS_STALE_VERSION'; end if;
 perform private.ops_check_packing(p_id,p_component,p_quantity);
 update public.order_fulfillment set version=version+1,updated_at=now() where id=p_id returning version into p_version;
 return p_version;
end $$;
create function private.ops_issues(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.ops_require(array['founder','admin','fulfillment','driver']);
 if not private.ops_can_access(p_id) then raise exception 'OPS_NOT_AUTHORIZED'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'reason',reason,'status',status,'opened_at',opened_at,'resolution',resolution) order by opened_at,id),'[]') from public.fulfillment_issues where fulfillment_id=p_id);
end $$;
-- Identifier lookup is authenticated; neither token nor short code authorizes a mutation.
create function private.ops_lookup(p_drop_id uuid,p_code text default null,p_hash text default null) returns uuid language plpgsql stable security definer set search_path='' as $$
declare result uuid; begin
 perform private.ops_require(array['founder','admin','fulfillment']);
 select f.id into result from public.order_fulfillment f join public.orders o on o.id=f.order_id join public.order_items i on i.order_id=o.id
 where i.drop_id=p_drop_id and ((p_code is not null and o.order_code=upper(btrim(p_code))) or (p_hash ~ '^[a-f0-9]{64}$' and exists(select 1 from public.customer_order_access a where a.fulfillment_id=f.id and a.token_hash=p_hash and a.revoked_at is null and a.expires_at>now())));
 return result;
end $$;
-- Privileged functions are private. Public invoker wrappers are installed at the end.
create or replace function private.ops_role() returns text language sql volatile security definer set search_path='' as $$
 select case when private.is_deipo_admin(array['founder']::public.admin_role[]) then 'founder'
 when private.is_deipo_admin(array['admin']::public.admin_role[]) then 'admin'
 else (select role from public.operator_profiles where user_id=auth.uid() and is_active
       and not exists(select 1 from public.admin_profiles where user_id=auth.uid())) end;
$$;
create or replace function private.ops_require(p_roles text[]) returns text language plpgsql volatile security definer set search_path='' as $$
declare r text:=private.ops_role(); begin
 if r is null or not r=any(p_roles) then raise exception 'OPS_NOT_AUTHORIZED'; end if; return r;
end $$;
create or replace function private.ops_transition(p_id uuid,p_version integer,p_to text,p_reason text default null,p_sealed boolean default false,p_override boolean default false) returns integer language plpgsql security definer set search_path='' as $$
declare r text; f public.order_fulfillment; o public.orders; cutoff timestamptz; begin
 r:=private.ops_require(array['founder','admin','kitchen','fulfillment','driver']);
 if not private.ops_can_access(p_id) then raise exception 'OPS_NOT_AUTHORIZED'; end if;
 f:=private.ops_lock(p_id);
 r:=private.ops_require(array['founder','admin','kitchen','fulfillment','driver']);
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

revoke all on function private.ops_save_operator(uuid,text,boolean,text,text) from public,anon,authenticated,service_role;
grant execute on function private.ops_save_operator(uuid,text,boolean,text,text) to authenticated;
create function public.ops_save_operator(p_user_id uuid,p_role text,p_active boolean,p_name text,p_reason text) returns void language sql security invoker set search_path='' as $$ select private.ops_save_operator(p_user_id,p_role,p_active,p_name,p_reason); $$;
revoke all on function public.ops_save_operator(uuid,text,boolean,text,text) from public,anon,authenticated,service_role;
grant execute on function public.ops_save_operator(uuid,text,boolean,text,text) to authenticated;

revoke all on function private.ops_operators() from public,anon,authenticated,service_role;
grant execute on function private.ops_operators() to authenticated;
create function public.ops_operators() returns jsonb language sql security invoker set search_path='' as $$ select private.ops_operators(); $$;
revoke all on function public.ops_operators() from public,anon,authenticated,service_role;
grant execute on function public.ops_operators() to authenticated;

revoke all on function private.ops_drops() from public,anon,authenticated,service_role;
grant execute on function private.ops_drops() to authenticated;
create function public.ops_drops() returns jsonb language sql security invoker set search_path='' as $$ select private.ops_drops(); $$;
revoke all on function public.ops_drops() from public,anon,authenticated,service_role;
grant execute on function public.ops_drops() to authenticated;

revoke all on function private.ops_sync_paid_orders(uuid) from public,anon,authenticated,service_role;
grant execute on function private.ops_sync_paid_orders(uuid) to authenticated;
create function public.ops_sync_paid_orders(p_drop_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.ops_sync_paid_orders(p_drop_id); $$;
revoke all on function public.ops_sync_paid_orders(uuid) from public,anon,authenticated,service_role;
grant execute on function public.ops_sync_paid_orders(uuid) to authenticated;

revoke all on function private.ops_bulk_wave(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function private.ops_bulk_wave(uuid,uuid,jsonb,text) to authenticated;
create function public.ops_bulk_wave(p_drop_id uuid,p_wave_id uuid,p_orders jsonb,p_action text) returns integer language sql security invoker set search_path='' as $$ select private.ops_bulk_wave(p_drop_id,p_wave_id,p_orders,p_action); $$;
revoke all on function public.ops_bulk_wave(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.ops_bulk_wave(uuid,uuid,jsonb,text) to authenticated;

revoke all on function private.ops_pack_check(uuid,integer,text,integer) from public,anon,authenticated,service_role;
grant execute on function private.ops_pack_check(uuid,integer,text,integer) to authenticated;
create function public.ops_pack_check(p_id uuid,p_version integer,p_component text,p_quantity integer) returns integer language sql security invoker set search_path='' as $$ select private.ops_pack_check(p_id,p_version,p_component,p_quantity); $$;
revoke all on function public.ops_pack_check(uuid,integer,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.ops_pack_check(uuid,integer,text,integer) to authenticated;

revoke all on function private.ops_issues(uuid) from public,anon,authenticated,service_role;
grant execute on function private.ops_issues(uuid) to authenticated;
create function public.ops_issues(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.ops_issues(p_id); $$;
revoke all on function public.ops_issues(uuid) from public,anon,authenticated,service_role;
grant execute on function public.ops_issues(uuid) to authenticated;

revoke all on function private.ops_lookup(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function private.ops_lookup(uuid,text,text) to authenticated;
create function public.ops_lookup(p_drop_id uuid,p_code text default null,p_hash text default null) returns uuid language sql security invoker set search_path='' as $$ select private.ops_lookup(p_drop_id,p_code,p_hash); $$;
revoke all on function public.ops_lookup(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.ops_lookup(uuid,text,text) to authenticated;
