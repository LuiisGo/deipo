import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentDrop, getPreviewDrop } from '../src/content/current-drop';
import { getInventory, validateInventory } from '../src/lib/inventory';
import { getDropStatus, quantityLimit } from '../src/lib/drop';
import { formatOpening, formatSlot, formatTime24, formatWeeklyTime, openingFor, timestamp } from '../src/lib/time';

test('pre-launch units begin the public snapshot without being counted twice', () => {
  assert.equal(currentDrop.prelaunchSoldUnits, 13);
  assert.equal(getInventory(currentDrop).totalSold, 13);
  assert.equal(getInventory(currentDrop).confirmedOnlineSoldUnits, 0);
  assert.equal(getInventory(currentDrop).available, 67);
  assert.equal(getPreviewDrop({ state: 'upcoming' }).sold, 13);
  assert.equal(getInventory({ ...currentDrop, sold: 15 }).confirmedOnlineSoldUnits, 2);
});
test('held inventory reduces availability but never becomes publicly sold', () => {
  const snapshot = { ...currentDrop, sold: 40, heldUnits: 4 };
  assert.deepEqual(getInventory(snapshot), { capacity: 80, prelaunchSoldUnits: 13, confirmedOnlineSoldUnits: 27, totalSold: 40, heldUnits: 4, available: 36, soldFraction: .5 });
  assert.equal(quantityLimit(snapshot), 36);
  const held = { ...snapshot, heldUnits: 40 };
  assert.equal(getInventory(held).totalSold, 40);
  assert.equal(quantityLimit(held), 0);
  assert.notEqual(getDropStatus(held), 'sold_out');
});
test('impossible inventory fails explicitly instead of clamping or manufacturing sales', () => {
  for (const patch of [
    { capacity: 0 }, { capacity: -1 }, { capacity: 80.5 }, { capacity: NaN },
    { prelaunchSoldUnits: -1 }, { prelaunchSoldUnits: 81 }, { prelaunchSoldUnits: .5 },
    { sold: 12 }, { sold: 81 }, { sold: Infinity }, { heldUnits: -1 }, { heldUnits: .5 }, { heldUnits: 68 },
  ]) {
    assert.ok(validateInventory({ ...currentDrop, ...patch }).length);
    assert.throws(() => getInventory({ ...currentDrop, ...patch }), RangeError);
  }
  assert.deepEqual(validateInventory(currentDrop), []);
  assert.throws(() => getDropStatus({ ...currentDrop, status: 'sold_out' }), /sell-through/);
});
test('one schedule gates before opening, opens at the boundary and closes at the deadline', () => {
  const drop = { ...currentDrop, status: 'upcoming' as const, ordersOpenAt: '2026-09-15T00:00:00-06:00', salesCloseAt: '2026-09-18T23:59:00-06:00' };
  const opening = Date.parse(drop.ordersOpenAt);
  const closing = Date.parse(drop.salesCloseAt);
  assert.equal(getDropStatus(drop, opening - 1), 'upcoming');
  assert.equal(getDropStatus(drop, opening), 'active');
  assert.equal(getDropStatus(drop, closing - 1), 'active');
  assert.equal(getDropStatus(drop, closing), 'sales_closed');
  assert.equal(getDropStatus({ ...drop, sold: 80 }, closing), 'sold_out');
  assert.equal(getDropStatus({ ...drop, status: 'sales_closed' }, opening), 'sales_closed');
  assert.throws(() => getDropStatus({ ...drop, salesCloseAt: drop.ordersOpenAt }), /close after/);
  assert.throws(() => getDropStatus({ ...drop, ordersOpenAt: 'next Tuesday' }), /ISO/);
});
test('opening presentation selects the correct drop and respects Guatemala midnight', () => {
  assert.equal(currentDrop.ordersOpenAt, null);
  assert.equal(currentDrop.nextDropOpening?.ordersOpenAt, null);
  assert.equal(formatOpening(openingFor(currentDrop, 'upcoming')), 'MARTES 00:00');
  assert.equal(formatOpening(openingFor(currentDrop, 'sales_closed'), true), 'MAR 00:00');
  const scheduled = { ordersOpenAt: '2026-09-15T06:00:00Z', openingReference: null };
  assert.equal(formatOpening(scheduled), 'MARTES 00:00');
  assert.equal(formatOpening({ ...scheduled, ordersOpenAt: '2026-09-15T05:59:00Z' }), 'LUNES 23:59');
  assert.equal(formatOpening(null), 'POR ANUNCIAR');
});
test('all slot labels and references share strict 24-hour formatting', () => {
  assert.deepEqual(currentDrop.fulfillment.slots.map(formatSlot), ['18:00 — 19:00', '19:00 — 20:00', '20:00 — 21:00']);
  assert.equal(formatWeeklyTime(currentDrop.closingReference), 'VIERNES 23:59');
  assert.equal(formatTime24('00:00'), '00:00');
  for (const time of ['24:00', '9:00', '12:60', '6 PM', '23:99']) assert.throws(() => formatTime24(time));
  for (const date of ['2026-09-15', '2026-09-15T00:00:00', 'invalid']) assert.throws(() => timestamp(date));
});
