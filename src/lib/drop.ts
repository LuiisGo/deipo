import type { Drop, DropStatus, Selection } from '@/types/drop';
import { getInventory } from './inventory';
import { timestamp } from './time';
export const money = (amount: number) => `Q${amount.toFixed(2)}`;
export const pad = (value: number) => String(value).padStart(3, '0');
export function getDropStatus(drop: Drop, now = Date.now()): DropStatus {
  const inventory = getInventory(drop);
  const opens = drop.ordersOpenAt ? timestamp(drop.ordersOpenAt) : null;
  const closes = drop.salesCloseAt ? timestamp(drop.salesCloseAt) : null;
  if (opens !== null && closes !== null && closes <= opens) throw new RangeError('Orders must close after opening.');
  if (inventory.totalSold === inventory.capacity) return 'sold_out';
  if (drop.status === 'sold_out') throw new RangeError('Sold-out status requires confirmed sell-through of the full capacity.');
  if (drop.status === 'sales_closed' || (closes !== null && closes <= now)) return 'sales_closed';
  if ((opens !== null && now < opens) || (drop.status === 'upcoming' && opens === null)) return 'upcoming';
  if (inventory.available === 0 && inventory.heldUnits > 0) return 'temporarily_unavailable';
  if (inventory.available <= drop.lowStockThreshold) return 'low_stock';
  return 'active';
}
export const isPurchasable = (status: DropStatus) => status === 'active' || status === 'low_stock';
export const quantityLimit = (drop: Drop) => Math.min(drop.maxQuantityPerOrder ?? Infinity, getInventory(drop).available);
export function validateQuantity(quantity: number, drop: Drop) {
  if (!Number.isInteger(quantity) || quantity < 1) return 'Elegí al menos un drop.';
  if (quantity > quantityLimit(drop)) return `Quedan ${quantityLimit(drop)} drops disponibles. Ajustá la cantidad para continuar.`;
  return null;
}
export function totals(drop: Drop, selection: Selection) {
  const extraTotal = drop.extras.filter(extra => selection.extras.includes(extra.id)).reduce((sum, extra) => sum + extra.price, 0);
  const subtotal = drop.price * selection.quantity + extraTotal;
  const deliveryFee = selection.fulfillment === 'pickup' ? 0 : drop.fulfillment.zones.find(zone => zone.id === selection.zone)?.fee ?? null;
  return { subtotal, deliveryFee, total: deliveryFee === null ? null : subtotal + deliveryFee };
}
export function validateFulfillment(drop: Drop, selection: Selection, address: string) {
  if (selection.fulfillment === 'delivery' && !drop.fulfillment.deliveryEnabled) return 'La entrega no está disponible. Elegí recoger.';
  if (selection.fulfillment === 'pickup' && !drop.fulfillment.pickupEnabled) return 'Recoger no está disponible. Elegí entrega.';
  if (selection.fulfillment === 'delivery' && address.trim().length < 8) return 'Ingresá una dirección completa para la entrega.';
  if (totals(drop, selection).deliveryFee === null) return 'La cobertura o tarifa de esa zona está por confirmar. Elegí recoger para continuar la prueba.';
  if (!drop.fulfillment.slots.some(slot => slot.id === selection.slot && slot.available)) return 'Elegí un horario disponible para el sábado.';
  return null;
}
