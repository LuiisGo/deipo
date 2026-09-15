# DEIPO WEB V0.1 — Creative polish

Refines the V0 storefront in place. No checkout service, database, payment, inventory, CRM or analytics provider was added. Q175 remains an inclusive estimate; extras remain empty and quantity is constrained only by available units.

## Presentation modes

`src/lib/site-mode.ts` is the single mode resolver; `SitePresentation` and `PreviewOnly` control presentation throughout the existing routes. Neither mode enables commerce.

- Default: `preview`. Unknown modes also resolve to preview.
- Clean internal review: `/?mode=customer-preview`.
- Clean archive: `/?mode=customer-preview&state=sold_out`.
- Explicit development view: `/?mode=preview`.
- Build default may be changed with `NEXT_PUBLIC_SITE_MODE=customer-preview`. The query overrides it for review. The deployed environment was not changed by this refinement.

Development labels and test controls disappear in customer-preview. A small internal-presentation notice remains. Checkout still states that it cannot charge or reserve; final consent remains mandatory. Waitlist completion explicitly says no subscription was created. Noindex metadata, robots, headers and empty sitemap are unchanged. Mode/state test parameters survive checkout navigation; the presentation mode survives the receipt and return home.

## State narratives

| State | Result |
| --- | --- |
| ACTIVE | Product, inclusive price, availability, quantity and GET THE DROP remain clear. |
| LOW STOCK | Actual 74/80 snapshot, 6 remaining; restrained text signal, no fabricated sales or timer urgency. |
| SOLD OUT | 080/080, early next-drop form, product retrospective, DROP 001 / ARCHIVE, packaging, craft and NEXT DROP SOON. No price panel, countdown, quantity, checkout links or buy-this-drop closing block. |
| SALES CLOSED | ORDERS CLOSED / NOW, WE COOK. No sale controls; distinct from a sell-through claim. |
| UPCOMING | COMING SOON, date unannounced, next-drop form and preview content. No available-stock claim, quantity or active countdown. |

`CommerceOnly` reacts to the same `DropProvider` status as the hero and checkout, including expiration during a visit. `DropSection`, `ArchiveNote` and `NextChapter` compose the existing server-rendered content; the site was not duplicated into separate mode pages.

Hero copy labels the 80-unit capacity as “80 POR EDICIÓN”; the stock indicator reports remaining availability separately.

## Original logo integration

During the round, the owner supplied four more PNGs: `deipo white.png`, `deipo black.png`, `deipo logo app - favicon.png`, and `deipo branding.png`. They had opaque backgrounds. The owner explicitly authorized margin cropping and deterministic background removal without redrawing the glyphs.

- The new black and cream transparent PNG copies replace the text approximation in hero, navigation, footer, checkout, receipt, legal/error-adjacent contexts and Open Graph artwork.
- The app mark supplies the PNG favicon, replacing the text SVG.
- `DeipoLogo` controls hero/navigation/footer/receipt/compact variants, intrinsic dimensions and black/cream assets. No stretching, tracing, recoloring or AI reconstruction was used.
- Prepared logo sizes: 688×253 and 671×244, approximately 71 KB and 74 KB. Raster texture and finite resolution remain properties of the supplied originals.
- SVG is still preferred for future scalable reproduction, but is **not a blocker for this PNG-backed release**. The horizontal lockup remains a reference; its tagline is not duplicated in the hero.

Original files remain untouched in ignored `images/`. The public repository contains only the prepared assets. `src/content/brand-assets.ts` is the replacement point for future approved vectors.

Owner refinement, 2026-09-15: no emojis. Unicode arrows were replaced with one small decorative SVG component; no emoji fonts or icon dependency.

## Typography and mobile

Anton 400 was visually compared against Barlow Condensed 700 and Oswald 700 using the same campaign strings. Anton retained the closest condensed weight and vertical emphasis to the approved Sunday Roast poster. Barlow read softer and wider in its counters; Oswald produced more open spacing. This is an implementation choice, not a new custom wordmark.

[Visual comparison](visual-review/typography-comparison.png). Alternatives were loaded only for the audit, without adding dependencies or font files to the app. Primary license references: [Barlow OFL](https://github.com/google/fonts/blob/main/ofl/barlowcondensed/OFL.txt), [Oswald OFL](https://github.com/google/fonts/blob/main/ofl/oswald/OFL.txt).

Hero campaign type fills its available column more deliberately. Secondary headlines, section spacing and Spanish copy were tightened. The 390px clean active page measured about 6,550px before the hosting overlay, compared with about 7,160px for the published V0 baseline; this is a pacing comparison, not a performance benchmark. Stock uses tabular figures and a thin persistent mobile strip with an explicit GET THE DROP / NEXT DROP action and safe-area spacing.

The published V0's optional Netlify badge overlapped the mobile action. A narrowly scoped CSS rule reserves a bottom row when its observed iframe is present. No hosting/account setting was changed. The project owner can instead disable it in Project configuration / General / Powered by Netlify badge, as described in [Netlify's documentation](https://docs.netlify.com/manage/projects/powered-by-netlify-badge/).

## Packaging, checkout and receipt

The single supplied packaging photo now has four controlled views: full box, seal detail, wordmark detail and full box. Scroll advances the views; keyboard-accessible buttons select one explicitly. Reduced motion starts on the static full box and makes detail changes instant. Only real supplied frames are loaded.

Future `packagingFrames` accepts either paths or `{ src, alt, label }` records. Multiple records render a real sequence with corresponding labels and controls; no invented opening frames, 3D or extra animation libraries.

Checkout retains four steps and now exposes the subtotal/total close to the mobile steps. Unknown coverage still blocks a confirmed total. Selected fulfillment/slots have clearer borders. The receipt uses the original wordmark, a tighter printer width, aligned tabular figures and readable sound/print controls. Print CSS, silent default, memory-only data and empty-refresh behavior remain intact.

## Validation and limits

Validation results are recorded in [implementation.md](implementation.md). Captures cover both modes and all five states at 390/1440, plus responsive inspection at 320, 375, 430, 768 and 1280. Automated layout coverage also includes 1024. Packaging details, checkout/review, receipt, reduced motion and keyboard focus were inspected.

Temporary assets: food photography and physical-packaging concept. Real recipe/portions/allergens, final price, launch date, coverage/fees, pickup address, slot capacity, policies and production integrations still require confirmation. Opening-frame photography and a final printer recording are future improvements, not prerequisites to this working single-photo/synthesized-sound prototype.
