-- Point-in-time operational closeout. This never closes ordering or changes payment/inventory.
create table public.drop_operations_closeouts (
 drop_id uuid primary key references public.drops(id) on delete restrict,
 closed_at timestamptz not null default clock_timestamp(),
 closed_by uuid not null references auth.users(id) on delete restrict,
 report jsonb not null check(jsonb_typeof(report)='object')
);
create index operations_closeouts_actor on public.drop_operations_closeouts(closed_by);
alter table public.drop_operations_closeouts enable row level security;
revoke all on public.drop_operations_closeouts from public,anon,authenticated,service_role;
create trigger closeouts_immutable before update or delete on public.drop_operations_closeouts for each row execute function private.prevent_transaction_delete();

create function private.ops_drop_report(p_drop uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; begin
 perform private.ops_require(array['founder']);
 -- One statement snapshot: financial facts cannot change halfway through aggregation.
 with rows as (
  select o.*,i.quantity,f.id as fulfillment_id,f.status as ops_status,f.completed_at,
   a.payment_method_type,a.internal_status,a.resolution_status,a.amount_minor,
   (select min(created_at) from public.fulfillment_events where fulfillment_id=f.id and to_status='in_prep') as prep_at,
   (select min(created_at) from public.fulfillment_events where fulfillment_id=f.id and to_status='packed') as packed_at,
   (select min(created_at) from public.fulfillment_events where fulfillment_id=f.id and to_status='ready') as ready_at
  from public.orders o join public.order_items i on i.order_id=o.id
  left join public.order_fulfillment f on f.order_id=o.id
  left join lateral(select * from public.payment_attempts where order_id=o.id
   order by (internal_status='succeeded') desc,attempt_number desc limit 1) a on true
  where i.drop_id=p_drop
 ), totals as (
 select count(*) as orders,coalesce(sum(quantity),0) as units,
  coalesce(sum(total_minor),0) as gross_order_value_minor,
  coalesce(sum(amount_minor) filter(where internal_status='succeeded'),0) as verified_paid_amount_minor,
  coalesce(sum(amount_minor) filter(where internal_status='succeeded' and resolution_status='committed'),0) as committed_paid_amount_minor,
  count(*) filter(where ops_status='completed') as completed,
  count(*) filter(where ops_status='cancelled') as operational_cancelled,
  count(*) filter(where status='cancelled') as commercial_cancelled,
  count(*) filter(where status='payment_review_required' or resolution_status='review_required') as review_required,
  count(*) filter(where status='paid' and inventory_committed_at is not null and fulfillment_id is null) as paid_without_fulfillment,
  count(*) filter(where ops_status not in ('completed','cancelled')) as operational_unresolved,
  count(*) filter(where fulfillment_method='pickup') as pickup,
  count(*) filter(where fulfillment_method='delivery') as delivery,
  count(*) filter(where completed_at>(fulfillment_date+slot_end) at time zone 'America/Guatemala') as completed_late,
  count(*) filter(where completed_at is not null and slot_end is not null) as timing_sample_count,
  avg(extract(epoch from packed_at-prep_at)) filter(where packed_at>=prep_at) as avg_prep_seconds,
  avg(extract(epoch from ready_at-packed_at)) filter(where ready_at>=packed_at) as avg_packing_to_ready_seconds,
  avg(extract(epoch from completed_at-ready_at)) filter(where completed_at>=ready_at) as avg_ready_to_completion_seconds
 from rows
 ) select jsonb_build_object(
  'as_of',clock_timestamp(),'drop',jsonb_build_object('id',d.id,'number',d.number,'name',d.name,'capacity',d.capacity,'currency',d.currency),
  'sold_units',v.total_sold,'sold_out_percent',round(100.0*v.total_sold/d.capacity,2),
  'totals',(select to_jsonb(t) from totals t),
  'payment_methods',(select coalesce(jsonb_agg(x),'[]') from (select coalesce(payment_method_type,'unconfirmed') as method,count(*) as orders,coalesce(sum(amount_minor) filter(where internal_status='succeeded'),0) as verified_paid_minor from rows group by payment_method_type) x),
  'sales_channels',(select coalesce(jsonb_agg(x),'[]') from (select sales_channel,count(*) as orders,sum(quantity) as units,sum(total_minor) as gross_minor from rows group by sales_channel) x),
  'slots',(select coalesce(jsonb_agg(x order by x.starts_at),'[]') from (select s.starts_at,s.ends_at,s.capacity as max_orders,s.max_units,count(r.id) as orders,coalesce(sum(r.quantity),0) as units from public.drop_slots s left join rows r on r.slot_id=s.id where s.drop_id=p_drop group by s.id) x),
  'issues',(select jsonb_build_object('open',count(*) filter(where x.status='open'),'resolved',count(*) filter(where x.status='resolved'),'pickup_no_show',count(*) filter(where reason='pickup_no_show'),'delivery_failure',count(*) filter(where reason='delivery_failed')) from public.fulfillment_issues x join rows r on r.fulfillment_id=x.fulfillment_id),
  'production',(select jsonb_build_object('produced',coalesce(sum(quantity) filter(where kind='produced'),0),'waste',coalesce(sum(quantity) filter(where kind='waste'),0),'damaged',coalesce(sum(quantity) filter(where kind='damaged'),0),'replacement',coalesce(sum(quantity) filter(where kind='replacement'),0)) from public.production_adjustments a join public.production_waves w on w.id=a.wave_id where w.drop_id=p_drop),
  'timing_note','Recorded timestamps only; synthetic rehearsal does not validate an on-time SLA.'
 ) into result from public.drops d join public.drop_inventory v on v.drop_id=d.id where d.id=p_drop;
 if result is null then raise exception 'OPS_NOT_FOUND'; end if;
 return result;
end $$;

create function private.ops_close_report(p_drop uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare saved public.drop_operations_closeouts; begin
 perform private.ops_require(array['founder']); perform private.ops_drop_lock(p_drop);
 perform private.ops_require(array['founder']);
 select * into saved from public.drop_operations_closeouts where drop_id=p_drop;
 if not found then
  insert into public.drop_operations_closeouts(drop_id,closed_by,report)
   values(p_drop,auth.uid(),private.ops_drop_report(p_drop)) returning * into saved;
  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata)
   values(auth.uid(),'operations_report_finalized','drop',p_drop,'{}');
 end if;
 return jsonb_build_object('closed_at',saved.closed_at,'report',saved.report);
end $$;

create function private.ops_release_readiness(p_drop uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; begin
 perform private.ops_require(array['founder']);
 select jsonb_build_object('drop_id',d.id,'retention_days',d.assisted_draft_retention_days,
  'tracker_seconds',d.tracker_access_seconds,'bank_grace_seconds',d.bank_transfer_grace_seconds,
  'closed_report',(select jsonb_build_object('closed_at',c.closed_at,'report',c.report) from public.drop_operations_closeouts c where c.drop_id=d.id),
  'checks',jsonb_build_object(
   'current_drop',exists(select 1 from public.storefront_config where current_drop_id=d.id),
   'published',d.lifecycle_status='published','capacity',d.capacity>0,
   'quantity_policy',d.max_quantity_per_order is not null,
   'price',d.price_minor>0,'product_content',nullif(btrim(d.description),'') is not null and exists(select 1 from public.drop_items where drop_id=d.id),
   'orders_open_at',d.orders_open_at is not null,'orders_close_at',d.orders_close_at is not null,
   'fulfillment_date',d.fulfillment_date is not null,
   'cancellation_cutoff',exists(select 1 from public.drop_operations_config where drop_id=d.id and cancellation_cutoff_at is not null),
   'pickup_delivery',d.pickup_enabled and d.delivery_enabled and nullif(btrim(d.pickup_label),'') is not null,
   'three_slots',(select count(*)=3 from public.drop_slots where drop_id=d.id and is_enabled),
   'slot_capacities',exists(select 1 from public.drop_slots where drop_id=d.id and is_enabled) and not exists(select 1 from public.drop_slots where drop_id=d.id and is_enabled and capacity is null),
   'zones_fees',exists(select 1 from public.drop_delivery_zones where drop_id=d.id and is_enabled) and not exists(select 1 from public.drop_delivery_zones where drop_id=d.id and is_enabled and fee_minor is null),
   'packing',exists(select 1 from public.drop_packing_components where drop_id=d.id),
   'lead_times',exists(select 1 from public.drop_operations_config where drop_id=d.id and prep_lead_minutes is not null and delivery_lead_minutes is not null),
   'tracker_duration',d.tracker_access_seconds is not null,'draft_retention',d.assisted_draft_retention_days is not null,
   'staff_roles',(select count(distinct role)=3 from public.operator_profiles where is_active and display_name<>'Pendiente de identificar')
  )) into result from public.drops d where d.id=p_drop;
 if result is null then raise exception 'OPS_NOT_FOUND'; end if; return result;
end $$;

create function public.ops_drop_report(p_drop uuid) returns jsonb language sql security invoker set search_path='' as $$select private.ops_drop_report(p_drop)$$;
create function public.ops_close_report(p_drop uuid) returns jsonb language sql security invoker set search_path='' as $$select private.ops_close_report(p_drop)$$;
create function public.ops_release_readiness(p_drop uuid) returns jsonb language sql security invoker set search_path='' as $$select private.ops_release_readiness(p_drop)$$;
revoke all on function private.ops_drop_report(uuid),public.ops_drop_report(uuid),private.ops_close_report(uuid),public.ops_close_report(uuid),private.ops_release_readiness(uuid),public.ops_release_readiness(uuid) from public,anon,authenticated,service_role;
grant execute on function private.ops_drop_report(uuid),public.ops_drop_report(uuid),private.ops_close_report(uuid),public.ops_close_report(uuid),private.ops_release_readiness(uuid),public.ops_release_readiness(uuid) to authenticated;
