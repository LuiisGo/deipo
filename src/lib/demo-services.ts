import { formatSlot } from './time';
import type { Contact, DemoOrder, Drop, Selection } from '@/types/drop';
import { getDropStatus, isPurchasable, totals, validateFulfillment, validateQuantity } from './drop';

export type CheckoutResult = { ok: true; order: DemoOrder } | { ok: false; message: string };
export function validateContact(contact: Contact) {
  if (contact.name.trim().length < 2 || contact.name.length > 100) return 'Ingresá tu nombre.';
  if (!/^[+0-9() .-]{8,20}$/.test(contact.phone) || contact.phone.replace(/\D/g, '').length < 8) return 'Ingresá un teléfono válido, con al menos 8 dígitos.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email) || contact.email.length > 254) return 'Ingresá un correo válido.';
  return null;
}
// Replace with server-created holds + Recurrente and verified server order status.
// This function never takes payment, persists contact data or changes inventory.
export async function completeDemoCheckout(drop: Drop, selection: Selection, contact: Contact, fail = false): Promise<CheckoutResult> {
  const error = validateQuantity(selection.quantity, drop) || validateFulfillment(drop, selection, contact.address) || validateContact(contact);
  if (!isPurchasable(getDropStatus(drop))) return { ok: false, message: 'Este drop ya no recibe pedidos. Te esperamos en el próximo.' };
  if (error) return { ok: false, message: error };
  const price = totals(drop, selection);
  if (price.total === null || price.deliveryFee === null) return { ok: false, message: 'La tarifa de entrega está pendiente.' };
  await new Promise(resolve => setTimeout(resolve, 700));
  if (fail) return { ok: false, message: 'El pago de prueba no se completó. No se realizó ningún cobro. Podés volver a intentarlo.' };
  // Check expiration again after the asynchronous payment simulation.
  if (!isPurchasable(getDropStatus(drop))) return { ok: false, message: 'El período de pedidos terminó. No se realizó ningún cobro.' };
  return { ok: true, order: {
    id: `DEMO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, createdAt: new Date().toISOString(),
    selection: { ...selection, extras: [...selection.extras] }, contact: { ...contact },
    subtotal: price.subtotal, deliveryFee: price.deliveryFee, total: price.total,
    dropName: drop.name, dropNumber: drop.number,
    fulfillmentDay: drop.fulfillmentDate ?? 'Sábado · fecha por confirmar',
    slotLabel: formatSlot(drop.fulfillment.slots.find(slot => slot.id === selection.slot)!),
    items: [{ name: drop.name, quantity: selection.quantity, total: drop.price * selection.quantity },
      ...drop.extras.filter(extra => selection.extras.includes(extra.id)).map(extra => ({ name: extra.name, quantity: 1, total: extra.price }))],
  } };
}
