-- Supabase projects can carry explicit EXECUTE grants for API roles.
-- Make function exposure opt-in so internal SECURITY DEFINER helpers are never RPC-callable.
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

revoke all on function public.audit_drop_change() from anon, authenticated;
revoke all on function public.audit_prelaunch_sale_change() from anon, authenticated;
revoke all on function public.audit_storefront_change() from anon, authenticated;
revoke all on function public.derive_customer_availability(uuid) from anon, authenticated;
revoke all on function public.public_drop_payload(uuid, boolean) from anon, authenticated;
revoke all on function public.validate_drop_capacity_change() from anon, authenticated;
revoke all on function public.validate_prelaunch_capacity() from anon, authenticated;
revoke all on function public.set_updated_at() from anon, authenticated;
revoke all on function public.prevent_prelaunch_sale_delete() from anon, authenticated;
revoke all on function public.prevent_prelaunch_sale_rewrite() from anon, authenticated;

-- RLS policies need this helper for signed-in users; anonymous callers never do.
revoke all on function public.is_deipo_admin(public.admin_role[]) from anon;
grant execute on function public.is_deipo_admin(public.admin_role[]) to authenticated;

-- Authenticated admin RPC surface. Each function performs its own role check.
revoke all on function public.record_prelaunch_sale(uuid, integer, text, text, timestamptz) from anon;
revoke all on function public.void_prelaunch_sale(uuid, text) from anon;
revoke all on function public.publish_drop(uuid) from anon;
revoke all on function public.set_storefront_drop(text, uuid) from anon;
grant execute on function public.record_prelaunch_sale(uuid, integer, text, text, timestamptz) to authenticated;
grant execute on function public.void_prelaunch_sale(uuid, text) to authenticated;
grant execute on function public.publish_drop(uuid) to authenticated;
grant execute on function public.set_storefront_drop(text, uuid) to authenticated;

-- This is the only intentionally anonymous RPC surface in Sprint 01.
revoke all on function public.get_storefront_state() from public;
grant execute on function public.get_storefront_state() to anon, authenticated;
