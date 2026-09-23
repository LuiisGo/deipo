# deipo. storefront

Consult the connected Wichiss Second Brain before substantial changes. The DEIPO MOC, current status, decisions and locked Brand System are canonical. Do not copy private vault contents into this public repository.

- Current scope: DEIPO OS Sprint 02 Orders + Inventory Holds on the approved Sprint 01 foundation. See docs/deipo-os-sprint-02.md. Payments, CRM, kitchen and WhatsApp remain deferred. Keep public ordering gated off; preserve storefront/Admin visuals.
- Consumer wordmark is `deipo.` with an orange full stop. Never use the historical working name for new assets.
- Brand palette: cream `#F5F1E8`, matte black `#121212`, orange `#D3401F`, functional white.
- No emojis in the interface, content or documentation. Use simple SVG icons for directional UI.
- English campaign headlines; Spanish descriptions, logistics, checkout and messages.
- Preview Q175 remains an estimate. Production pricing/fees come from database snapshots. No paid extras. An optional maximum quantity is supported, with null as the unconfigured default; do not invent a business limit.
- Preview fixtures remain in `src/content/current-drop.ts`; production data comes only from the customer-safe Supabase RPC. Never fabricate sales or roll deadlines forward.
- `prelaunchSoldUnits` represents confirmed pre-launch sales in production. The V0.2 13/80 fixture is not evidence of actual sales. `sold` already includes pre-launch sales; held units are never sold.
- Use `getInventory` for DTO arithmetic. The canonical database `drop_inventory` view derives prelaunch + committed online sold and active unexpired holds. Never edit derived counts or call held units sold out. Follow the documented database lock order.
- Customer-facing times use 24-hour formatting in `America/Guatemala`, through the shared time helpers.
- No confirmed launch date: leave `ordersOpenAt`, `salesCloseAt`, next-drop timestamps and `fulfillmentDate` null. Tuesday 00:00 is a working reference, not a confirmed calendar date.
- Stock simulation requires explicit opt-in in `preview`. Never simulate purchases in `customer-preview` or a future production mode.
- Production contact/fulfillment snapshots live only in private transactional tables. Never put PII or checkout tokens in analytics, logs, URLs or public DTOs. Preview receipt data remains in memory.
- Preserve supplied `images/` reference files; they are ignored by Git. Public optimized assets are under `public/`.
- Keep approved logo assets replaceable. Use the supplied standalone artwork without redrawing it; do not trace a logo from a raster brand board.
- Run lint, typecheck, unit tests and a production build after meaningful code changes. Browser checks should cover relevant journeys and responsive layouts.
- Write back durable implementation decisions and unresolved items to the existing DEIPO notes, preserving historical context.
- Remote publication needs explicit authorization in the current session. Historical push authorizations do not authorize pushing Sprint 02.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
