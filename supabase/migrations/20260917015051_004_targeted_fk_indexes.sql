-- Cover growing actor foreign keys. Singleton storefront_config intentionally remains unindexed beyond its PK.
create index drops_created_by_idx on public.drops (created_by) where created_by is not null;
create index drops_updated_by_idx on public.drops (updated_by) where updated_by is not null;
create index prelaunch_sales_created_by_idx on public.prelaunch_sales (created_by) where created_by is not null;
create index prelaunch_sales_voided_by_idx on public.prelaunch_sales (voided_by) where voided_by is not null;
