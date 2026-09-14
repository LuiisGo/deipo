import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentDrop, getPreviewDrop } from '../src/content/current-drop';
import { getDropStatus, quantityLimit, totals, validateFulfillment, validateQuantity } from '../src/lib/drop';
import { completeDemoCheckout, validateContact } from '../src/lib/demo-services';
import { configureAnalytics, track } from '../src/lib/analytics';
import type { Selection } from '../src/types/drop';
const selection: Selection = { quantity: 2, extras: [], fulfillment: 'pickup', zone: '', slot: '19-20' };
const contact = { name: 'Prueba deipo', phone: '+502 5555 1234', email: 'preview@example.com', address: '' };

test('quantity is limited only by real availability when the per-order cap is null', () => {
  assert.equal(currentDrop.maxQuantityPerOrder, null);
  assert.equal(quantityLimit(currentDrop), 40);
  assert.equal(validateQuantity(10, currentDrop), null);
  assert.notEqual(validateQuantity(41, currentDrop), null);
  for (const value of [0, -1, 1.5, NaN, Infinity]) assert.notEqual(validateQuantity(value, currentDrop), null);
  assert.equal(quantityLimit({ ...currentDrop, sold: 81 }), 0);
});
test('all-inclusive Q175 produces correct totals without hidden extras', () => {
  assert.equal(currentDrop.extras.length, 0);
  assert.deepEqual(totals(currentDrop, selection), { subtotal: 350, deliveryFee: 0, total: 350 });
  assert.equal(totals(currentDrop, { ...selection, fulfillment: 'delivery', zone: 'zone-10' }).total, 350);
  assert.equal(totals(currentDrop, { ...selection, fulfillment: 'delivery', zone: 'outside' }).total, null);
});
test('fixed Guatemala cutoff closes orders at Friday 23:59 UTC-6, never resets', () => {
  const drop = getPreviewDrop({ clock: 'demo' });
  const deadline = Date.parse('2026-09-18T23:59:00-06:00');
  assert.equal(Date.parse(drop.salesCloseAt!), deadline);
  assert.equal(getDropStatus(drop, deadline - 1), 'active');
  assert.equal(getDropStatus(drop, deadline), 'sales_closed');
  assert.equal(getDropStatus(drop, deadline + 7 * 86400000), 'sales_closed');
  assert.equal(currentDrop.salesCloseAt, null);
});
test('sold out takes precedence and low stock comes from inventory', () => {
  assert.equal(getDropStatus({ ...currentDrop, sold: 80, salesCloseAt: '2020-01-01' }), 'sold_out');
  assert.equal(getDropStatus({ ...currentDrop, sold: 74 }), 'low_stock');
  assert.equal(getPreviewDrop({ state: 'unknown' }).status, 'active');
});
test('fulfillment rejects unavailable slots, unknown fees, and missing addresses', () => {
  assert.equal(validateFulfillment(currentDrop, selection, ''), null);
  assert.notEqual(validateFulfillment(getPreviewDrop({ slots: 'none' }), selection, ''), null);
  assert.notEqual(validateFulfillment(currentDrop, { ...selection, fulfillment: 'delivery', zone: 'zone-10' }, ''), null);
  assert.notEqual(validateFulfillment(currentDrop, { ...selection, fulfillment: 'delivery', zone: 'outside' }, 'Test address 100'), null);
});
test('mock checkout keeps totals and receipt linked without mutating stock', async () => {
  const sold = currentDrop.sold;
  const result = await completeDemoCheckout(currentDrop, selection, contact);
  assert.equal(result.ok, true);
  if (result.ok) { assert.equal(result.order.total, 350); assert.equal(result.order.contact.name, contact.name); assert.match(result.order.id, /^DEMO-/); assert.equal(result.order.slotLabel, '7:00–8:00 PM'); }
  assert.equal(currentDrop.sold, sold);
});
test('sold-out, expired, malformed contact and simulated payment failure cannot produce receipts', async () => {
  assert.equal((await completeDemoCheckout(getPreviewDrop({ state: 'sold_out' }), selection, contact)).ok, false);
  assert.equal((await completeDemoCheckout({ ...currentDrop, salesCloseAt: '2000-01-01' }, selection, contact)).ok, false);
  assert.notEqual(validateContact({ ...contact, phone: '........' }), null);
  assert.notEqual(validateContact({ ...contact, email: 'not-an-email' }), null);
  assert.equal((await completeDemoCheckout(currentDrop, selection, contact, true)).ok, false);
});
test('analytics drops unexpected PII at runtime and survives adapter failures', () => {
  let payload: unknown;
  configureAnalytics((_, properties) => { payload = properties; });
  track('submit_contact', { drop_id: 'drop-001', email: contact.email, phone: contact.phone } as Parameters<typeof track>[1]);
  assert.deepEqual(payload, { drop_id: 'drop-001' });
  configureAnalytics(() => { throw new Error('offline'); });
  assert.doesNotThrow(() => track('view_drop'));
  configureAnalytics();
});
