# DEIPO OS — Sprint 03: verified Sandbox payments

Local implementation on `feat/deipo-os-sprint-03-payments`, starting at main
`cee347fbcde230da1d75a6b69d391e7f45613559` (Admin direct-entry hotfix, PR #3).
The initial fdf3c16 delivery was local, with no publication. The owner subsequently
published [PR #4](https://github.com/LuiisGo/deipo/pull/4) and reported the flat-webhook
contract failure in its Deploy Preview. Historical delivery notes below record
017 and the runtime-origin correction. As of 2026-09-30, baseline `80baff3` reached
real Sandbox checkout; acceptance exposed the unified environment contract issue
addressed by 018 below. This correction permits applying 018 only to
`deipo-os-acceptance`. Do not apply 018 to production `deipo-os` until acceptance
passes. No push, merge, LIVE activation or Production Netlify change is authorized.

## Provider contract: initial review 2026-09-28; correction rechecked 2026-09-29

Sources:

- [Create checkout](https://docs.recurrente.com/referencia-api/api-reference/checkouts/create-checkout)
- [Sandbox first payment](https://docs.recurrente.com/guides-english/getting-started/first-test-payment)
- [Webhooks](https://docs.recurrente.com/guides-english/getting-started/webhooks)
- [Sandbox guide and webhook fixtures (contract caveat below)](https://docs.recurrente.com/guides-english/guides/sandboxes-and-test-clocks)

Server-only fetch client, `X-SECRET-KEY`, 10-second abort, no redirects or automatic
POST retries. Each creation first verifies `/api/test` says the configured named
Sandbox; a TEST prefix alone does not prove that. Only sandbox configuration and
TEST keys are accepted. No card fields or card credentials enter DEIPO.

Inline items come from immutable order snapshots. Currency GTQ; card and bank
transfer enabled; installments empty; billing information requirement `none`.
The API documents at most nine units per line: larger DEIPO quantities are split
into equivalent lines, preserving unit price, quantity and total. Delivery is a
separate inline item only when nonzero. No root amount is sent. Official documented
GTQ minimum is Q5; provider rejection is mapped to a safe error rather than exposing
its raw response. An unverified-account amount limit receives a distinct safe error.

The checkout endpoint contract does **not document Idempotency-Key**. No unsupported
header is assumed. Metadata contains integration/version/order code/attempt ID,
never a checkout-session token. Expiration is the original hold deadline.

## Schema and migration evidence

| Version | Name | MD5 of exact SQL |
| --- | --- | --- |
| 20260928141301 | 013_payment_domains | 26f02e850b2ef40475b51488c5c08b94 |
| 20260928141305 | 014_payment_checkout | 589cfda1544d0b1723ec141a4e30223b |
| 20260928141309 | 015_payment_finalization | 6bf060db46b8845ed56452db99ba952c |
| 20260929033116 | 016_payment_replay_integrity | 795b8d51be6c99f242ddda15d33d236b |
| 20260929141829 | 017_recurrente_flat_webhook_contract | 587020dad5aaa1473823b0954cb6242a |
| 20260930180615 | 018_unified_webhook_sandbox_environment (acceptance only) | bc2a56fcb2f7c3813dc3ce52c784775a |

Remote-assigned versions are reflected in local filenames. All previous migrations
remain unchanged. Generated `database.types.ts` comes from Supabase's generator,
not manual type patches. `payment_attempts` and `payment_webhook_events` have RLS,
restricted grants, FK indexes and no-delete triggers. `orders` adds
`payment_review_required`; order event constraints add payment lifecycle events.
No alternate inventory projection is introduced.

RPCs each have a public SECURITY INVOKER wrapper and a private SECURITY DEFINER
implementation with an empty fixed search_path. EXECUTE is revoked from PUBLIC,
anon and authenticated, then granted only to service_role:

- `prepare_payment_checkout(text,text)`
- `save_payment_checkout(uuid,jsonb)`
- `customer_payment_state(text)`
- `receive_payment_webhook(text,text,jsonb)`
- `process_payment_webhook(uuid,text)`

Authenticated active Admins can SELECT operational rows through existing DAL/RLS;
ordinary authenticated users see none. No direct table writes are granted to
anon/authenticated/service_role. Server mutation occurs through the controlled RPCs.
No signing secret or API key is stored in Postgres.

## Checkout lifecycle and uncertain results

`POST /api/payments/recurrente/checkout` requires same-host Origin, a trusted origin,
and the existing HttpOnly checkout cookie. It accepts no authoritative body fields.
The session hash selects the latest owned hold and order inside SQL. SQL revalidates
hold, order, online gate, price snapshot, currency and environment under locks.

A partial unique index prevents simultaneous creating/unknown/ready/pending attempts
for one order. Only the first request receives permission to call the provider.
Others reuse a valid URL or receive a safe in-progress response. Expired reservations
cannot initiate payment. Failed/canceled attempts may be retried while the original
hold remains valid. Creating a checkout does not renew inventory.

Timeout, lost connection, 5xx, malformed response, missing URL or invalid successful
response are `creation_unknown`: no automatic new checkout. Persist failures keep
the existing creating attempt blocking retries; after 45 seconds it is treated as
unknown by customer state, Admin and the next preparation request. This is a stalled
operation threshold, not permission to retry. Confirmed provider rejection can
produce a failed attempt. Every retry revalidates reservation eligibility.

Trusted hosted origins require an exact canonical HTTPS `PAYMENT_ALLOWED_ORIGIN`
configured server-side in Netlify's Functions/runtime scope for the authorized
Deploy Preview only. Missing/malformed configuration fails closed, including
`https://bydeipo.com` in Production, where this variable must remain unset.
Origin must be canonical and match Host; cross-site requests are rejected.
Forwarded headers are not trusted. No wildcard or automatic preview-number acceptance.
HTTP loopback (localhost, 127.0.0.1, [::1]) is allowed only outside Netlify;
`SITE_ID` (runtime-guaranteed) or `NETLIFY` disables that exception.
No arbitrary Host-derived return URL. No capability in URLs.

The prior `DEPLOY_PRIME_URL` / `CONTEXT` authorization depended on build-time
metadata unavailable in Functions runtime and rejected legitimate Preview requests
before `prepare_payment_checkout`. Netlify documents only `URL`, `SITE_NAME`, and
`SITE_ID` as runtime read-only variables:
[Functions environment variables](https://docs.netlify.com/build/functions/environment-variables/).
The explicit runtime allowlist replaces that assumption without enabling Production.

## Verified inbox and atomic fulfillment

`POST /api/webhooks/recurrente` uses the original body (bounded to 256 KiB), required
Svix headers and official **svix 2.5.0** timestamp/signature validation. In this
version verify returns no parsed payload; JSON parsing happens explicitly afterward.
Missing configuration returns 503; bad/missing signatures 401; malformed signed
envelope 400; oversized input 413. Nothing is persisted before signature verification.

Recurrente HTTP payloads are **flat root objects**. Parser-required fields are
nonempty string `event_type` (max 120 characters) and `id` (max 256). Unified
intent fields are root-level: `type`, `status`, `raw_status`, `api_version`,
`created_at`, `amount_in_cents`, `currency`, `live_mode`, `sandbox_id`.
`customer`, `product`, `checkout`, `payment`, `details` and optional `metadata`
remain nested objects. No `eventId`, `eventType` or `data` wrapper is required or
accepted as a substitute for root identity. Example with synthetic values:

```json
{
  "id": "in_example",
  "event_type": "intent.pending",
  "type": "bank_transfer",
  "status": "pending",
  "raw_status": "pending",
  "api_version": "2026-06-01",
  "created_at": "2026-09-28T12:00:00Z",
  "amount_in_cents": 2500,
  "currency": "GTQ",
  "checkout": { "id": "ch_example" },
  "customer": { "id": "cus_example" },
  "product": { "id": "prod_example" },
  "details": { "bank_reference": null, "sender_comment": null },
  "live_mode": false,
  "sandbox_id": "sbx_example"
}
```

These business/environment fields are not prerequisites for parsing a signed
message. Testing UI/helper examples may omit them. SQL persists the complete
verified root and then diagnoses absent/wrong environment, unknown checkout or
incomplete business facts. Such durable diagnostics return HTTP 200 without
allocating inventory. Natural test-card events may also lack `payment`.

**Identity:** root `id` is the provider intent/domain ID; pending and succeeded
can legitimately share it. Verified `svix-id` is the unique message identity and
is stable on retries. For new inbox rows both `event_id` and `svix_id` store this
Svix message ID; `provider_intent_id` stores root `id`. A separate message produces
a separate inbox row. Replaying the same message and semantically equal JSON
returns the original row. Changed semantic content with the same Svix ID raises
`WEBHOOK_IDENTITY_CONFLICT`; the existing route safely returns 503 with no new
mutation. JSON whitespace/key order may differ; the original raw SHA-256 remains.
Concurrent inserts are serialized by the unique constraints. Processing separately
deduplicates fulfillment, so a second message cannot commit inventory twice.
Inbox insertion commits separately; transient processing failure returns 503 for
safe retry without losing durable evidence.

### Acceptance exposed the incorrect initial contract

PR #4 Deploy Preview acceptance reported a signed flat `intent.pending` receiving
HTTP 400, with an empty inbox. The original parser and RPCs incorrectly required
`eventId/eventType/data`; local fixtures copied that assumption and therefore did
not detect it. The 400 path is post-signature contract rejection; invalid signatures
map to 401. This correction fixes the consumer contract rather than just changing
that response status.

Official sources rechecked for this correction:
[Webhooks](https://docs.recurrente.com/guides-english/getting-started/webhooks) and
[Unified migration](https://docs.recurrente.com/guides-english/guides/migrate-to-unified-webhooks)
show a flat HTTP payload. [Svix verification](https://docs.svix.com/receiving/verifying-payloads/how-manual)
defines `svix-id` as stable across resend attempts; [replays](https://docs.svix.com/retries)
require idempotent receiving. The
[Sandbox/helper guide](https://docs.recurrente.com/guides-english/guides/sandboxes-and-test-clocks)
still describes a camelCase wrapper in its subscription sequence, while its helper
section distinguishes fixture creation from natural domain flows and warns that
natural fields are not invented. That documentation conflict is preserved here.
The verified flat webhook guides and the user-observed HTTP acceptance payload
govern this integration; the old wrapper is deliberately rejected, not normalized.

Migration 017 replaces only the two private RPC implementations, retaining their
signatures, fixed search paths, privileges and all downstream inventory/fulfillment
logic. It does not rewrite 013–016, backfill/delete history, or change table schema.
The inbox was verified empty before applying it. Generated TypeScript definitions
need no regeneration because SQL signatures and column types do not change.

Only unified `intent.pending/failed/canceled/succeeded` can transition payment state.
Signed legacy events and `intent.paid` are recorded and ignored for fulfillment.
Historical rule through 017 (superseded by 018): every relevant event required
boolean `live_mode=false` and exact configured `sandbox_id`. Actual unified Sandbox
success omitted `live_mode`, so that rule incorrectly rejected it.

Current rule (018): configured Sandbox ID and event Sandbox ID must both be
nonempty and exactly equal. Explicit `live_mode=true` is rejected; false or
absent/null is eligible only with that exact Sandbox identity. Other validation
still applies. Unknown checkout is durable/unmatched and acknowledged; mismatched
environment is durable/visible and acknowledged. Neither changes inventory.

Correlation is checkout ID -> local attempt. Provider amount must exactly equal
attempt amount and order total; all currencies must equal GTQ. Only card (`payment`)
and bank transfer methods are eligible. Supplied correlation metadata is checked.
Provider success is retained independently of business resolution.

Lock order inside finalization: inbox row -> session advisory -> drop -> hold ->
order -> attempt. No customer/prelaunch path takes an inbox lock, preventing a lock
cycle. Shared session/drop ordering agrees with Sprint 02. Order/hold/attempt/events
and inbox completion commit in one transaction, including deferred inventory checks.

Normal: order paid/paid_at/inventory_committed_at, hold converted/converted_at,
attempt succeeded/committed. Canonical available stock is unchanged when held becomes
sold. Tested 80 capacity / 10 prelaunch / 20 online / 5 held / 45 available ->
10 prelaunch / 25 online / 0 held / 45 available.

Late success: under the same drop lock, recompute canonical capacity. If sufficient,
commit safely. An already-persisted expired hold has one narrowly authorized new
terminal transition: expired -> converted only when its order is paid/committed
and a succeeded/committed payment exists in that same transaction. Immutable
quantity, deadline, session and commercial facts are preserved; deferred constraints
remain active. Released/canceled reservations are not automatically revived.

No capacity, amount/currency mismatch, unsupported method, correlation mismatch or
ineligible canceled order: provider success remains factual, attempt review_required,
uncommitted order payment_review_required, no receipt, no oversell. Any remaining
active reservation is released. Already-paid orders stay paid; additional successful
attempts are flagged POSSIBLE DUPLICATE PAYMENT, never allocated twice. A second
success with a different provider intent/payment on the same checkout is also
flagged in inbox/Admin without undoing its original commitment. Success cannot be
reversed by a later failed/canceled/pending event.

## Customer and Admin behavior

Checkout retains the approved layout, contact/fulfillment and original deadline.
After pending order creation, CONTINUAR AL PAGO redirects to Hosted Checkout.
Customer state and /success derive solely from the session cookie, never query params
or return redirects. A safe server DTO excludes internal IDs, hashes, contacts,
webhook data and provider credentials.

Finite sequential polling uses eight increasingly spaced requests, with request
aborts and manual refresh afterward. Paid/failed/review/expired stop automatic polls.
Bank transfer pending explicitly says unconfirmed; its hold expires normally.
The verified receipt requires paid order + inventory commitment + succeeded,
committed attempt, and uses immutable snapshot values with the existing thermal
paper animation/CSS. Sandbox receipts explicitly state no real money moved.
Preview's existing demo receipt remains distinct. Payment status is text-based,
keyboard accessible and live announcements only change with actual state.

/admin/payments uses the existing Admin authorization and visual language. It shows
attempt/provider/resolution/method/amount/currency/environment/IDs/timestamps and
safe failure/review reasons. Attention is queried independently of the latest 100
attempts, so older anomalies are not hidden by normal recent traffic. Inbox anomalies
are visible too. Orders link to Payments and expose the review status filter.
No MARK PAID, live switch, manual commitment or automatic refund exists.

## Diagnostics and manual review

For a known checkout, run the read-only `scripts/inspect-recurrente.mjs` with Node 22,
locally loaded environment and its Admin checkout ID. It verifies Sandbox first,
GETs the checkout and prints only a non-PII whitelist. There is no anonymous provider
inspection API and GET never replaces webhook fulfillment.

For creation_unknown: stop retries, inspect the Sandbox dashboard by attempt/order
metadata and creation time. Never guess that a timeout meant no checkout. If a
checkout exists, verify its identity, Sandbox, exact totals/currency, original expiry
and metadata. An authorized server operator may map the verified checkout through
`save_payment_checkout` while the attempt is creating/unknown, then replay the
original signed delivery. An unmatched durable inbox event can be retried through
`process_payment_webhook` after mapping; already-completed events are idempotent.
If absence cannot be proven, keep blocked. No automatic re-creation or deletion.

For money received with no allocation or a duplicate charge: inspect the exact
Sandbox provider payment, contact the customer through an explicitly authorized
operational channel, and manually resolve/refund in Recurrente's dashboard according
to the accepted business policy. This sprint does not issue refunds or mark an order
refunded merely because review was opened. History is never hard-deleted. Persistent
inbox received/unmatched cases and stale creating attempts require operator attention;
there is no background reconciliation worker in this sprint.

## Environment and deferred Preview acceptance

Names only:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_MODE` (production data mode for isolated acceptance)
- `NEXT_PUBLIC_SITE_URL` (optional metadata only)
- `SUPABASE_SECRET_KEY` (server-only trusted RPC credential)
- `RECURRENTE_SECRET_KEY`, `RECURRENTE_MODE`, `RECURRENTE_SANDBOX_ID`
- `RECURRENTE_WEBHOOK_SECRET` (request-time requirement, not build-time)
- `PAYMENT_ALLOWED_ORIGIN` (exact authorized Preview HTTPS origin, Functions/runtime only; unset in Production)
- Netlify runtime `SITE_ID` identifies hosting for the loopback prohibition

No keys in code, client props, logs, snapshots, vault or netlify.toml. The webhook
secret does not exist locally except an isolated test-process fixture. Build works
without it. The account remains unverified; LIVE is a separate launch decision.

Original Preview acceptance plan (PR #4 now exists; correction push remains unauthorized):

1. Push this branch, open a PR to existing main and wait for the existing site's
   Deploy Preview. No new Supabase project or Netlify site.
2. Resolve isolated acceptance infrastructure before making any test order. A Preview
   pointed at production Supabase is **not** isolated. Never use the user's draft as
   a fixture; a disposable setup/DB branch needs deliberate separate authorization.
3. Configure only that Preview's Supabase and server-only Sandbox variables.
4. Register its exact HTTPS `/api/webhooks/recurrente` endpoint in Recurrente Sandbox;
   capture signingSecret securely and configure RECURRENTE_WEBHOOK_SECRET in Preview.
5. Redeploy Preview. Verify fresh direct Admin login first, HTTPS cookies, trusted
   return origin, signature enforcement, no-store state, and exact SHA.
6. Real Sandbox card acceptance: documented success card and decline card, original
   active hold, Hosted Checkout, actual signed delivery, atomic inventory commitment,
   receipt and secondary GET evidence. No real card data.
7. Recurrente official Testing/helper fixtures for bank transfer pending/success,
   valid hold, late capacity/no capacity, replay, mismatches and legacy ignore.
   This is not an actual Sandbox bank transfer; fixtures do not create domain payments.
8. Verify isolation and unchanged production data again. Keep production online
   ordering off. No production webhook, LIVE key or activation in this sprint.

Sprint 04 handoff: first complete the real Preview/Sandbox acceptance, resolve Auth
hardening, approve operational review/refund and reconciliation ownership and abuse
controls. Future operations/CRM/FEL/WhatsApp/loyalty/kitchen or LIVE activation need
separate scope; none are silently included here.

## Validation record

Local SQL: 130 assertions and eight real independently blocked PostgreSQL races.
Normal conversion; late bank transfer with raw and persisted expiry; no-capacity;
environment/amount/currency/unknown/legacy; monotonic success; failed retry; same and
distinct success duplicates; both cancellation race orders; simultaneous checkout preparation; RLS and no-delete.
Sprint 02: 78 assertions and genuine races; Sprint 01: 44 transactional SQL checks passed.
Provider/signature tests: 25 passed after fixing Svix verify's non-JSON return contract.
Existing unit tests: 43 passed on explicit Node 22.22.1. Initial npm/Volta invocation
used Node 20 and failed three proxy tests; no proxy behavior was changed for that.

First browser checkout/payments run: 8/9 passed; the new Sandbox text failed contrast
(orange text 4.03:1). Corrected to cream, and receipt checks now wait for the complete
paper animation. Second full checkout/payments run: 9/9 passed (59.1s), including mobile pending/receipt and desktop Admin/receipt WCAG. Admin regression: 14/14 passed (31.6s), including fresh zero-cookie direct entry.
Local fixture image requests hit Next's expected private-IP image guard; this does
not test real Storage media and no production SSRF protections were relaxed.

Security Advisor: only pre-existing [Leaked Password Protection Disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
Performance Advisor: three pre-existing singleton storefront_config FK INFO notices,
plus 17 unused-index INFO notices (including new indexes on empty payment tables).
No new uncovered payment FK; indexes retained for their intended production queries.

Production data check after migrations: original user draft fingerprint unchanged,
CURRENT/NEXT null, gate false, holds/orders/items/events/attempts/inbox all zero.
No provider checkout or real Sandbox payment was created in this local sprint.

## Favicon correction

Source inspection found cream border pixels and a rounded tile baked into
`src/app/icon.png`, not CSS or Next metadata. After two generated candidates altered
the glyph, Luis authorized deterministic correction with Sharp. The final export
preserves the original raster silhouette, normalizes cream/orange against the locked
palette, removes the tile, reduces padding and uses solid #121212 to every edge.
Only the resulting PNG is committed; no fonts, private design materials, generated
candidates or export scripts. All edge pixels are verified matte black. Native
16/32 px previews on light/dark chrome-colored backgrounds were visually inspected.
Next's emitted icon link remains image/png, 192x192; HTTP 200 body matches source
byte for byte. Actual production browser-tab cache refresh remains a post-deploy
check, since this sprint does not deploy.

Production build passed on Node 22.22.1 with signing secret absent. Browser artifact
scan confirmed RECURRENTE_SECRET_KEY and SUPABASE_SECRET_KEY values absent from
`.next/static`, without printing values.


Final delivery reruns after migration 016 and the Admin attention filter/layout:
checkout/payments **9/9 passed (2.0m)**; storefront **42/42 passed (3.3m)**;
existing unit **43/43**, provider/signature **25/25**, ESLint and strict TypeScript
all passed. Admin screenshot inspection confirmed a distinct attention section and
readable payment rows. Browser accessibility checks include checkout, status, receipt
and Admin; automated WCAG checks are not a complete manual accessibility audit.

The first storefront run was 41/42: the immediate 390px overflow measurement failed
and the unchanged isolated repeat passed. The assertion now uses bounded polling
for layout stabilization; no storefront styling was changed to suppress overflow.
The final complete 42-test run passed with that assertion. All initial failures and
corrections are retained here rather than representing every invocation as green.

Final remote read-only verification after 016: all four SQL hashes above match;
17 total local/remote migrations; one original draft with unchanged fingerprint
`056d3ea1d4fc18e228759510e1f67d9d`; all online gates false; CURRENT/NEXT null;
configuration timestamp unchanged; zero holds, orders, items, order events, payment
attempts and webhook inbox rows. No Sandbox fixture entered production.

Local completion is ready for review. The delivery message and canonical Current
Status record the final commit SHA and clean working tree; this report intentionally
does not embed its own future commit hash. Nothing was pushed, merged or deployed.


## Flat-contract correction delivery (after initial Sprint 03 closure)

The initial no-push record above describes the previous local delivery. The owner
subsequently published PR #4 and ran Preview acceptance; this correction starts
from fdf3c1690bd11da071bbadcda8fb7131e2d9aaa7 on the same branch. This correction
must be reviewed before any further push. No merge, LIVE activation, production
ordering or Production Netlify credential modification is authorized here.

New regression coverage uses a sanitized flat Testing-style fixture, signed through
the official Svix library, plus natural flat lifecycle fixtures. It checks HTTP
401 for bad signatures, 400 for signed malformed JSON/old envelope, durable 200
for missing environment/unmatched/wrong Sandbox/live/legacy/intent.paid, same-intent
pending→succeeded with distinct messages, same-message semantic replay and conflict.
SQL exercises the unchanged amount/currency/metadata/late/duplicate/cancellation
policies and now includes a ninth genuinely overlapping inbox-insertion race.
The final evidence and applied migration version/hash are recorded below at closure.


Correction closure, 2026-09-29:

| Check | Exact result |
| --- | --- |
| Node | 22.22.1 |
| Provider/signature | 35/35 passed |
| Existing units | 43/43 passed |
| Sprint 03 SQL | 155 assertions, nine genuinely overlapping races passed |
| Sprint 02 SQL | 78 assertions and both original contention races passed |
| Sprint 01 SQL | Transactional regression passed |
| Checkout/payments browser | 10/10 passed (1.1m) |
| Admin direct-entry/session browser | 14/14 passed (28.3s) |
| Storefront browser | 42/42 passed (1.6m) |
| ESLint / strict TypeScript | Passed |
| Production build | Passed with RECURRENTE_WEBHOOK_SECRET explicitly empty |
| Secret scan | Changed files and .next/static passed; no secret values printed |
| git diff --check | Passed |

Only 017 was applied remotely after local verification. Version
`20260929141829`, MD5 `587020dad5aaa1473823b0954cb6242a`, SHA-256
`52e009946070282b34f1f88d43983064af319db62cd5d965f934145f5218b28b`.
Remote SQL MD5 matches the exact local file. Prior 013–016 hashes are unchanged;
18 migrations total. No changes to generated database types, public RPC signatures,
RLS, table ACLs, function EXECUTE grants, Admin proxy or checkout-session boundary.

Before/after production checks: draft fingerprint
`056d3ea1d4fc18e228759510e1f67d9d`, one original draft, online false, CURRENT/NEXT
null, configuration timestamp unchanged, zero orders/holds/items/order events/
payment attempts/webhook inbox. No production fixture or secret stored in DB.
Security Advisor after 017 reports only the pre-existing
[Leaked Password Protection Disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
warning. One preliminary read-only approval review failed due to account usage limit;
retry through the same approval mechanism succeeded, with no bypass.

No code was pushed or deployed during the correction, PR #4 was not merged,
Production Netlify credentials were not touched, and LIVE/ordering remain off.
The actual Preview must be updated only after authorization, then the reported
flat example retried and full isolated Sandbox payment acceptance completed.
A local HTTP 200 diagnostic does not establish live provider fulfillment acceptance.
The final commit SHA and clean status appear in the delivery and canonical vault.


## 2026-09-29 — Runtime payment origin acceptance hotfix

The previous runtime authorization incorrectly required build-only Netlify deploy
metadata, rejecting the legitimate Preview Origin before payment preparation.
`PAYMENT_ALLOWED_ORIGIN` now supplies the exact server runtime allowlist; Origin
canonicality, Host equality and cross-site rejection remain mandatory. Forwarded
headers do not bypass Host. Production has no value and remains fail-closed.
HTTP loopback is restricted to local development outside Netlify, including when
only the runtime-guaranteed SITE_ID identifies hosting.

Changed application code is limited to `src/lib/payments/origin.ts`; tests,
`.env.example` and this runbook document the new contract. No payment business
logic, Recurrente client, webhook, inventory, migration or remote configuration
changed. The acceptance environment and existing hold were not mutated.

Validation on Node 22.22.1:

- Provider/origin/handler: 79 passed, including Production rejection before any
  Supabase/provider fetch when the runtime allowlist is absent.
- Unit suite: 43 passed; TypeScript and lint passed.
- Payment SQL: 155 assertions and 9 genuine concurrent races passed in a new
  disposable local database, removed after validation.
- Checkout/payment browser tests: 10 passed (1.6m). Existing local-image SSRF
  warnings remain; protection was not relaxed.
- Production webpack build passed with PAYMENT_ALLOWED_ORIGIN and webhook
  signing secret empty, proving neither is a build-time requirement.
- Changed files and client bundles scanned for credential patterns and exact
  private environment values without printing them; no findings.

Local commit only. No push, redeploy, merge of PR #4 or LIVE activation.
After separate push approval, verify the new SHA in Preview, recreate the expired
acceptance hold if necessary, and repeat real Hosted Checkout acceptance. A local
pass does not prove the deployed provider flow. Leave Production's allowlist unset.


## 2026-09-30 — Unified Sandbox environment contract correction (018)

Real acceptance reached Hosted Checkout and delivered a signed `intent.succeeded`
with type `payment`, status `succeeded`, amount 1000, currency GTQ, an exact named
Sandbox ID, checkout correlation, payment ID and matching DEIPO metadata. Svix
verification succeeded and the inbox persisted the event, but its final diagnostic
was `environment_mismatch`. Read-only acceptance inspection confirmed that the
payload's `live_mode` key was absent and the stored boolean was SQL NULL.

Root cause: 017 tested `e.live_mode IS DISTINCT FROM false`; SQL NULL satisfies
that rejection condition. Legacy Sandbox examples containing `live_mode=false`
were incorrectly treated as the required unified contract. The
[Unified Webhooks guide](https://docs.recurrente.com/guides-english/guides/migrate-to-unified-webhooks)
and [Webhooks common payload](https://docs.recurrente.com/guides-english/getting-started/webhooks)
do not include `live_mode` among the common unified fields; the observed Sandbox
delivery supplies exact `sandbox_id` identity.

018 uses only CREATE OR REPLACE for `private.process_payment_webhook`. Its sole
body change requires nonempty configured/event Sandbox IDs and exact equality,
and rejects `e.live_mode IS TRUE`. Missing/null live_mode can no longer reject an
otherwise correctly scoped Sandbox event; missing/empty/different Sandbox identity
still rejects. No parser, signature verification, provider client, schema, grants,
locks, inventory rules, amount/currency/type/metadata checks, monotonicity, duplicate
payment handling or receipt logic changes. Migrations 013–017 are immutable.

`recurrente-unified-sandbox-succeeded.json` represents the observed shape using
synthetic identities. SQL regressions use the observed 1000-cent amount. Browser
regressions bind the same shape to their isolated order snapshot and exercise the
signed HTTP path, invalid signatures, replay, diagnostics and receipt eligibility.

Preserve the real rejected event as evidence. Do not reset its status, modify its
payload, manually mark its order paid, convert its inventory or force a replay.
Existing terminal diagnostics remain terminal. After authorized release, acceptance
must use a new order, new Hosted Checkout and new Sandbox payment. A successful
local regression or applied migration does not complete real payment acceptance.


018 validation and application evidence:

- Node 22.22.1: 80 provider/signature/origin tests; 43 unit tests; 279 SQL
  assertions and 9 genuine concurrency races; 18 checkout/payment browser tests
  (1.4m); TypeScript, lint and production webpack build all passed. Build ran with
  webhook signing secret and runtime origin allowlist empty.
- Regression demonstrated against local 017 first: absent live_mode returned
  environment_mismatch instead of processed. Applying 018 forward made it pass.
- Exact source comparison proves the only function-body change is the provider
  environment condition. 013–017 have no Git diff; no generated types changed.
- Acceptance project `deipo-os-acceptance` now has 19 migration records, latest
  `20260930180615_018_unified_webhook_sandbox_environment.sql`. SQL MD5 matches
  local exactly: `bc2a56fcb2f7c3813dc3ce52c784775a`. Function body MD5:
  `9db5faf1ba7f3f7986b90d8c4f06d0d7`.
- Before/after hashes of all inbox rows, attempts, orders, holds, order events,
  drops and storefront configuration were identical. The actual rejected event
  remains environment_mismatch with its original payload. No real event was
  reprocessed and no order or inventory was manually changed.
- Webhook function ACLs, SECURITY DEFINER/invoker properties and fixed search_path
  are unchanged; receive implementation and public wrappers have identical hashes.
- Production `deipo-os` still has 18 migration records through 017, with identical
  before/after migration lists. 018 was not applied there. No Production Netlify
  environment changes and no LIVE activation.
- Secret scan over seven changed/new files and 122 browser bundle files: no
  findings. No secret printed or committed. Only synthetic fixture identities are
  added to tests; the actual provider body is not copied into the repository.

Local commit only; no push or merge. Next acceptance must use a NEW order, NEW
Hosted Checkout and NEW Sandbox payment after authorized release. Production 018
remains deferred until that acceptance passes.
