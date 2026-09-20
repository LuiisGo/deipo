# DEIPO OS — Sprint 01

Implementation on the existing storefront baseline `18bcedd72569817aa3d1dc1865d49964f96d38a7`, branch `feat/deipo-os-sprint-01`. No new app, site, repository or Supabase project. The approved public visual system and PackagingReveal remain in place.

## Runtime and environment

Node 22+; Next.js 16.3.5 / React 19.3. Supabase SSR 0.12.7 and supabase-js 2.116.0. Netlify already selects Node 22. Use `.env.local` locally and the existing site's environment when deploying. `.env.example` contains names only:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_MODE`
- `NEXT_PUBLIC_SITE_URL`

Set `NEXT_PUBLIC_SITE_MODE=production` at build time for the database-backed public storefront. Production builds with absent or invalid mode also select production, so missing configuration cannot show fixtures. Local `.env.local` explicitly selects preview for regression review. Explicit preview/customer-preview deployments retain the approved V0 fixtures. The production mode cannot be downgraded by a query string. No service-role credentials are used. Never commit `.env.local` or an authenticated browser storage state.

The existing Supabase project is `deipo-os`, ref `qntjxfmwblhetpsmzzhm`, us-east-1. Local configuration and ignored CLI project-reference metadata point to this project. Reconciliation used the authenticated management connector, not a production reset or a new schema: the seven original migration versions, names and SQL statements were retrieved from remote history, including both historical human-readable `005` names. Database types were generated from the real project and refreshed after DDL. No founder account or mapping is seeded.

## Routes and data boundaries

- `/admin/login`: email/password only; generic failed sign-in, explicit access denial for authenticated accounts without an active profile.
- `/admin`: current/next, authoritative inventory and ten latest audit entries.
- `/admin/drops`: lifecycle filters, sold/available, edit and preview links.
- `/admin/drops/new`: minimum draft fields, no invented dates or final price.
- `/admin/drops/[id]`: general, inventory, confirmed prelaunch sales, schedule, fulfillment, included items, media, publishing and audit.
- `/admin/drops/[id]/preview`: authenticated database-backed preview in a separate route group, reusing `Storefront` and `DropProvider` without the Admin CSS wrapper.

`src/lib/supabase` owns browser/server clients, config and active-admin authorization. `src/proxy.ts` refreshes cookies with `getClaims` and returns private/no-store responses. Each protected repository/action performs authorization again. The DAL uses `getUser` for a fresh server-confirmed identity and checks `admin_profiles.is_active`. Operators can read; founder/admin can mutate. Route protection complements RLS.

The implementation follows the installed Next.js Proxy/cookies/auth documentation and [Supabase SSR guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs). No custom token refresh loop or `getSession` authorization is used.

`src/lib/deipo/repositories` separates queries/mutations from presentation. Generated `Database`/`Tables` types describe storage; explicit DTO mapping selects customer fields. `src/components/admin` contains forms, accessible confirmation dialogs, pending/error/success behavior and upload controls. The public repository creates an anonymous client without forwarding Admin cookies and calls only `get_storefront_state()`. It never directly queries Admin tables.

## Inventory, publishing and fulfillment

Inventory comes from `drop_inventory`. Sold already includes confirmed prelaunch sales. Online sold and held are the existing database projection's zero values in this sprint. Available = capacity - sold - held; zero availability from holds is not automatically sold out. There is no editable sold field.

Use `record_prelaunch_sale` and `void_prelaunch_sale`; never delete or rewrite sale facts. Sources, notes, confirmation timestamps and void reasons stay internal. Capacity guards reject overselling/reductions below confirmed commitments. Server actions revalidate affected Admin/storefront paths after successful writes. There are no Realtime subscriptions.

Money is parsed from decimal strings to integer minor units without persisting floating point values. Date-time inputs are explicitly converted from America/Guatemala UTC-6; blank dates stay null. Delivery fee null means unconfirmed, zero means free. Slots do not reserve global stock. Only included items are exposed in this Admin; paid extras are deferred.

Publication uses `publish_drop`. CURRENT/NEXT use `set_storefront_drop` with confirmation and allow clearing an assignment. Publishing never assigns CURRENT implicitly. CURRENT requires published; NEXT requires scheduled/published; assigned drops must be unassigned before invalidating their lifecycle. Archive/cancel are terminal and confirmed. Existing audit triggers record root drop/sale/config changes, including hero synchronization; the UI does not edit audit entries.

## Storage

The existing public `drop-assets` bucket accepts JPEG/PNG/WebP/AVIF through 15 MB. Browser validation precedes authenticated Storage upload. Paths contain the drop number, media category and random asset filename, never PII. RLS limits writes to active founder/admin.

Hero metadata uses a stable `hero` sort-order 0 slot; a database trigger updates `drops.hero_image_path` in the same transaction. The active hero is the first enabled hero by order/id. Replacements retain previous physical objects for reversible recovery; there is no automatic deletion of old references. For a failed metadata write, the client checks whether the write actually persisted before deleting the new object. Ambiguous persistence/failed cleanup returns the object path for recovery rather than risking deletion of a referenced asset.

Packaging uses enabled, ordered media records of arbitrary count, including zero; no six-frame database requirement. The approved reveal component is unchanged. Public Storage means asset URLs themselves are public; authorization protects draft records and preview pages, not secrecy of assets uploaded to this bucket.

## Forward migrations

- `20260919211540_007_admin_publication_media_integrity`: stored hero and at least one fulfillment method required for scheduled/published states; atomic hero metadata/reference synchronization; lifecycle assignment guard; public low-stock threshold included in the RPC DTO.
- `20260919212245_008_admin_inventory_view_access`: repairs the inherited missing authenticated SELECT privilege on `drop_inventory`. Crucially, the view uses `security_invoker=true`: existing active-admin RLS on both `drops` and `prelaunch_sales` controls every row. Anonymous view access remains revoked.

An automatic review initially rejected the second change as potentially broad access. Live catalog evidence established that both source tables require active-admin membership and the security-invoker view preserves those policies; the reviewed retry succeeded. No policy was widened to permit non-admin data reads.

## Safe public behavior

Production has no fixture fallback. Missing CURRENT shows an empty/next-drop state; RPC/network/invalid payload failures show controlled unavailability. NEXT is rendered only from customer-safe RPC data. Inventory, dates, price, content, media, zones and slots map from actual data. Missing slots or packaging do not crash rendering.

Orders, holds and payments are not implemented: production `/checkout` and `/success` never create demo purchases or receipts, purchase controls explain that online ordering is unavailable, and public notification forms do not collect data. Admin previews are also non-transactional. Explicit preview deployments retain existing checkout/receipt demonstrations and packaging regression journeys.

## Verification and operational limits

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e` are the standard checks.
- `npm run test:admin` builds `.next-qa` against an isolated localhost HTTP contract fixture, runs founder/non-admin/full-editor/failure browser journeys, and restores Next-generated source config files afterward. It never connects to production. This verifies UI integration, not Supabase RLS or real Storage byte validation.
- `supabase/tests/sprint01.sql` runs against the actual database under founder/authenticated/anonymous roles in one transaction ending with ROLLBACK. All test drops, sales, audit entries and Storage metadata disappear. Identity is looked up dynamically; no auth user is created or hardcoded. RLS can reject DELETE by affecting zero rows, so the test checks that the sale survives.
- Live founder login, active role, navigation and reload were verified with the owner-entered credentials in the local browser. Credentials were not read or saved by the agent.
- Live bucket settings and policies were inspected. Physical production asset upload/replacement and a real operational drop remain an owner acceptance step; browser uploads were exercised against the isolated fixture and SQL verified the actual Storage role policies.

The remote database remained empty after rollback tests: zero drops, sales and audit rows; CURRENT/NEXT null. No launch dates or demand were fabricated.

Security advisor: only the known [Leaked Password Protection Disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) warning remains. Enable it in Supabase Auth when available for the project. Performance notices concern unused indexes in an empty database and three foreign keys on the singleton config; indexes were retained.

No remote code push, Netlify deployment or new site configuration is part of this delivery. To release, configure the production mode and Supabase public environment on the existing site, intentionally enter confirmed drop data/assets, complete the real upload/publication acceptance check and approve the branch publication. Keep noindex until commercial-launch requirements are confirmed.

## Recorded results — 2026-09-19

| Check | Result |
| --- | --- |
| ESLint | Passed, zero warnings |
| Strict TypeScript / Next route generation | Passed |
| Unit tests | 26 passed, zero failed/skipped |
| Webpack production build | Passed on Node 24.19.0; deployment engine remains Node 22 |
| Storefront + anonymous Admin browser suite | 42 passed, including approved packaging and WCAG checks |
| Isolated authenticated Admin browser suite | 3 passed; full drop/sales/void/publish/current-next journey, non-admin denial, backend failure |
| Actual database transactional checks | 44 passed, ROLLBACK; includes non-admin inventory invisibility |
| Live founder account | Owner sign-in, active role, reload, list and new-draft form verified |
| Second Brain validator | Zero errors; one pre-existing empty-note warning |

The isolated image fixture intentionally contains test bytes and a localhost asset endpoint. Next Image's private-IP safeguard stays enabled; its expected rejection exercises image fallback. It is not evidence of a real Supabase file upload or physical packaging imagery. The separate storefront suite exercises the approved real local packaging images.

## Next sprint

Sprint 02: server-authoritative orders/order items and expiring inventory holds, transactional capacity checks, concurrency/idempotency tests and an explicit temporarily-held availability state. Recurrente and verified payment webhooks belong to Sprint 03. CRM, kitchen, WhatsApp, analytics and automations remain deferred.
