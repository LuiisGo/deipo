# WEB V0 implementation record

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
