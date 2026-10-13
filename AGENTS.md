# deipo. storefront

Consult the connected Wichiss Second Brain before substantial changes. The DEIPO MOC, current status, decisions and locked Brand System are canonical. Do not copy private vault contents into this public repository.

- Current scope: DEIPO OS Sprint 04D Release Candidate + Launch Rehearsal, explicitly authorized by the user's 2026-10-08 brief, continuing d576f0dd3b54a5cb02a3addc5c9692ea4d27eeab on feat/deipo-os-sprint-04-operations. This supersedes the former 04C-only release restrictions. Preserve historical migrations 001–025 exactly; new forward migrations begin at 026. Allowed: security/acceptance fixes, retention, closeout/readiness reports, local full regression, normal push after local hardening, DRAFT PR against main, Netlify Deploy Preview, and migrations/configuration ONLY in preserved deipo-os-acceptance (zyixizuutoyccouuijjz). Production (qntjxfmwblhetpsmzzhm) is read-only: no migrations, business-data/env changes, ordering or LIVE. Do not merge, delete acceptance infrastructure, begin Sprint05 or implement WhatsApp Cloud API. See docs/deipo-os-sprint-04.md for historical scope and 04D evidence.
- Consumer wordmark is `deipo.` with an orange full stop. Never use the historical working name for new assets.
- Brand palette: cream `#F5F1E8`, matte black `#121212`, orange `#D3401F`, functional white.
- No emojis in the interface, content or documentation. Use simple SVG icons for directional UI.
- English campaign headlines; Spanish descriptions, logistics, checkout and messages.
- Preview Q175 remains an estimate. Production pricing/fees come from database snapshots. No paid food extras. Explicit delivery-zone fees may be configured; no dynamic distance pricing. An optional maximum quantity is supported, with null as the unconfigured default; do not invent a business limit.
- Preview fixtures remain in `src/content/current-drop.ts`; production data comes only from the customer-safe Supabase RPC. Never fabricate sales or roll deadlines forward.
- `prelaunchSoldUnits` represents confirmed pre-launch sales in production. The V0.2 13/80 fixture is not evidence of actual sales. `sold` already includes pre-launch sales; held units are never sold.
- Use `getInventory` for DTO arithmetic. The canonical database `drop_inventory` view derives prelaunch + committed online sold and active holds before greatest(expires_at, payment_pending_until). Never edit derived counts or call held units sold out. Follow the documented database lock order.
- Customer-facing times use 24-hour formatting in `America/Guatemala`, through the shared time helpers.
- No confirmed launch date: leave `ordersOpenAt`, `salesCloseAt`, next-drop timestamps and `fulfillmentDate` null. Tuesday 00:00 is a working reference, not a confirmed calendar date.
- Stock simulation requires explicit opt-in in `preview`. Never simulate purchases in `customer-preview` or a future production mode.
- Production contact/fulfillment snapshots live only in private transactional tables. Never put PII or checkout tokens in analytics, logs, URLs or public DTOs. Preview receipt data remains in memory.
- Preserve supplied `images/` reference files; they are ignored by Git. Public optimized assets are under `public/`.
- Keep approved logo assets replaceable. Use the supplied standalone artwork without redrawing it; do not trace a logo from a raster brand board.
- Operations are separate from orders/payment/inventory. Only paid, payment-committed, unreleased inventory enters normal operations. Explicit synchronization and the narrowly scoped receipt claim provision uniquely per order; queue reads are pure. The 023 finalizer preserves the 021 late-payment slot gate and Sprint 03 protocol while adding verified transfer grace.
- Keep operator_profiles separate from admin_profiles. Kitchen sees no PII/payment/revenue; drivers see only assigned deliveries. Staff operational writes use JWT-authenticated controlled RPCs, never public tracker possession. The customer receipt claim can only provision its own paid order and read-only access through the restricted service RPC.
- PACKED requires the frozen component checklist and explicit security seal. Founder overrides preserve original snapshots and append actor/time/reason; operational cancellation never performs a refund or inventory release.
- Tracker tokens use 32 random bytes and SHA-256 for lookup; short order codes are not secrets. Sprint 04C adds a server-encrypted delivery envelope and /order with no-store, no-referrer and no analytics. Hosting URL redaction still requires verification before release.
- Staff invitations require server-only SUPABASE_SECRET_KEY and fixed STAFF_INVITE_ORIGIN; never derive permissions from Auth metadata or expose service credentials. Scanner identifiers never authorize fulfillment; JWT + SQL role/state/version do.
- Run lint, typecheck, unit tests and a production build after meaningful code changes. Browser checks should cover relevant journeys and responsive layouts.
- Write back durable implementation decisions and unresolved items to the existing DEIPO notes, preserving historical context.
- The current user brief explicitly authorizes the 04D release checkpoint: commit, normal branch push, DRAFT PR and Preview only after local hardening. It explicitly authorizes 019–025 and necessary 04D forward migrations ONLY in deipo-os-acceptance after identity/state/hash verification. Never merge or mutate Production.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Sprint 04C invariants

- Assisted drafts are intent only: no inventory, slot reservation or order until an explicit customer claim. Claim atomically reuses the canonical hold/order engine and preserves current drop/gate, price, zone and slot checks. Only founder/admin can create manual drafts; whatsapp_api is reserved. Sales channel and assisted creator are immutable order facts.
- Bank-transfer grace is nullable per drop, bounded, granted once from a correlated verified pending webhook while the original reservation is still active. Replays never renew it; late pending never resurrects scarce inventory. Failure/cancellation clears only the extension; late success uses the existing capacity/slot recheck and review_required. Preserve inbox -> session -> drop -> hold -> order -> attempt.
- Customer claim of tracking requires its own high-entropy checkout capability plus paid/committed facts. It shares the private provisioning primitive with explicit Ops sync using Ops advisory -> order, never acquiring the payment/drop/hold locks afterward. Queue reads remain pure.
- Public tracker is read-only and PII-free. Random256 token hash is persisted; AES-256-GCM delivery envelope uses a server-only key so the receipt can recover the same durable link. Revocation/expiry cannot be undone by customer replays; staff rotates access. Never log capabilities, add analytics on capability routes or expose envelopes/service credentials in browser payloads.
- CUSTOMER_COMMERCE_ORIGIN is an exact configured HTTPS origin, independent from PAYMENT_ALLOWED_ORIGIN. Keys/durations/WhatsApp number are unconfigured by default. No paid map provider: geolocation adapter with coordinate correction fallback. QR generated locally; printing must keep bag labels free of contact/address and authorize delivery logistics.
- Before a future public release, verify hosting request-log redaction for /buy and /order, production key custody, business configuration and the dependency audit recorded in the 04C validation section. This checkpoint does not establish remote acceptance.
