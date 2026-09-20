-- The Sprint 01 brief explicitly requires active admins to read drop_inventory.
-- Live catalog verification: its only sources are drops and prelaunch_sales;
-- both have RLS enabled and their SELECT policy is private.is_deipo_admin().
-- That helper requires auth.uid() membership in admin_profiles AND is_active.
-- security_invoker=true applies those existing policies as the caller, so
-- authenticated non-admins and inactive admins receive zero rows, not inventory.
-- No table policy is widened and anonymous access remains revoked.
alter view public.drop_inventory set (security_invoker = true);
grant select on public.drop_inventory to authenticated;
revoke all on public.drop_inventory from anon;
