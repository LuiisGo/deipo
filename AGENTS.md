# deipo. storefront

Consult the connected Wichiss Second Brain before substantial changes. The DEIPO MOC, current status, decisions and locked Brand System are canonical. Do not copy private vault contents into this public repository.

- Scope: WEB V0 storefront, mock checkout and receipt. No production payments, inventory, admin or CRM.
- Consumer wordmark is `deipo.` with an orange full stop. Never use the historical working name for new assets.
- Brand palette: cream `#F5F1E8`, matte black `#121212`, orange `#D3401F`, functional white.
- English campaign headlines; Spanish descriptions, logistics, checkout and messages.
- Q175 is an inclusive estimate, not a final price. No paid extras. No per-order maximum beyond availability (`maxQuantityPerOrder: null`).
- Keep drop data in `src/content/current-drop.ts`. Never fabricate sales or roll deadlines forward.
- No confirmed launch date: leave `salesCloseAt` and `fulfillmentDate` null.
- Never persist customer data or put PII in analytics. Receipt data lives in memory only.
- Preserve supplied `images/` reference files; they are ignored by Git. Public optimized assets are under `public/`.
- Keep the temporary wordmark replaceable; do not extract a logo from a raster board.
- Run lint, typecheck, unit tests and a production build after meaningful code changes. Browser checks should cover relevant journeys and responsive layouts.
- Write back durable implementation decisions and unresolved items to the existing DEIPO notes, preserving historical context.
- Remote publication needs explicit user authorization. It was granted for the initial V0 implementation in this session.
