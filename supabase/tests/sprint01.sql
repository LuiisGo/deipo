begin;
do $test$
declare founder uuid; d uuid; sale uuid; n integer:=1000000+floor(random()*1000000)::integer;
 slug_value text:='sprint-test-'||gen_random_uuid(); checks integer:=0; inv record; payload jsonb;
begin
 select user_id into strict founder from public.admin_profiles where role='founder' and is_active;
 perform set_config('request.jwt.claim.sub',founder::text,true);
 set local role authenticated;
 insert into public.drops(number,slug,name,capacity) values(n,slug_value,'Transactional QA',80) returning id into d;
 begin
 perform public.publish_drop(d);
 raise exception 'ASSERTION FAILED: incomplete publish accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
begin
 perform public.set_storefront_drop('current', d);
 raise exception 'ASSERTION FAILED: draft current accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
begin
 perform public.set_storefront_drop('next', d);
 raise exception 'ASSERTION FAILED: draft next accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
begin
 insert into public.drops(number,slug,name,capacity) values(n, 'duplicate-'||d, 'Duplicate',80);
 raise exception 'ASSERTION FAILED: duplicate number accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
begin
 insert into public.drops(number,slug,name,capacity) values(n+1, slug_value, 'Duplicate',80);
 raise exception 'ASSERTION FAILED: duplicate slug accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
begin
 insert into public.drops(number,slug,name,capacity) values(n+2, 'BAD slug', 'Invalid',80);
 raise exception 'ASSERTION FAILED: invalid slug accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
 perform public.record_prelaunch_sale(d,8,'Test fixture - Friends and Family',null,'2030-01-01T00:00:00Z');
 perform public.record_prelaunch_sale(d,3,'Test fixture - Chef Network',null,'2030-01-01T00:00:00Z');
 sale:=public.record_prelaunch_sale(d,2,'Test fixture - Direct',null,'2030-01-01T00:00:00Z');
 select * into inv from public.drop_inventory where drop_id=d;
 if inv.total_sold<>13 or inv.available<>67 or inv.held_units<>0 or inv.online_sold_units<>0 then raise exception 'Inventory projection failed'; end if; checks:=checks+1;
 begin
 perform public.record_prelaunch_sale(d,68,'Overflow');
 raise exception 'ASSERTION FAILED: oversell accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
 begin
 update public.drops set capacity=12 where id=d;
 raise exception 'ASSERTION FAILED: capacity below sold accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
 delete from public.prelaunch_sales where id=sale;
 if not exists(select 1 from public.prelaunch_sales where id=sale) then raise exception 'Sale deleted despite RLS'; end if; checks:=checks+1;
 begin
 update public.prelaunch_sales set quantity=1 where id=sale;
 raise exception 'ASSERTION FAILED: sale rewrite accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
 begin
 perform public.void_prelaunch_sale(sale,'');
 raise exception 'ASSERTION FAILED: empty void reason accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
 perform public.void_prelaunch_sale(sale,'Transactional test');
 if (select available from public.drop_inventory where drop_id=d)<>69 then raise exception 'Void did not restore inventory'; end if; checks:=checks+1;
 begin
 perform public.void_prelaunch_sale(sale,'again');
 raise exception 'ASSERTION FAILED: repeat void accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
 update public.drops set price_minor=17500,orders_open_at='2030-01-01T06:00:00Z',orders_close_at='2030-01-02T05:59:00Z',fulfillment_date='2030-01-02' where id=d;
 begin
 perform public.publish_drop(d);
 raise exception 'ASSERTION FAILED: missing hero accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
 -- Storage metadata is a transaction-only fixture; no real file is uploaded or retained.
 reset role;
 insert into storage.objects(bucket_id,name) values('drop-assets','drop-'||n||'/hero/qa.webp');
 set local role authenticated;
 insert into public.drop_media(drop_id,kind,path,sort_order) values(d,'hero','drop-'||n||'/hero/qa.webp',0);
 if (select hero_image_path from public.drops where id=d) <> 'drop-'||n||'/hero/qa.webp' then raise exception 'Hero sync failed'; end if; checks:=checks+1;
 update public.drops set delivery_enabled=false,pickup_enabled=false where id=d;
 begin
 perform public.publish_drop(d);
 raise exception 'ASSERTION FAILED: no fulfillment accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
 update public.drops set pickup_enabled=true where id=d;
 update public.drops set lifecycle_status='scheduled' where id=d;
 perform public.set_storefront_drop('next',d);
 payload:=public.get_storefront_state();
 if payload->'next'->>'id'<>d::text then raise exception 'Scheduled next missing'; end if; checks:=checks+1;
 perform public.publish_drop(d);
 if (select current_drop_id from public.storefront_config where singleton)=d then raise exception 'Publish assigned current automatically'; end if; checks:=checks+1;
 perform public.set_storefront_drop('next',null);
 perform public.set_storefront_drop('current',d);
 payload:=public.get_storefront_state();
 if payload->'current'->>'id'<>d::text or (payload->'current'->>'total_sold')::int<>11 then raise exception 'Current payload wrong'; end if; checks:=checks+1;
 if (payload->'current') ?| array['audit_log','prelaunch_sales','admin_profiles','created_by','updated_by','source','note'] then raise exception 'Private payload leaked'; end if; checks:=checks+1;
 begin
 update public.drops set lifecycle_status='cancelled' where id=d;
 raise exception 'ASSERTION FAILED: assigned cancel accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
 begin
 update public.drop_media set is_enabled=false where drop_id=d and kind='hero';
 raise exception 'ASSERTION FAILED: published hero disable accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
 begin
 update public.drops set pickup_enabled=false where id=d;
 raise exception 'ASSERTION FAILED: published fulfillment invalidation accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
 perform public.set_storefront_drop('current',null);
 update public.drops set lifecycle_status='cancelled' where id=d;
 begin
 perform public.set_storefront_drop('current',d);
 raise exception 'ASSERTION FAILED: cancelled current accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
 begin
 perform public.set_storefront_drop('next',d);
 raise exception 'ASSERTION FAILED: cancelled next accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
 begin
 perform public.publish_drop(d);
 raise exception 'ASSERTION FAILED: terminal republish accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
 if (select count(*) from public.audit_log where entity_id=d or metadata->>'drop_id'=d::text)<8 then raise exception 'Audit missing'; end if; checks:=checks+1;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 if exists(select 1 from public.drops) then raise exception 'Nonadmin reads drops'; end if; checks:=checks+1;
 if exists(select 1 from public.drop_inventory) then raise exception 'Nonadmin reads inventory'; end if; checks:=checks+1;
 begin
 perform public.record_prelaunch_sale(d,1,'Forbidden');
 raise exception 'ASSERTION FAILED: nonadmin mutation accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
 begin
 insert into storage.objects(bucket_id,name) values('drop-assets','drop-1/hero/nonadmin.webp');
 raise exception 'ASSERTION FAILED: nonadmin storage accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
 set local role anon;
 perform set_config('request.jwt.claim.sub','',true);
 begin
 perform * from public.drops;
 raise exception 'ASSERTION FAILED: anon drops accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
begin
 perform * from public.prelaunch_sales;
 raise exception 'ASSERTION FAILED: anon prelaunch_sales accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
begin
 perform * from public.audit_log;
 raise exception 'ASSERTION FAILED: anon audit_log accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
begin
 perform * from public.admin_profiles;
 raise exception 'ASSERTION FAILED: anon admin_profiles accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
begin
 perform * from public.drop_inventory;
 raise exception 'ASSERTION FAILED: anon drop_inventory accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
begin
 perform * from public.drop_media;
 raise exception 'ASSERTION FAILED: anon drop_media accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
begin
 perform * from public.drop_slots;
 raise exception 'ASSERTION FAILED: anon drop_slots accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
begin
 perform * from public.drop_delivery_zones;
 raise exception 'ASSERTION FAILED: anon drop_delivery_zones accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
begin
 perform * from public.drop_items;
 raise exception 'ASSERTION FAILED: anon drop_items accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
 begin
 perform public.publish_drop(d);
 raise exception 'ASSERTION FAILED: anon publish accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
 begin
 insert into storage.objects(bucket_id,name) values('drop-assets','drop-1/hero/anon.webp');
 raise exception 'ASSERTION FAILED: anon storage accepted' using errcode='ZX001';
exception when sqlstate 'ZX001' then raise; when others then checks := checks + 1;
end;
 perform public.get_storefront_state(); checks:=checks+1;
 reset role;
 perform set_config('deipo.test_checks',checks::text,true);
end;
$test$;
select current_setting('deipo.test_checks')::int as passed_checks;
rollback;
