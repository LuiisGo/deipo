import type { Drop, DropStatus, Selection } from '@/types/drop';
export const money = (amount: number) => `Q${amount.toFixed(2)}`;
export const pad = (value: number) => String(value).padStart(3, '0');
export function getDropStatus(drop: Drop, now = Date.now()): DropStatus {
  if (drop.sold >= drop.capacity || drop.status === 'sold_out') return 'sold_out';
  if (drop.status === 'sales_closed' || (drop.salesCloseAt && Date.parse(drop.salesCloseAt) <= now)) return 'sales_closed';
  if (drop.status === 'upcoming') return 'upcoming';
  if (drop.capacity - drop.sold <= drop.lowStockThreshold) return 'low_stock';
  return drop.status;
}
export const isPurchasable = (status: DropStatus) => status === 'active' || status === 'low_stock';
export const quantityLimit = (drop: Drop) => Math.max(0, Math.min(drop.maxQuantityPerOrder ?? Infinity, drop.capacity - drop.sold));
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
