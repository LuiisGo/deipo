-- 04D: explicit policy, controlled redaction. No launch values or transactional deletes.
alter table public.drops add column assisted_draft_retention_days integer
 check(assisted_draft_retention_days between 0 and 3650);
alter table public.assisted_sale_drafts add column pii_redacted_at timestamptz;
create index assisted_redaction_candidates on public.assisted_sale_drafts(drop_id,expires_at)
 where claimed_at is null and pii_redacted_at is null;

create or replace function private.assisted_facts_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if old.pii_redacted_at is null and new.pii_redacted_at is not null then
  if old.claimed_at is not null or old.order_id is not null or new.details<>'{}'::jsonb
   or to_jsonb(new)-array['details','pii_redacted_at'] is distinct from to_jsonb(old)-array['details','pii_redacted_at']
   or not exists(select 1 from public.drops d where d.id=old.drop_id and d.assisted_draft_retention_days is not null
    and old.expires_at+make_interval(days=>d.assisted_draft_retention_days)<=clock_timestamp())
  then raise exception 'TRANSACTION_FACTS_IMMUTABLE'; end if;
  return new;
 end if;
 if to_jsonb(new)-array['claimed_at','claimed_session_hash','order_id'] is distinct from to_jsonb(old)-array['claimed_at','claimed_session_hash','order_id']
  or (old.claimed_at is not null and new is distinct from old)
  or (old.pii_redacted_at is not null and new is distinct from old)
 then raise exception 'TRANSACTION_FACTS_IMMUTABLE'; end if;
 return new;
end $$;

create function private.ops_retention_configure(p_drop uuid,p_days integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.ops_require(array['founder']);
 update public.drops set assisted_draft_retention_days=p_days where id=p_drop;
 if not found then raise exception 'OPS_NOT_FOUND'; end if;
 insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),'retention_policy_configured','drop',p_drop,jsonb_build_object('days',p_days));
end $$;

create function private.ops_redact_expired(p_drop uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.assisted_sale_drafts; n integer:=0; envelopes integer:=0; cutoff timestamptz; begin
 perform private.ops_require(array['founder']);
 select clock_timestamp()-make_interval(days=>assisted_draft_retention_days) into cutoff from public.drops where id=p_drop;
 if cutoff is null then raise exception 'RETENTION_NOT_CONFIGURED'; end if;
 -- Only draft locks, never drop/session/payment locks. Claim also locks the draft first.
 for a in select * from public.assisted_sale_drafts where drop_id=p_drop and claimed_at is null
  and order_id is null and pii_redacted_at is null and expires_at<=cutoff order by id for update loop
  update public.assisted_sale_drafts set details='{}',pii_redacted_at=clock_timestamp() where id=a.id;
  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata)
   values(auth.uid(),'assisted_pii_redacted','assisted_sale_draft',a.id,'{}');
  n:=n+1;
 end loop;
 -- Rechecked after any row-lock wait: a concurrent rotation cannot be scrubbed as expired.
 update public.customer_order_access access_row set token_envelope=null
  from public.order_fulfillment f join public.order_items i on i.order_id=f.order_id
  where access_row.fulfillment_id=f.id and i.drop_id=p_drop and access_row.token_envelope is not null
   and (access_row.revoked_at is not null or access_row.expires_at<=clock_timestamp());
 get diagnostics envelopes=row_count;
 if envelopes>0 then
  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata)
   values(auth.uid(),'tracker_envelopes_redacted','drop',p_drop,jsonb_build_object('count',envelopes));
 end if;
 return jsonb_build_object('drafts',n,'envelopes',envelopes);
end $$;

create or replace function private.ops_revoke_access(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.ops_require(array['founder','admin']); perform private.ops_lock(p_id);
 update public.customer_order_access set revoked_at=clock_timestamp(),token_envelope=null where fulfillment_id=p_id and revoked_at is null;
 if found then perform private.ops_event(p_id,'access_revoked'); end if;
end $$;

create function public.ops_retention_configure(p_drop uuid,p_days integer) returns void language sql security invoker set search_path='' as $$select private.ops_retention_configure(p_drop,p_days)$$;
create function public.ops_redact_expired(p_drop uuid) returns jsonb language sql security invoker set search_path='' as $$select private.ops_redact_expired(p_drop)$$;
revoke all on function private.ops_retention_configure(uuid,integer),public.ops_retention_configure(uuid,integer),private.ops_redact_expired(uuid),public.ops_redact_expired(uuid) from public,anon,authenticated,service_role;
grant execute on function private.ops_retention_configure(uuid,integer),public.ops_retention_configure(uuid,integer),private.ops_redact_expired(uuid),public.ops_redact_expired(uuid) to authenticated;
