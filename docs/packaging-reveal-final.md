# DEIPO WEB — Packaging Reveal Final

A focused continuation of WEB V0.2. The previous single-photo detail views are replaced by six actual image assets, progressing from a closed box to its branded interior. The approved matte-black object, cream wordmark, orange seal, Sunday Roast world and existing page order remain the anchors. This sprint changes the packaging section only, plus its data, tests and documentation.

## Assets and provenance

The owner requested a six-frame Astra packaging sequence. It was created with the native `image_gen` tool in this Codex session, using reference-based generation/editing, not the fallback API/CLI. The approved `deipo concepto 1 packaging.png`, prepared original cream logo and existing Sunday Roast photograph supplied the visual references. Original reference files and the previous `public/packaging/black-box.webp` remain intact.

All final images are **1448 × 1086, 4:3 landscape**. Original generated PNGs are saved alongside WebP quality-86 exports. Only WebP paths are consumed by the storefront; `next/image` supplies responsive sizes. No image is left dependent on a private generation directory.

| Moment | PNG master under `public/drops/drop-001/packaging/` | WebP bytes |
| --- | --- | ---: |
| Closed box | `frame-01-closed.png` | 53,904 |
| Seal detail | `frame-02-seal-detail.png` | 95,422 |
| First opening | `frame-03-crack-open.png` | 51,714 |
| Partial interior | `frame-04-half-open.png` | 90,152 |
| Full reveal | `frame-05-full-reveal.png` | 101,554 |
| Final ritual | `frame-06-final-ritual.png` | 166,216 |

The six WebPs total **558,962 bytes**, about 546 KiB before responsive image optimization. The larger PNG masters are not requested by the interface. The [prompt set](packaging-generation-prompts.md) records references, invariants and each moment. The full-reveal generation was reframed once to give the upper lid adequate negative space. The partial-open and final-ritual frames then reused its interior, preserving food, paper and insert placement.

These are conceptual generated visuals, not final manufacturing artwork, validated food-safe packaging, or photographs of a delivered order. Physical packaging and final recipe/portion validation remain open. The preview includes a concise provenance notice; customer-preview retains the clean presentation.

## Sequence and layout

`PackagingReveal` owns the outer section and pinned inner stage. Server-rendered packaging copy is passed as children. Drop content centrally supplies six `{ src, alt, label }` records; there are no paths embedded in the component.

Framer Motion's existing `useScroll` maps section progress to six evenly spaced moments. At each boundary, the decoded image crossfades over 320ms using the existing restrained easing. It reverses naturally on upward scroll. No carousel, tabs, image-selection buttons, rotating box, WebGL, zoom, spring or additional animation dependency.

The copy reads PACKAGING / GOOD THINGS. INSIDE. / ONE BOX. ONE SEAL. ONE LIMITED EDITION. A small counter, current moment label and six thin progress segments explain the progression. The previous support paragraph is removed so the assets carry the moment.

Desktop keeps copy on the left and a 4:3 image on the right. Below 768px the composition stacks, the supporting line becomes compact, and the scroll distance shortens. The stage sits below the existing header and safe area; navigation/live-signal code is unchanged. Outer heights are 280svh on desktop and 240svh on mobile, minus the header offset, providing roughly 1.7/1.3 viewport lengths of pinned progression in a 900px-high viewport. There is no scroll interception or mandatory pause.

## Loading, accessibility and fallbacks

- The first image is lazy-loaded. A single proximity observer mounts the remaining frames 700px before the stage approaches, without a blocking preload.
- A frame becomes eligible only after its image has decoded. While a requested frame is delayed or missing, the closest earlier usable moment stays visible; if none exists, the first available frame is used.
- A completely unavailable sequence displays a quiet text fallback and removes the long pinned journey. Empty arrays and legacy single-image arrays remain supported; shorter sequences use their actual count.
- Reduced motion and viewports 600px high or shorter use a static final ritual frame, normal document flow and no crossfade. The final available image falls back to an earlier usable image when needed.
- Images preserve their complete 4:3 composition with `object-fit: contain`. Stage dimensions remain reserved during loading; no crop or image-load height jump.
- Only the displayed image has descriptive alt text. Hidden layers are excluded from the accessibility tree; scroll does not trigger live-region announcements or move keyboard focus. Native page scrolling works with keyboard, touch and wheel.

## Changed implementation

- `src/components/packaging/packaging-reveal.tsx`: sequence, decoded-image handoff, nearby loading and static modes.
- `src/lib/packaging.ts`: legacy normalization and available-frame selection.
- `src/content/current-drop.ts`: six assets, Spanish descriptions and moment labels.
- `src/types/drop.ts`: provenance comment now permits owner-authorized generated frames.
- `src/app/page.tsx`: packaging composition/copy only.
- `src/app/globals.css`: packaging layout, crossfade, responsive and reduced-motion rules only.
- `tests/packaging.test.ts`, `tests/e2e/packaging.spec.ts`, packaging assertions in `tests/e2e/storefront.spec.ts`.

Hero, typography outside packaging, navigation, live stock, inventory, checkout, receipt, legal pages and backend boundaries are preserved. Version remains WEB V0.2 with this focused packaging milestone.

## Verification

Final command results are recorded in [implementation.md](implementation.md). Dedicated coverage checks all six moments and reverse/keyboard scroll at 390/430/768/1440px, image decoding, a failed frame, a delayed frame, complete asset failure, reduced motion, short viewports and automated WCAG A/AA. Existing storefront journeys remain in the full suite.

All six source assets were manually reviewed. Automated captures cover every moment at 390/430/768/1440px; manual inspection covers representative frames at each width and the static presentation. Crossfades preserve a stable image area; the opening/lid is fully visible in the main reveal, with deliberate tighter crops for seal and final interior detail. Generative imagery still needs replacement or confirmation against final production photography/renders before physical packaging is represented as delivered reality.
