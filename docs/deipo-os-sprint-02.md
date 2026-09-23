# DEIPO OS — Sprint 02: Orders and inventory holds

Sprint 02 adds an expiring reservation and pending-order engine to the approved Sprint 01 storefront/Admin. It does not integrate payments or enable ordering on existing production drops. Application delivery is local only; the forward database migrations have been applied to the existing `deipo-os` project (`qntjxfmwblhetpsmzzhm`). No new Supabase project or Netlify site was created.

Baseline: `d57c272065f3a9e20c0c1a71427584c15961fd03`, the merge of PR #1 (`feat: build DEIPO OS admin foundation`). Branch: `feat/deipo-os-sprint-02-orders-holds`. Earlier documentation deferring Orders/Holds is historical and superseded by this sprint authorization. Payments, CRM, WhatsApp, kitchen and loyalty remain outside scope.

## Database and migration state

The original nine migrations are unchanged. All thirteen local migration SQL files match remote history exactly, apart from terminal whitespace.

| Applied version | Name |
| --- | --- |
| 20260917014830 | 001_core_deipo_os |
| 20260917014923 | 002_harden_function_privileges |
| 20260917015013 | 003_api_security_and_rls_hardening |
| 20260917015051 | 004_targeted_fk_indexes |
| 20260917015155 | 005_drop_lifecycle_and_assignment_integrity |
| 20260917015233 | 006_drop_content_and_fulfillment |
| 20260917020545 | 005_drop_assets_storage |
| 20260919211540 | 007_admin_publication_media_integrity |
| 20260919212245 | 008_admin_inventory_view_access |
| 20260922132400 | 009_orders_and_inventory_holds |
| 20260922132420 | 010_inventory_engine |
| 20260922132439 | 011_pending_orders |
| 20260922133228 | 012_checkout_api_boundary |

New tables: `inventory_holds`, `orders`, `order_items`, `order_events`. New configuration: `storefront_config.hold_ttl_seconds` (default 600, allowed 60–3600), `drops.max_quantity_per_order` (nullable; no seeded limit), and `drops.online_ordering_enabled` (default false). Admin displays the gate without an activation control.

`orders.hold_id` is unique. Sprint 02 also has one item per order, enforced by unique `order_items.order_id`; a future extras sprint must deliberately evolve this constraint. Money uses bigint minor units bounded by JavaScript's safe-integer range. Item line totals and order totals are generated in SQL. Customer input contains no pricing fields. Unexpected fields are rejected. Order codes use a random 12-hex suffix and are neither authentication nor primary keys.

Commercial item/order facts and hold identity/expiry are immutable. No app role can delete transactional facts. Events are append-only. Orders retain customer contact and fulfillment snapshots, including slot times, fee, zone/pickup label, date and delivery address/reference. Fulfillment references use restrictive FKs, preserving traceability; disable configurations instead of deleting ones referenced by orders.

## Inventory and concurrency

`public.drop_inventory` remains the sole inventory projection, retaining `security_invoker=true`:

```text
prelaunch_sold = sum(non-voided confirmed prelaunch quantities)
online_sold    = sum(order items where committed_at is set and released_at is null)
total_sold     = prelaunch_sold + online_sold
held          = sum(active holds with expires_at > now())
available     = capacity - total_sold - held
```

Changing a committed order's status to refunded does not automatically restock it. Pending payment remains HELD. `temporarily_unavailable` distinguishes all-held from genuinely sold out. Sold-out precedence and opening/closing semantics remain intact.

Checkout mutations take a transaction advisory lock derived from the session hash. Competing inventory writers lock the drop row. Replacement locks old/new drops in UUID order, then the hold and order. Slot/zone snapshot reads take row locks. Existing prelaunch capacity guards and drop-capacity reduction guards now include both sold and held commitments. A failed replacement rolls the entire transaction back, preserving the old hold.

The required order for future multi-row operations is: session advisory lock → sorted drop rows → hold → order → fulfillment row. Transaction triggers also lock the relevant drop. Deferred constraint triggers verify nonnegative availability, the hold/order/item relationship, and converted-hold/committed-order agreement at transaction completion. The intended isolation level is PostgreSQL READ COMMITTED, as used by the API and tests. Do not implement future payment with separately committed hold/order writes.

Identical active hold requests return the same reservation without extending its expiry. A different quantity/drop replaces a bare hold transactionally. Once it has an order, cancellation is required before replacement. Hold history is preserved; the active-session partial unique index prevents a second active row.

Expiration correctness depends on the timestamp, not persisted status or cron. Relevant session operations normalize expired rows and append one `hold_expired` event for the pending order. `admin_order_state`, a security-invoker view, exposes effective expired status for filtering even before normalization. TTL is capped by the drop's sales close timestamp. Reload never renews it.

## RPC and security boundary

Public APIs:

- `create_inventory_hold(p_drop_id, p_quantity, p_checkout_session_hash)`
- `get_checkout_state(p_checkout_session_hash)`
- `release_inventory_hold(p_checkout_session_hash)`
- `create_pending_order_from_hold(p_checkout_session_hash, p_details)`
- `cancel_pending_order(p_checkout_session_hash)`
- `admin_cancel_pending_order(p_order_id, p_reason)`

The five customer functions are callable by anon/authenticated and authorize by possession of the high-entropy session hash. They return an explicit checkout DTO, never contact PII, internal hold/order IDs, hashes, or audit records. Hashes are capabilities and must remain private. RPC callers can mint their own sessions; the application endpoint is not itself a database rate limiter.

The public functions are SECURITY INVOKER wrappers. Privileged implementations are in the unexposed `private` schema with fixed empty search paths and narrowly granted entry points, following Sprint 01's pattern. Internal helpers retain revoked execution grants. Admin cancellation verifies an active founder/admin, requires a reason, refuses committed orders, and appends both lifecycle and audit events.

RLS is enabled on all four new tables. Anonymous roles have no direct table access. Authenticated users have SELECT grants subject to active-admin RLS and no direct writes. Active operators can inspect, while founder/admin can cancel pending orders. Orders pages enforce authorization again through the existing server DAL. No service-role key or new environment secret is required.

`get_storefront_state()` and its existing private implementation/payload retain their DTO boundary. The payload adds only ordering gate and quantity limit; inventory components now contain real derived values. It never includes transactional IDs or PII.

## Cookie, server routes and checkout

`deipo_checkout_session` contains 32 random bytes encoded as hex. It is HttpOnly, host-only, SameSite=Lax, Path=/ and Secure outside loopback. It is independent of Supabase Admin authentication and logout. The public page proxy establishes the cookie before a reservation request, so retries have an identity. Only SHA-256 is passed to the database. The raw token never appears in a URL, React props, HTML, database, analytics or application logs.

`POST /api/checkout` validates same-host Origin and rejects cross-site mutations. It supports hold, order, release and cancel, maps failures to concise Spanish domain messages, and preserves the cookie on uncertain outcomes so retry can reuse it. No authoritative prices are accepted. `/checkout` reads only the server cookie and safe RPC state; missing/failed/expired state does not fabricate a checkout. `GET /api/checkout` refreshes safe state. `GET /api/storefront` exposes the existing typed public projection.

Inventory-sensitive pages and routes use dynamic/no-store responses; public page requests receiving cookies are private/no-store. Static assets retain their cache behavior. During enabled selling, the storefront refreshes its server-rendered snapshot every 15 seconds and on focus/visibility. It stops in sold-out/closed/disabled states. Checkout refreshes while active. The countdown uses the server's `expires_at` and `server_time`, then monotonic elapsed browser time; it is not announced every second. Forms have labels and associated error feedback. Submission is guarded against duplicate clicks. In-flight polls from before a mutation cannot overwrite its newer result; a delayed-response browser regression covers this ordering.

The customer provides name, explicit international phone (optional separators; `00` normalized to `+`), optional email and fulfillment. No Guatemala country code is silently invented. Enabled slots are required if present. A delivery zone must belong to the drop, be enabled and have a finalized non-null fee; null never means free. Pickup has no delivery fee. Slot capacity is planning metadata in Sprint 02: neither online nor prelaunch slot occupancy is guaranteed. This limitation is stated in Admin.

The final action creates a pending order and keeps the hold. It explicitly says payments are not connected and the purchase is not confirmed. `/success` retains the production no-payment behavior. No payment endpoint, simulated production charge, paid button, refund, CRM or kitchen flow was added. Preview mode retains its existing clearly marked demos.

## Admin

- `/admin/orders`: paginated operational list (50/page), effective status filters, customer, quantity, total, fulfillment, creation and expiry.
- `/admin/orders/[id]`: customer/contact, immutable commercial and fulfillment snapshots, hold/commitment state, event timeline and pending cancellation with a required reason.
- Existing overview/drop inventory naturally reads real online/held/sold values from the same view.
- Drop inventory editor supports optional maximum quantity. Online activation stays unavailable in the UI. Derived fields remain read-only.

## Verification and reproduction

Use Node 22+; final validation uses Node 24.19.0. Initial commands through the system npm shim selected Node 20; final builds/checks use the explicit Node 24 runtime.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run test:admin
```

For database tests, supply a disposable localhost PostgreSQL 17 database with pgcrypto. Never point the harness at Supabase or a business database. The harness rejects non-loopback hosts. Initialize an empty database with `node scripts/setup-orders-test-db.mjs`, then run `npm run test:db`. `DEIPO_TEST_DATABASE_URL` supplies the connection; do not commit it. Setup creates only minimal local Auth/Storage scaffolding and replays every migration. It refuses a nonempty database.

`npm run test:checkout` builds production-mode `.next-qa` and runs the browser against an HTTP adapter backed by that local PostgreSQL database. Use a separate local database if running SQL stress tests concurrently. The SQL fixture uses parameterized function calls and anon role for customer operations. The fixture adapter models PostgREST numeric serialization, not real Supabase Auth/Storage networking. The original Admin fixture tests auth behavior separately. Different browser suites have separate artifact directories.

Delete the entire disposable database after acceptance, rather than bypassing immutable-fact triggers. Never seed or clean production rows to run these tests. Embedded PostgreSQL binaries used for this run were installed only under `/private/tmp`, following the [embedded-postgres project](https://github.com/leinelissen/embedded-postgres).

Recorded results (2026-09-22):

| Check | Result |
| --- | --- |
| SQL Sprint 02 | 78 assertions passed |
| Genuine concurrent reservations | Capacity 5 / requests 3+3 and capacity 2 / requests 2+2: exactly one succeeds |
| Additional concurrency | Same-session retries reserve once; prelaunch writer and hold cannot oversell |
| Sprint 01 transactional SQL | Existing 44-check regression passed on isolated PostgreSQL |
| ESLint / strict TypeScript | Passed, no errors |
| Node 24 production build | Passed (production-mode isolated `.next-qa`; normal preview build also passed) |
| Unit tests | 33 passed |
| Storefront / packaging / anonymous Admin | 42 browser tests passed |
| Existing authenticated Admin | 7 browser tests passed |
| SQL-backed checkout / Orders | 5 browser journeys passed; desktop/mobile, keyboard, cookies, session isolation, reload, expiry, gate, cancellation and a11y |
| Live Supabase probes | RLS/grants, anon safe state, non-admin denial, founder authorized reads passed; no business writes |
| Migration reconciliation | All 13 SQL files exactly match remote history, ignoring terminal whitespace |

Security Advisor after migration 012: only the existing **Leaked Password Protection Disabled** warning. [Supabase remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Initial public SECURITY DEFINER findings were resolved by restoring the established public-invoker/private-implementation pattern; no customer table policies were widened.

Performance Advisor: three existing unindexed foreign keys on the singleton `storefront_config`, plus unused-index INFO in the lightly used database (14 in this run). No missing FK indexes on the new transaction tables. Existing indexes retained. [Foreign-key guidance](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [unused-index guidance](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

The browser test asset endpoints intentionally resolve to localhost, so Next Image's SSRF safeguard rejects them and renders the existing fallback. This is expected test output, not an image-security exception. The separate packaging suite uses the real approved local assets. Earlier test failures exposed and resolved a countdown rounding error, test database interference, a fixture bigint serialization mismatch and colliding browser trace directories. No test failure was hidden with retries or relaxed product assertions.

## Production data and limitations

Verified before/after: the single user-owned draft (`number=1`, name `s`, slug `ss`, draft, capacity 22, price_minor 100) retains every original column value and timestamp. Its newly added gate is false and maximum null. CURRENT/NEXT remain null. Production holds/orders/items/events are empty. No drop was assigned, published, seeded or deleted. No existing data was used as a fixture.

No application code was pushed, merged or deployed. This means new database capabilities exist remotely while the production application remains on Sprint 01. Netlify HTTPS/CDN acceptance of Sprint 02 must occur in the separately authorized PR Deploy Preview process.

Open launch requirements: verified payments, stronger abuse/rate-limit policy, business decision on an optional quantity ceiling, operational fulfillment/slot capacity, Auth leaked-password protection, and owner acceptance. Session-scoped idempotency and TTL do not prevent an attacker from generating multiple sessions. Expired historical rows may remain persisted until touched; inventory and Admin effective state remain correct. No expired-order background notification is included.

## Material modules

- `supabase/migrations/20260922*`: schema, constraints, locking, inventory projection, RPCs and grants; `src/types/database.types.ts` regenerated from the live schema.
- `src/lib/deipo/checkout.ts`, `checkout-session.ts`, `repositories/checkout.ts` and `orders.ts`: safe DTOs, domain validation, cookie and server data boundaries.
- `src/app/api/checkout/route.ts`, `api/storefront/route.ts`, `src/proxy.ts`: session establishment, mutation/read endpoints and cache policy.
- `src/components/checkout/live-checkout.tsx`, `reserve-button.tsx`, `src/app/checkout/page.tsx`: reservation and pending-order flow; existing production success gate preserved.
- `src/components/drop/*`, `src/lib/drop.ts`, storefront mapper and drop types: real inventory refresh, temporary reservation state, optional quantity limit and gate.
- `src/app/admin/(protected)/orders/*`, drop inventory editor, actions and mutation repository: authorized inspection/cancellation and configuration.
- `scripts/setup-orders-test-db.mjs`, `test-orders-db.mjs`, `test-checkout.mjs`, browser fixture/spec/config and unit tests: isolated SQL, concurrency and browser acceptance.
- `AGENTS.md`, `README.md`, this document: current scope and handoff. Canonical Second Brain notes updated separately; no private notes copied into the repository.

## Exact Sprint 03 contract

1. Start from an uncommitted `pending_payment` order with its existing hold; reuse the commercial/fulfillment snapshots. Browser redirects and order codes are not proof of payment or authorization.
2. Add Recurrente and verified webhook authenticity/idempotency in that sprint. Do not expose an Admin mark-paid action.
3. In one database transaction, follow session → drop → hold → order locking and recheck effective expiry using server time after lock acquisition. Define an explicit late-payment policy; never sell units that have already returned to availability without a new capacity check.
4. For valid payment, set order `inventory_committed_at`, `paid_at`, `status='paid'` and hold `status='converted'`, `converted_at` together. The deferred checks reject an incomplete or mismatched swap. HELD decreases Q while online SOLD increases Q; AVAILABLE is unchanged.
5. Add genuine payment lifecycle events through a forward migration to the event-type constraint. Handle duplicate/reordered webhook deliveries without duplicate inventory commitment. Status `refunded` alone must never restock; any later release needs an explicit operational policy and `inventory_released_at`.
6. Render a real receipt only from server-verified paid state. Keep checkout/session authorization for private state. Address failed payment/retry and abandonment without extending holds accidentally.
7. Only after payment acceptance and launch hardening, introduce an intentional founder activation path for `online_ordering_enabled`. No default activation, seed launch date, quantity limit or CURRENT assignment is implied by this sprint.
