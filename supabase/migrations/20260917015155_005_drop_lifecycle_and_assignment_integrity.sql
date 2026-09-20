create or replace function private.stamp_drop_actor()
returns trigger
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  v_actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if v_actor is not null then
      new.created_by := v_actor;
      new.updated_by := v_actor;
    end if;
  else
    new.created_by := old.created_by;
    if v_actor is not null then new.updated_by := v_actor; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.stamp_drop_actor() from public, anon, authenticated;

create trigger drops_stamp_actor
before insert or update on public.drops
for each row execute function private.stamp_drop_actor();

create or replace function private.validate_drop_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and old.lifecycle_status in ('archived','cancelled')
     and new.lifecycle_status is distinct from old.lifecycle_status then
    raise exception 'Archived or cancelled drops are terminal';
  end if;

  if new.lifecycle_status in ('scheduled','published') then
    if new.price_minor <= 0 then raise exception 'Scheduled/published drops require a positive price'; end if;
    if new.orders_open_at is null or new.orders_close_at is null then raise exception 'Scheduled/published drops require opening and closing timestamps'; end if;
    if new.orders_close_at <= new.orders_open_at then raise exception 'Closing must be after opening'; end if;
    if new.fulfillment_date is null then raise exception 'Scheduled/published drops require a fulfillment date'; end if;
  end if;

  if new.lifecycle_status = 'published' then
    new.published_at := coalesce(new.published_at, case when tg_op = 'UPDATE' then old.published_at else null end, now());
  elsif tg_op = 'INSERT' then
    new.published_at := null;
  elsif old.lifecycle_status <> 'published' then
    new.published_at := old.published_at;
  end if;

  return new;
end;
$$;
revoke all on function private.validate_drop_lifecycle() from public, anon, authenticated;

create trigger drops_lifecycle_guard
before insert or update on public.drops
for each row execute function private.validate_drop_lifecycle();

create or replace function private.validate_storefront_config()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_status public.drop_lifecycle_status;
  v_actor uuid := auth.uid();
begin
  if new.current_drop_id is not null then
    select lifecycle_status into v_status from public.drops where id = new.current_drop_id;
    if v_status is null then raise exception 'Current drop does not exist'; end if;
    if v_status <> 'published' then raise exception 'Current drop must be published'; end if;
  end if;

  if new.next_drop_id is not null then
    select lifecycle_status into v_status from public.drops where id = new.next_drop_id;
    if v_status is null then raise exception 'Next drop does not exist'; end if;
    if v_status not in ('scheduled','published') then raise exception 'Next drop must be scheduled or published'; end if;
  end if;

  if v_actor is not null then new.updated_by := v_actor; end if;
  return new;
end;
$$;
revoke all on function private.validate_storefront_config() from public, anon, authenticated;

create trigger storefront_config_guard
before update on public.storefront_config
for each row execute function private.validate_storefront_config();
