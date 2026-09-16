# deipo. / WEB V0.2 — Packaging Reveal Final

An editorial, mobile-first storefront for limited food drops in Guatemala City. Built around **DROP 001 — SUNDAY ROAST** with a warm cream opening, cinematic food photography, restrained stock signal and a thermal receipt experience.

**Pre-launch design preview. No real orders, inventory reservations, payments or waitlist subscriptions.** Q175 is the owner's current inclusive estimate. Recipes, dates and delivery coverage remain pending.

## Run locally

Requires Node.js 20.9+ (Node 22 recommended).

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. Production: `npm run build && npm start`.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Browser tests use installed Google Chrome. `playwright.config.ts` can use bundled Chromium instead if configured. E2E starts a production server if port 3000 is free; it can also test an existing local server. Screenshots and a printable receipt PDF are generated under ignored `test-results/`.

Webpack is selected explicitly for reproducible production builds; development uses Turbopack. Framework installation follows the [official Next.js documentation](https://nextjs.org/docs/app/getting-started/installation).

## Routes

| Route | Experience |
| --- | --- |
| `/` | Brand opening, product reveal, drop details, quantity, packaging, craft, logistics, conversion and next-drop form |
| `/checkout` | Four-step direct checkout: quantity, delivery/pickup, contact, mock completion |
| `/success` | Dynamic receipt, feed animation, optional sound, print-only receipt, order details |
| `/legal/terms` | Terms scaffold |
| `/legal/privacy` | Current preview data handling + pending legal review |
| `/legal/orders` | Order policy scaffold |
| `/legal/quality` | Quality policy scaffold |

## Presentation modes

Default: `preview`. For a clean internal presentation, open `/?mode=customer-preview`. Combine with `state=sold_out` to inspect the archive. `NEXT_PUBLIC_SITE_MODE` sets the build default; the query can override it. Neither mode enables orders, payment, persistence or indexing. Checkout/waitlist safeguards stay visible.

The storefront is hosted at [deipo.netlify.app](https://deipo.netlify.app). See [Packaging Reveal Final](docs/packaging-reveal-final.md) for the six-frame scroll ritual, assets, loading and static fallbacks. See [V0.2 drop system](docs/drop-system-v02.md) for inventory, scheduling, the mobile signal and the future Admin contract. [V0.1 creative polish](docs/creative-polish-v01.md) preserves the artwork and typography decisions.

## Preview states

Use the state selector at the bottom of the homepage, or:

- `/?state=active` — 13 confirmed-prelaunch units in the mock fixture; 013 / 080 SOLD, 67 available. This is not evidence of actual business sales.
- `/?state=low_stock` — 74/80 illustrative sold, 6 available
- `/?state=sold_out` — 80/80, ordering disabled, next-drop form first
- `/?state=sales_closed` — closing state, ordering disabled
- `/?state=upcoming` — no orders yet
- `/?clock=demo` — fixed example deadline, Friday September 18, 2026 at 23:59 Guatemala / September 19 at 05:59 UTC. It expires; it never resets on reload.
- `/?opening=demo` — fixed example opening, Tuesday September 15, 2026 at 00:00 Guatemala. Not a launch announcement.
- `/?mode=preview&stock=drift` — opt-in internal stock movement: +1, +3, +5 total over 36 seconds, then stable. Visible simulation notice; ignored by customer-preview and not carried into checkout.
- `/?image=missing` — branded image fallback
- `/checkout?slots=none` — unavailable time windows
- `/checkout?payment=fail` — first completion fails, retry succeeds

State parameters are carried into checkout. They are preview tooling and are never proof of availability or payment.

## Content and architecture

- `src/content/current-drop.ts`: typed drop data, estimated price, capacity, fixed deadline, fulfillment, time slots, recipe and asset paths.
- `src/lib/inventory.ts`: validated pre-launch/sold/held projection. Sold already includes pre-launch sales; held units only reduce availability.
- `src/lib/time.ts`: strict 24-hour slot and opening formatting, explicitly in Guatemala's time zone.
- `src/content/brand.ts`: brand copy, campaign copy, social/contact placeholders and canonical origin.
- `src/app/globals.css`: brand tokens, layout system, responsive rules, reduced motion and receipt print stylesheet.
- `src/components/drop/drop-context.tsx`: injected inventory snapshot and automatic sales-close state; future subscription boundary.
- `src/components/checkout/order-context.tsx`: checkout context; sessionStorage holds only non-sensitive selections. Contact/receipt remain in memory and disappear on full reload.
- `src/lib/demo-services.ts`: validation and simulated completion. Replace with server-authoritative order/payment workflow.
- `src/lib/analytics.ts`: typed event adapter and runtime PII allowlist. No trackers run in V0.
- `src/components/packaging/packaging-reveal.tsx`: six-frame scroll reveal, nearby asset loading, decoded-image crossfades and static reduced-motion/short-viewport fallback. Central `packagingFrames` records carry paths, alt text and moment labels; legacy paths still work.
- `src/components/receipt/receipt-printer.tsx`: receipt from actual demo selections, no fabricated purchase on direct navigation.

Server Components render the route content. Interactive islands handle state, forms, clock, stock, motion and receipt. No extra state library. Fonts are self-hosted through Fontsource: Anton for display, Manrope for functional text. The supplied logo artwork is integrated through `DeipoLogo` using owner-authorized transparent PNG copies. Original vector SVG is preferred for future reproduction, but the text approximation is no longer used while these assets are present.

## What remains mock / pending

- Injected inventory examples; no realtime backend or inventory writes. Customer-preview stays stable. Only explicitly enabled internal preview can simulate a bounded stock increase.
- Q175 all-inclusive estimate; no paid extras or per-order cap beyond stock.
- Recipe, portions, allergens, final price, launch date, final zones/fees, pickup address, slot capacities and legal policies require confirmation.
- Waitlist validates and discards data; nobody is subscribed or notified.
- Payment simulation requests no card details and cannot charge anything.
- No database, inventory holds, Recurrente, WhatsApp API, CRM, kitchen/admin or n8n workflows.
- Food and six packaging reveal frames are generated conceptual visuals. PNG masters and optimized WebPs are retained in the project; final production food/packaging photography or renders and physical packaging validation remain pending. Original logo SVG and a final printer recording remain desirable future assets; supplied PNG logos are integrated.
- Receipt sound is a quiet synthesized prototype, triggered only by the sound control. The receipt works silently when audio is unavailable.

## Integration sequence after V0 approval

Supabase/PostgreSQL should own drops, available units, capacity, slots, holds and orders. Recurrente confirmation must be verified on the server through signed/validated webhooks before marking a paid order or issuing a real receipt. A browser redirect or URL parameter is never payment proof. Connect waitlist persistence and consent separately, then analytics, CRM and n8n behind server-side boundaries.

Future DEIPO Admin must let founders configure confirmed pre-launch units and opening/closing timestamps. The storefront consumes the authoritative sold snapshot, which combines confirmed pre-launch and online sales. Holds remain distinct. The [Phase 2 contract](docs/drop-system-v02.md#phase-2-deipo-admin-and-backend-ownership) defines the handoff without implementing an admin or backend now.

## SEO, privacy and deployment

Metadata, an Open Graph image, favicon, truthful Organization JSON-LD and sitemap/robots routes are present. The demo is deliberately `noindex` in metadata, headers and robots; the sitemap stays empty. Set `NEXT_PUBLIC_SITE_URL` to the confirmed deployment origin for social URLs/canonical. With no origin, only local preview metadata is used. Review indexing gates, draft policies, real business data and integrations before a paid launch.

Analytics IDs have optional environment placeholders but loading a consent-aware provider is future work. No credentials are needed for V0. Never put secrets in public environment variables. Security headers disable framing, MIME sniffing, camera, microphone and geolocation permissions.

`netlify.toml` supplies build/runtime settings for Netlify's Next.js support. A GitHub push is not a claim of a live Netlify deployment.

See [implementation report](docs/implementation.md) for decisions, assets and validation.
