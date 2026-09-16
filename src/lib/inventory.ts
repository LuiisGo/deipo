import type { InventorySnapshot } from '@/types/drop';

export function validateInventory(snapshot: InventorySnapshot): string[] {
  const errors: string[] = [];
  for (const key of ['capacity', 'prelaunchSoldUnits', 'sold', 'heldUnits'] as const) {
    if (!Number.isSafeInteger(snapshot[key]) || snapshot[key] < (key === 'capacity' ? 1 : 0)) errors.push(`${key} must be a ${key === 'capacity' ? 'positive' : 'non-negative'} safe integer.`);
  }
  if (snapshot.prelaunchSoldUnits > snapshot.capacity) errors.push('Pre-launch sales cannot exceed capacity.');
  if (snapshot.sold < snapshot.prelaunchSoldUnits) errors.push('Sold must include all confirmed pre-launch sales.');
  if (snapshot.sold > snapshot.capacity) errors.push('Sold cannot exceed capacity.');
  if (snapshot.sold + snapshot.heldUnits > snapshot.capacity) errors.push('Sold plus held cannot exceed capacity.');
  return errors;
}

// The only stock calculation. Production must inject an authoritative snapshot.
export function getInventory(snapshot: InventorySnapshot) {
  const errors = validateInventory(snapshot);
  if (errors.length) throw new RangeError(errors.join(' '));
  return {
    capacity: snapshot.capacity,
    prelaunchSoldUnits: snapshot.prelaunchSoldUnits,
    confirmedOnlineSoldUnits: snapshot.sold - snapshot.prelaunchSoldUnits,
    totalSold: snapshot.sold,
    heldUnits: snapshot.heldUnits,
    available: snapshot.capacity - snapshot.sold - snapshot.heldUnits,
    soldFraction: snapshot.sold / snapshot.capacity,
  };
}
