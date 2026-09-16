# WEB V0 / V0.1 / V0.2 implementation record

## Current milestone: Packaging Reveal Final

[Packaging report](packaging-reveal-final.md): six generated 4:3 moments, scroll-driven pinned stage, responsive WebP images, decoded-image crossfades and static/recovery fallbacks. [Prompt set](packaging-generation-prompts.md) records generation direction. The previous single-photo controls are superseded; all other storefront flows retain the V0.2 baseline.

Final verification (2026-09-16): **40/40 browser tests against the production build, 17/17 unit tests, ESLint without warnings, strict TypeScript and production compilation passed.** Packaging checks cover all six moments and reverse/keyboard progression at 390/430/768/1440px, delayed/missing assets, total failure, reduced motion and short viewports. Automated WCAG A/AA checks and existing commerce journeys pass. Source scans found no emojis. Browser layout assertions wait for streamed content to become visible and for the existing header transition to finish. Git and hosting are verified separately at delivery.

## Baseline release: WEB V0.2

[Drop-system report](drop-system-v02.md): confirmed pre-launch sales contract, a 13/80 mock snapshot, validated sold/held/available projection, central opening/closing logic, 24-hour times, next-drop scheduling references and a mobile signal that compacts into navigation. Optional stock demonstration is explicitly enabled only in preview. Brand assets, packaging, checkout architecture and receipt remain intact. No production backend or real sales were added.

V0.2 verification (2026-09-15): **30/30 browser tests against the production build, 14/14 unit tests, ESLint without warnings, strict TypeScript and production compilation passed.** Automated WCAG A/AA checks cover home, checkout, archive, review, receipt and the compact closed-state signal. Source scans found no emojis or customer-facing AM/PM times. Responsive checks cover 320, 375, 390, 430, 768, 1024, 1280 and 1440px; both modes and all five states are captured at 390/1440. The three mobile transition checks retain keyboard focus and verify header containment and touch targets. Git and live deployment are verified separately at delivery.

## Historical release: WEB V0.1

[Creative-polish report](creative-polish-v01.md): original PNG logos integrated, two safe presentation modes, full SOLD OUT archive, packaging detail progression, deliberate Anton typography, tighter mobile layout and refined checkout/receipt. Business and backend boundaries are unchanged.

Final verification (2026-09-15): **24/24 browser tests, 8/8 unit tests, ESLint with no warnings, strict TypeScript and production build passed.** Automated WCAG A/AA audits passed on home, checkout, customer archive, review and receipt. Source and rendered-text scans found no emojis. The published V0 baseline at deipo.netlify.app was inspected and its Netlify deploy was verified against commit `e87896a`. Git/deployment completion for V0.1 is recorded at delivery.

The sections below preserve the **historical V0 implementation record**. Its wordmark and deployment-status statements are superseded by the V0.1 report above.

## Scope and confirmed choices

The storefront implements the DEIPO master brief and the connected Wichiss DEIPO context. It is a pre-launch visual and interaction prototype. Historical planning is not presented as operating results.

User confirmations during implementation:

- Q175 estimated per complete drop, everything included.
- No extra charges for separate potatoes/jus options; extras configuration stays empty.
- No maximum per order beyond available inventory.
- English campaign headlines, Spanish buying/logistics/body copy and messages.
- Commit and push the finished implementation to `LuiisGo/deipo`.

## Visual decisions

The cream opening gives the wordmark space before introducing the product. A single cinematic image leads into the black product statement; price appears later. A compact stock signal stays available in the header on desktop and bottom strip on mobile. Thin rules replace card decoration. Packaging uses the supplied black-box concept as a single image with restrained scroll motion. The receipt emerges through a printer slot, ends in a perforated edge and has no success confetti.

The orange brand color is preserved exactly. Small informational text uses black on cream for sufficient contrast; orange is used as a bar, dot, seal or white-text action surface. Reduced motion stops the feed animation and packaging movement. Standard native focusable controls drive checkout.

## Assets and provenance

| Asset | Source | Production status |
| --- | --- | --- |
| Sunday Roast WebP | AI-generated for this project using the supplied campaign poster as food/art-direction reference | Temporary; recipe is not approved |
| Black-box WebP | Optimized copy of supplied packaging concept | Concept only; physical tests pending |
| Wordmark component | Replaceable Manrope text implementation | Approved isolated SVG still needed |
| `d.` favicon | Temporary SVG text mark in the approved palette | Replace alongside final logo |
| Open Graph image | Code-generated editorial typography | No price, reviews or operating claims |
| Receipt sound | Quiet synthesized mechanical texture | User-triggered prototype; final recording pending |
| Anton / Manrope | Self-hosted Fontsource packages | Open font distributions; licenses included by packages |

Original user reference PNGs remain untouched in the ignored `images/` folder. No vault documents, private raw sources or credentials are included in Git.

## Integration boundaries

The stock snapshot is injected through `DropProvider`; changing the source to Supabase can preserve the visual components. The checkout service validates quantity/fulfillment/contact and is isolated from the interface. Production requires server-side capacity checks, holds, idempotent payment handling and verified order state. Contact data is never put in analytics or browser persistence.

The next-drop form's submit handler identifies the future waitlist API boundary; it currently validates and clears the form. Analytics has a no-op default and only accepts allowlisted non-PII properties. `packagingFrames` supports additional assets once supplied; a multi-frame opening has not been fabricated.

## Validation

Completed on the production build: **17/17 browser tests, 8/8 unit tests, ESLint, strict TypeScript and production compilation passed.** `npm audit` reported zero vulnerabilities after updating sharp. The repository includes:

- Eight unit tests for availability, inclusive totals, Guatemala deadline, status precedence, fulfillment, demo receipt consistency, payment failure and analytics privacy.
- Browser tests for eight widths (320, 375, 390, 430, 768, 1024, 1280, 1440), pickup, delivery, payment failure/retry, waitlist, unavailable states, unavailable slots, unknown coverage, invalid quantity, expired countdown, missing image, reduced motion, print-only receipt, sensitive-storage boundaries, legal routes and automated WCAG checks.
- ESLint, strict TypeScript and a production build.

Screenshots were inspected at mobile and desktop sizes, including the opening, order section, packaging and receipt. The accessibility audit waits for the entrance animation to settle before measuring contrast; the live interface itself continues to honor reduced-motion preferences.

## Explicit limits

No real customers are notified, charged or reserved. No operational claims or testimonials were invented. Production domain, photography, SVG logo, final recipe/allergens, commercial policies, pickup address, coverage and launch date remain unresolved. No backend or Netlify deployment was performed as part of the local build itself.
