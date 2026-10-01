-- Forward-only payment facts. No business records or storefront gates are changed.
alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check check (status in ('pending_payment','paid','cancelled','expired','refunded','payment_review_required'));
alter table public.order_events drop constraint order_events_event_type_check;
alter table public.order_events add constraint order_events_event_type_check check (event_type in
 ('order_created','order_cancelled','hold_expired','payment_checkout_created','payment_pending','payment_succeeded','payment_failed','payment_canceled','payment_committed','payment_review_required'));

create table public.payment_attempts (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete restrict,
 provider text not null default 'recurrente' check (provider='recurrente'),
 attempt_number integer not null check (attempt_number>0),
 internal_status text not null default 'creating' check (internal_status in ('creating','checkout_ready','pending','succeeded','failed','canceled','expired','creation_unknown')),
 provider_checkout_id text unique, provider_intent_id text, provider_payment_id text,
 provider_status text, provider_raw_status text, payment_method_type text,
 amount_minor bigint not null check (amount_minor between 1 and 9007199254740991),
 currency text not null check (currency='GTQ'),
 environment text not null check (environment in ('sandbox','live')),
 sandbox_id text, checkout_url text, expires_at timestamptz not null,
 provider_created_at timestamptz, provider_pending_at timestamptz, provider_succeeded_at timestamptz, provider_failed_at timestamptz,
 failure_code text, failure_message text, review_reason text,
 resolution_status text not null default 'unresolved' check (resolution_status in ('unresolved','committed','review_required','ignored')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(order_id,attempt_number),
 check (environment<>'sandbox' or sandbox_id is not null),
 check (resolution_status<>'committed' or internal_status='succeeded')
);
create unique index payment_attempts_one_active on public.payment_attempts(order_id)
 where internal_status in ('creating','creation_unknown','checkout_ready','pending');
create index payment_attempts_order_created on public.payment_attempts(order_id,created_at desc);
create index payment_attempts_intent on public.payment_attempts(provider_intent_id) where provider_intent_id is not null;
create index payment_attempts_review on public.payment_attempts(resolution_status,created_at);

create table public.payment_webhook_events (
 id uuid primary key default gen_random_uuid(), provider text not null default 'recurrente' check (provider='recurrente'),
 event_id text not null unique, svix_id text not null unique, event_type text not null,
 payment_type text, provider_intent_id text, provider_checkout_id text,
 live_mode boolean, sandbox_id text, payload jsonb not null,
 payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
 received_at timestamptz not null default now(),
 processing_status text not null default 'received' check (processing_status in ('received','processed','ignored','unmatched','review_required','environment_mismatch')),
 processed_at timestamptz, processing_error text,
 payment_attempt_id uuid references public.payment_attempts(id) on delete restrict
);
create index payment_webhook_checkout on public.payment_webhook_events(provider_checkout_id);
create index payment_webhook_processing on public.payment_webhook_events(processing_status,received_at);
create index payment_webhook_attempt on public.payment_webhook_events(payment_attempt_id) where payment_attempt_id is not null;
alter table public.payment_attempts enable row level security;
alter table public.payment_webhook_events enable row level security;
revoke all on public.payment_attempts,public.payment_webhook_events from public,anon,authenticated,service_role;
grant select on public.payment_attempts,public.payment_webhook_events to authenticated;
create policy payments_admin_read on public.payment_attempts for select to authenticated using ((select private.is_deipo_admin()));
create policy payment_webhooks_admin_read on public.payment_webhook_events for select to authenticated using ((select private.is_deipo_admin()));
create trigger payments_no_delete before delete on public.payment_attempts for each row execute function private.prevent_transaction_delete();
create trigger payment_webhooks_no_delete before delete on public.payment_webhook_events for each row execute function private.prevent_transaction_delete();
create trigger payments_updated before update on public.payment_attempts for each row execute function public.set_updated_at();

-- Preserve immutable reservation facts; the sole new terminal transition is an
-- expired reservation converted after an already-recorded atomic payment commitment.
create or replace function private.hold_facts_immutable() returns trigger language plpgsql set search_path = '' as $$
begin
 if (to_jsonb(new)-array['status','updated_at','released_at','converted_at']) is distinct from
    (to_jsonb(old)-array['status','updated_at','released_at','converted_at']) then raise exception 'TRANSACTION_FACTS_IMMUTABLE'; end if;
 if old.status<>'active' and new.status<>old.status and not (
   old.status='expired' and new.status='converted' and exists (
     select 1 from public.orders o join public.payment_attempts a on a.order_id=o.id
     where o.hold_id=new.id and o.status='paid' and o.inventory_committed_at is not null
       and a.internal_status='succeeded' and a.resolution_status='committed'
   )) then raise exception 'TRANSACTION_FACTS_IMMUTABLE'; end if;
 return new;
end; $$;
