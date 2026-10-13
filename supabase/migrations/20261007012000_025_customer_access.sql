-- Encrypted delivery envelope is not a plaintext capability. Encryption key is server-only.
alter table public.customer_order_access alter column created_by drop not null,
 add column token_envelope text check(length(token_envelope) between 60 and 512),
 add column issuance_kind text not null default 'staff' check(issuance_kind in ('staff','customer_claim')),
 add constraint customer_access_actor check((issuance_kind='staff' and created_by is not null) or (issuance_kind='customer_claim' and created_by is null));
alter table public.fulfillment_events alter column actor_user_id drop not null,
 add column actor_kind text not null default 'staff' check(actor_kind in ('staff','customer_claim')),
 add constraint fulfillment_event_actor check((actor_kind='staff' and actor_user_id is not null) or (actor_kind='customer_claim' and actor_user_id is null and event_type in ('provisioned','access_rotated')));
create or replace function private.provision_committed_order(p_order_id uuid,p_customer boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.orders; i public.order_items; f uuid; begin
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
 if p_customer then insert into public.fulfillment_events(fulfillment_id,event_type,to_status,actor_kind) values(f,'provisioned','queued','customer_claim');
 else perform private.ops_event(f,'provisioned',null,'queued'); end if; return f;
end $$;
revoke all on function private.provision_committed_order(uuid,boolean) from public,anon,authenticated,service_role;
create or replace function private.ops_provision(p_order_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
begin
 perform private.ops_require(array['founder','admin','fulfillment']);
 return private.provision_committed_order(p_order_id,false);
end $$;

create function private.customer_claim_access(p_session text,p_hash text,p_envelope text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.orders; h public.inventory_holds; f uuid; a public.customer_order_access; duration integer; begin
 if p_session is null or p_session !~ '^[a-f0-9]{64}$' or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_envelope is null or length(p_envelope) not between 60 and 512 then raise exception 'INVALID_INPUT'; end if;
 select * into h from public.inventory_holds where checkout_session_hash=p_session order by created_at desc,id desc limit 1;
 select * into o from public.orders where hold_id=h.id;
 if o.id is null then raise exception 'OPS_ORDER_NOT_COMMITTED'; end if;
 select tracker_access_seconds into duration from public.drops where id=h.drop_id;
 if duration is null then raise exception 'TRACKER_NOT_CONFIGURED'; end if;
 -- Ops advisory -> order, identical to explicit staff sync. No payment/drop/hold locks acquired.
 f:=private.provision_committed_order(o.id,true);
 select * into a from public.customer_order_access where fulfillment_id=f for update;
 if found then
  if a.revoked_at is not null or a.expires_at<=clock_timestamp() or a.token_envelope is null then raise exception 'TRACKER_ACCESS_UNAVAILABLE'; end if;
  return jsonb_build_object('envelope',a.token_envelope,'hash',a.token_hash,'expires_at',a.expires_at);
 end if;
 insert into public.customer_order_access(fulfillment_id,token_hash,expires_at,token_envelope,issuance_kind)
 values(f,p_hash,clock_timestamp()+make_interval(secs=>duration),p_envelope,'customer_claim') returning * into a;
 insert into public.fulfillment_events(fulfillment_id,event_type,actor_kind) values(f,'access_rotated','customer_claim');
 return jsonb_build_object('envelope',a.token_envelope,'hash',a.token_hash,'expires_at',a.expires_at);
end $$;
create or replace function private.ops_rotate_access(p_id uuid,p_hash text,p_expires_at timestamptz) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.ops_require(array['founder','admin']); perform private.ops_lock(p_id);
 if p_expires_at is null or p_expires_at<=now() then raise exception 'OPS_INVALID_EXPIRY'; end if;
 insert into public.customer_order_access(fulfillment_id,token_hash,expires_at,created_by) values(p_id,p_hash,p_expires_at,auth.uid())
 on conflict(fulfillment_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at,revoked_at=null,created_by=auth.uid(),created_at=now(),token_envelope=null,issuance_kind='staff';
 perform private.ops_event(p_id,'access_rotated');
end $$;
create or replace function private.ops_customer_tracker(p_hash text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('order_code',o.order_code,'product',i.snapshot_name,'drop_number',i.snapshot_drop_number,'payment_state','paid','quantity',i.quantity,'status',f.status,'method',o.fulfillment_method,
 'slot_start_at',case when o.slot_start is not null then (o.fulfillment_date+o.slot_start) at time zone 'America/Guatemala' end,
 'slot_end_at',case when o.slot_end is not null then (o.fulfillment_date+o.slot_end) at time zone 'America/Guatemala' end)
 from public.customer_order_access a join public.order_fulfillment f on f.id=a.fulfillment_id join public.orders o on o.id=f.order_id join public.order_items i on i.order_id=o.id
 where p_hash ~ '^[a-f0-9]{64}$' and a.token_hash=p_hash and a.revoked_at is null and a.expires_at>clock_timestamp() and o.status='paid' and o.inventory_committed_at is not null and o.inventory_released_at is null;
$$;
create function private.sales_rotate_access(p_id uuid,p_hash text,p_envelope text,p_expires timestamptz) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_envelope is null or length(p_envelope) not between 60 and 512 then raise exception 'INVALID_INPUT'; end if;
 perform private.ops_rotate_access(p_id,p_hash,p_expires);
 update public.customer_order_access set token_envelope=p_envelope where fulfillment_id=p_id;
end $$;

create function private.sales_print(p_id uuid,p_format text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r text; result jsonb; begin
 r:=private.ops_require(array['founder','admin','fulfillment']);
 if p_format is null or p_format not in ('packing','pickup','delivery','sheet') then raise exception 'INVALID_INPUT'; end if;
 select jsonb_build_object('order_code',o.order_code,'first_name',split_part(btrim(o.customer_name),' ',1),
 'quantity',i.quantity,'product',i.snapshot_name,'method',o.fulfillment_method,'slot_start',o.slot_start,'slot_end',o.slot_end,'date',o.fulfillment_date,
 'packing',(select coalesce(jsonb_agg(jsonb_build_object('label',label,'required',required_quantity,'checked',checked_quantity)),'[]') from public.fulfillment_packing_checks where fulfillment_id=f.id),
 'access',case when a.revoked_at is null and a.expires_at>clock_timestamp() and a.token_envelope is not null then jsonb_build_object('envelope',a.token_envelope,'hash',a.token_hash) end)
 || case when p_format='delivery' and o.fulfillment_method='delivery' then jsonb_build_object('logistics',jsonb_build_object('name',o.customer_name,'phone',o.customer_phone,
 'address',coalesce(l.address,o.delivery_address),'zone',coalesce('Zona '||l.guatemala_zone::text,o.delivery_zone_label),
 'notes',case when l.id is null then o.delivery_notes else l.instructions end)) else '{}'::jsonb end
 into result from public.order_fulfillment f join public.orders o on o.id=f.order_id join public.order_items i on i.order_id=o.id
 left join public.customer_order_access a on a.fulfillment_id=f.id
 left join lateral(select * from public.fulfillment_logistics_overrides where fulfillment_id=f.id order by revision desc limit 1) l on true where f.id=p_id;
 if result is null then raise exception 'OPS_NOT_FOUND'; end if; return result;
end $$;

create function public.customer_claim_access(p_session text,p_hash text,p_envelope text) returns jsonb language sql security invoker set search_path='' as $$ select private.customer_claim_access(p_session,p_hash,p_envelope) $$;
revoke all on function private.customer_claim_access(text,text,text),public.customer_claim_access(text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.customer_claim_access(text,text,text),public.customer_claim_access(text,text,text) to service_role;

create function public.sales_rotate_access(p_id uuid,p_hash text,p_envelope text,p_expires timestamptz) returns void language sql security invoker set search_path='' as $$ select private.sales_rotate_access(p_id,p_hash,p_envelope,p_expires) $$;
revoke all on function private.sales_rotate_access(uuid,text,text,timestamptz),public.sales_rotate_access(uuid,text,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function private.sales_rotate_access(uuid,text,text,timestamptz),public.sales_rotate_access(uuid,text,text,timestamptz) to authenticated;

create function public.sales_print(p_id uuid,p_format text) returns jsonb language sql security invoker set search_path='' as $$ select private.sales_print(p_id,p_format) $$;
revoke all on function private.sales_print(uuid,text),public.sales_print(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.sales_print(uuid,text),public.sales_print(uuid,text) to authenticated;
