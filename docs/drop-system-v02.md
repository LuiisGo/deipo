# DEIPO WEB V0.2 — Drop system and live signal

Continues V0.1 without changing the approved artwork, packaging sequence, four-step checkout or thermal receipt. No production backend, admin screens, payment or inventory writes were added. The owner-authorized fixture starts at **013 / 080 SOLD**. This demonstrates the contract for confirmed pre-launch sales; it does not assert that the business has already sold 13 units.

## Inventory contract

`Drop` extends the small `InventorySnapshot` contract. The only stock calculation lives in `src/lib/inventory.ts`.

| Field | Meaning |
| --- | --- |
| `capacity` | Positive integer sellable capacity |
| `prelaunchSoldUnits` | Confirmed sales completed before public ordering; future admin label: UNIDADES YA VENDIDAS |
| `sold` | Total confirmed sold snapshot, **already including** pre-launch sales |
| `heldUnits` | Units reserved temporarily; never publicly counted as sold |
| `ordersOpenAt` | Nullable current-drop opening timestamp, with explicit UTC offset |
| `salesCloseAt` | Nullable closing timestamp, with explicit UTC offset |
| `nextDropOpening` | Opening information for a separate future drop, not the closed drop's old timestamp |
| `openingReference` / `closingReference` | Working weekday/time references when calendar dates are unconfirmed |

The derived projection returns `confirmedOnlineSoldUnits = sold - prelaunchSoldUnits`, `totalSold = sold`, `available = capacity - sold - heldUnits` and `soldFraction`. Components and quantity validation consume that projection. They do not add pre-launch units to `sold` again.

Example: capacity 80, pre-launch 13, sold 40, held 4 produces online sold 27, available 36 and public **040 / 080 SOLD**. Holds reduce what can be selected but do not create a sold-out claim. Zero availability from holds is not sell-through.

Validation rejects non-integers, unsafe/non-finite values, non-positive capacity, negatives, pre-launch above capacity, sold below pre-launch, sold above capacity and sold plus held above capacity. Invalid snapshots throw explicitly; they are not silently clamped. `sold_out` with partial sales also fails explicitly.

## State and scheduling behavior

`getDropStatus` is the shared resolver for storefront and checkout. Full confirmed sell-through wins; an explicit close or elapsed deadline closes orders. A future opening gates ordering. A scheduled upcoming drop becomes active at its opening time. Low stock derives from available inventory. An upcoming drop with no opening timestamp remains upcoming.

| State | Public experience |
| --- | --- |
| Active | 013 / 080 initially, price, quantity, cutoff and GET THE DROP |
| Low stock | Actual remaining units, orange signal, no flashing or purchase notifications |
| Sold out | 080 / 080 and the existing complete archive / next-drop journey |
| Sales closed | ORDERS CLOSED / NOW, WE COOK; signal pivots to NEXT DROP and opening information, without the stale partial count |
| Upcoming | COMING SOON, NEXT DROP, centrally configured opening reference and notification form; no stock count or checkout |

Calendar dates remain null. **Tuesday 00:00 is a working reference**, shown as MARTES 00:00 with FECHA POR CONFIRMAR in the opening information. A real `ordersOpenAt` overrides that reference and adds its calendar date. No date is rolled forward or invented on page load. `nextDropOpening` can later be projected from the next scheduled admin record.

Routes serialize one server request timestamp into `DropProvider` for identical SSR/hydration state. When timestamps exist, the provider checks opening and closing boundaries once per second. Injecting a new schedule invalidates the previous clock snapshot. Checkout uses the same status resolver and rechecks closing after its asynchronous mock completion.

`src/lib/time.ts` owns strict HH:mm formatting, slot labels, weekday references and timestamp parsing. Guatemala's time zone is explicit and midnight formats as **00:00**, not 24:00. Slots store structured `startsAt` / `endsAt` values. Home logistics, cutoff fallback, slot options, review and receipt use **18:00 — 19:00**, **19:00 — 20:00**, **20:00 — 21:00** and **VIERNES 23:59**.

## Mobile signal

Below 768px, one persistent link starts expanded as a ruled second row in the header. After **260px** of document scroll it moves and narrows into the top row beside the logo; GET THE DROP reduces to GET DROP and the count becomes 013 / 080. Returning below **120px** expands it. The separate thresholds prevent repeated changes near the transition.

The same DOM link retains focus and its destination throughout. Top navigation links are hidden while compact and return with the expanded header; keyboard focus on the logo restores them. Focused keyboard navigation is not collapsed underneath the user. The compact signal remains at least 44px tall. Closed/upcoming compact signals show NEXT DROP and the short opening reference instead of old sales.

CSS animates position, width and header height over 320ms with the existing restrained easing. It uses no glass, blur, capsule or spring, and adds no animation dependency. One passive scroll listener batches through requestAnimationFrame; there are no new observers. Reduced motion changes state immediately. Desktop retains the original quiet persistent navigation signal.

The lower fixed stock bar and its reserved body gap are removed. Safe-area top spacing is supported. The optional Netlify badge stays below the signal; footer clearance is retained when its iframe exists. Hosting settings were not changed.

## Preview stock demonstration

**Implemented as explicit opt-in only:** `/?mode=preview&stock=drift`. It shows a visible SIMULACIÓN INTERNA notice. The controlled sequence is +1 at 12 seconds, +3 total at 24 seconds, +5 total at 36 seconds; then it stops. It respects available units and never exceeds capacity. Number transitions and the inline stock track consume the same snapshot.

`PreviewStockDemo` is separate from `DropProvider`. Customer-preview does not mount the simulation even if `stock=drift` is manually added. The default preview is also stable unless explicitly enabled. Timers are cleaned up; changing the fixture resets the internal test. The parameter is not carried into checkout. No customer names, locations, notifications, inventory writes or real sales are generated. A future production mode must never opt into this wrapper.

Additional internal schedule tools retain fixed dates: `opening=demo` is September 15, 2026 at 00:00 Guatemala; `clock=demo` closes September 18, 2026 at 23:59. These test fixtures are not business launch dates.

## Phase 2: DEIPO Admin and backend ownership

Future workflow: **Admin, drops, pre-launch sales, inventory, holds, slots, orders, verified payments, realtime, storefront.** This round defines the contract only.

Creating/editing a drop must support its number/name, capacity, UNIDADES YA VENDIDAS, price, opening/closing timestamps, fulfillment date/slots, status, product copy, images, packaging and delivery configuration. Admin should preview public availability and public sold presentation before publishing.

Illustrative admin inventory: capacity 80, pre-launch sold 13, online sold 0, held 0, available 67; public display 013 / 080 SOLD. Draft/scheduled/published workflow and permissions belong to future backend work. The current public status enum is not a complete admin lifecycle.

Supabase/PostgreSQL will own inventory and audit changes. Confirmed pre-launch records need provenance and must not be counted again when reconciling online payment/order records. Verified payments atomically convert held units to sold; failed/expired holds return to availability. Concurrent sessions receive the resulting snapshot through realtime. The browser, redirect URL and current mock checkout cannot confirm a sale or decrement inventory.

The existing data-injection boundary and `getInventory` projection let a future realtime adapter update the signal, quantities, state and stock track without redesigning them. Payment holds, transactions, idempotency, webhooks, authentication and admin CRUD are deliberately not implemented here.

## Verification and remaining limits

Exact results are recorded in [implementation.md](implementation.md). Coverage includes invalid stock, pre-launch arithmetic, held-versus-sold, opening/closing boundaries, all five states, 24-hour slots/receipt, stable customer-preview, bounded preview simulation, mobile transitions, focus, badge clearance, reduced motion and WCAG audits.

No production sales, launch date, final price, recipe, capacity validation, logistics, subscription or legal approval is implied. Q175 remains inclusive and estimated; quantity remains limited only by availability. Existing imagery and business validation limits remain unchanged from V0.1.
