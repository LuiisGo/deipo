-- Follow the hardened Sprint 01 boundary: public invoker wrappers, private privileged implementations.
alter function public.create_inventory_hold(uuid,integer,text) rename to create_inventory_hold_entry;
alter function public.create_inventory_hold_entry(uuid,integer,text) set schema private;
revoke all on function private.create_inventory_hold_entry(uuid,integer,text) from public,anon,authenticated;
grant execute on function private.create_inventory_hold_entry(uuid,integer,text) to anon,authenticated;
create function public.create_inventory_hold(p_drop_id uuid,p_quantity integer,p_checkout_session_hash text) returns jsonb language sql security invoker set search_path = '' as $$
  select private.create_inventory_hold_entry(p_drop_id,p_quantity,p_checkout_session_hash);
$$;
revoke all on function public.create_inventory_hold(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.create_inventory_hold(uuid,integer,text) to anon,authenticated;
alter function public.get_checkout_state(text) rename to get_checkout_state_entry;
alter function public.get_checkout_state_entry(text) set schema private;
revoke all on function private.get_checkout_state_entry(text) from public,anon,authenticated;
grant execute on function private.get_checkout_state_entry(text) to anon,authenticated;
create function public.get_checkout_state(p_checkout_session_hash text) returns jsonb language sql security invoker set search_path = '' as $$
  select private.get_checkout_state_entry(p_checkout_session_hash);
$$;
revoke all on function public.get_checkout_state(text) from public,anon,authenticated;
grant execute on function public.get_checkout_state(text) to anon,authenticated;
alter function public.release_inventory_hold(text) rename to release_inventory_hold_entry;
alter function public.release_inventory_hold_entry(text) set schema private;
revoke all on function private.release_inventory_hold_entry(text) from public,anon,authenticated;
grant execute on function private.release_inventory_hold_entry(text) to anon,authenticated;
create function public.release_inventory_hold(p_checkout_session_hash text) returns jsonb language sql security invoker set search_path = '' as $$
  select private.release_inventory_hold_entry(p_checkout_session_hash);
$$;
revoke all on function public.release_inventory_hold(text) from public,anon,authenticated;
grant execute on function public.release_inventory_hold(text) to anon,authenticated;
alter function public.create_pending_order_from_hold(text,jsonb) rename to create_pending_order_from_hold_entry;
alter function public.create_pending_order_from_hold_entry(text,jsonb) set schema private;
revoke all on function private.create_pending_order_from_hold_entry(text,jsonb) from public,anon,authenticated;
grant execute on function private.create_pending_order_from_hold_entry(text,jsonb) to anon,authenticated;
create function public.create_pending_order_from_hold(p_checkout_session_hash text,p_details jsonb) returns jsonb language sql security invoker set search_path = '' as $$
  select private.create_pending_order_from_hold_entry(p_checkout_session_hash,p_details);
$$;
revoke all on function public.create_pending_order_from_hold(text,jsonb) from public,anon,authenticated;
grant execute on function public.create_pending_order_from_hold(text,jsonb) to anon,authenticated;
alter function public.cancel_pending_order(text) rename to cancel_pending_order_entry;
alter function public.cancel_pending_order_entry(text) set schema private;
revoke all on function private.cancel_pending_order_entry(text) from public,anon,authenticated;
grant execute on function private.cancel_pending_order_entry(text) to anon,authenticated;
create function public.cancel_pending_order(p_checkout_session_hash text) returns jsonb language sql security invoker set search_path = '' as $$
  select private.cancel_pending_order_entry(p_checkout_session_hash);
$$;
revoke all on function public.cancel_pending_order(text) from public,anon,authenticated;
grant execute on function public.cancel_pending_order(text) to anon,authenticated;
alter function public.admin_cancel_pending_order(uuid,text) rename to admin_cancel_pending_order_entry;
alter function public.admin_cancel_pending_order_entry(uuid,text) set schema private;
revoke all on function private.admin_cancel_pending_order_entry(uuid,text) from public,anon,authenticated;
grant execute on function private.admin_cancel_pending_order_entry(uuid,text) to authenticated;
create function public.admin_cancel_pending_order(p_order_id uuid,p_reason text) returns void language sql security invoker set search_path = '' as $$
  select private.admin_cancel_pending_order_entry(p_order_id,p_reason);
$$;
revoke all on function public.admin_cancel_pending_order(uuid,text) from public,anon,authenticated;
grant execute on function public.admin_cancel_pending_order(uuid,text) to authenticated;
