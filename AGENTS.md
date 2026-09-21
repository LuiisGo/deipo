# deipo. storefront

Consult the connected Wichiss Second Brain before substantial changes. The DEIPO MOC, current status, decisions and locked Brand System are canonical. Do not copy private vault contents into this public repository.

- Current scope: DEIPO OS Sprint 01 on the approved WEB V0.2 storefront. Admin and Supabase data foundation are authorized; Orders/Holds/Payments/CRM remain deferred. Preserve storefront visuals. See docs/deipo-os-sprint-01.md.
- Consumer wordmark is `deipo.` with an orange full stop. Never use the historical working name for new assets.
- Brand palette: cream `#F5F1E8`, matte black `#121212`, orange `#D3401F`, functional white.
- No emojis in the interface, content or documentation. Use simple SVG icons for directional UI.
- English campaign headlines; Spanish descriptions, logistics, checkout and messages.
- Q175 is an inclusive estimate, not a final price. No paid extras. No per-order maximum beyond availability (`maxQuantityPerOrder: null`).
- Preview fixtures remain in `src/content/current-drop.ts`; production data comes only from the customer-safe Supabase RPC. Never fabricate sales or roll deadlines forward.
- `prelaunchSoldUnits` represents confirmed pre-launch sales in production. The V0.2 13/80 fixture is not evidence of actual sales. `sold` already includes pre-launch sales; held units are never sold.
- Use `getInventory` for stock arithmetic and validation. The future backend owns inventory; do not implement production holds or payments in V0.2.
- Customer-facing times use 24-hour formatting in `America/Guatemala`, through the shared time helpers.
- No confirmed launch date: leave `ordersOpenAt`, `salesCloseAt`, next-drop timestamps and `fulfillmentDate` null. Tuesday 00:00 is a working reference, not a confirmed calendar date.
- Stock simulation requires explicit opt-in in `preview`. Never simulate purchases in `customer-preview` or a future production mode.
- Never persist customer data or put PII in analytics. Receipt data lives in memory only.
- Preserve supplied `images/` reference files; they are ignored by Git. Public optimized assets are under `public/`.
- Keep approved logo assets replaceable. Use the supplied standalone artwork without redrawing it; do not trace a logo from a raster brand board.
- Run lint, typecheck, unit tests and a production build after meaningful code changes. Browser checks should cover relevant journeys and responsive layouts.
- Write back durable implementation decisions and unresolved items to the existing DEIPO notes, preserving historical context.
- Remote publication needs explicit authorization in the current session. Historical V0 push authorizations do not authorize pushing Sprint 01.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
