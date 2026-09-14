type EventName = 'view_drop' | 'view_product' | 'view_price' | 'click_get_drop' | 'begin_checkout' | 'select_quantity' | 'select_fulfillment' | 'select_slot' | 'submit_contact' | 'checkout_complete' | 'waitlist_submit' | 'sold_out_view';
type SafeProperties = { drop_id?: string; quantity?: number; fulfillment?: 'delivery' | 'pickup'; slot_id?: string; status?: string };
type AnalyticsAdapter = (event: EventName, properties: SafeProperties) => void;
let adapter: AnalyticsAdapter | undefined;
// Install a consent-aware GA/Meta adapter here later. V0 is deliberately a no-op.
export const analyticsIds = { ga: process.env.NEXT_PUBLIC_GA_ID, meta: process.env.NEXT_PUBLIC_META_PIXEL_ID };
export function configureAnalytics(next?: AnalyticsAdapter) { adapter = next; }
export function track(event: EventName, properties: SafeProperties = {}) {
  // Runtime allowlist also prevents accidental PII from untyped integrations.
  const safe: SafeProperties = {};
  const keys = ['drop_id', 'quantity', 'fulfillment', 'slot_id', 'status'] as const;
  for (const key of keys) if (properties[key] !== undefined) Object.assign(safe, { [key]: properties[key] });
  try { adapter?.(event, safe); } catch { /* Analytics must never block ordering. */ }
}
