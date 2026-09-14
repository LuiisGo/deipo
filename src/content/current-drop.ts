import type { Drop, DropStatus } from '@/types/drop';

// DEMO CONTENT — REPLACE WITH REAL BACKEND DATA BEFORE PRODUCTION LAUNCH.
// 80 units / Friday closing / Saturday fulfillment: approved V0 specification.
// Q175 inclusive estimate and no per-order cap: user confirmed, 2026-09-13.
// Recipe and zone coverage remain demo content, pending validation.
// No launch date is confirmed. A real countdown starts only with a fixed deadline.
export const currentDrop: Drop = {
  id: 'drop-001', number: '001', slug: 'sunday-roast', name: 'SUNDAY ROAST',
  tagline: 'A CLASSIC, REIMAGINED.',
  description: 'Carne asada lentamente, papas doradas, pan de la casa, jus y crema de mostaza. Un ritual conocido, con algo más que contar.',
  capacity: 80, sold: 40, status: 'active', price: 175, currency: 'GTQ',
  salesCloseAt: null, salesCloseLabel: 'FRIDAY AT 11:59 PM',
  fulfillmentDate: null, fulfillmentDay: 'SATURDAY',
  maxQuantityPerOrder: null, lowStockThreshold: 8,
  heroImage: '/drops/drop-001/sunday-roast.webp',
  includes: [
    { name: 'SLOW-ROASTED BEEF', description: 'Asado intenso. Centro suave.' },
    { name: 'ROAST POTATOES', description: 'Orillas doradas. Suaves por dentro.' },
    { name: 'HOUSE BREAD', description: 'Para no dejar ni una gota de jus.' },
    { name: 'JUS + MUSTARD CREAM', description: 'Los detalles que lo completan.' },
  ],
  extras: [],
  packagingFrames: ['/packaging/black-box.webp'],
  fulfillment: {
    deliveryEnabled: true, pickupEnabled: true,
    pickupLabel: 'Zona 10 · dirección exacta por confirmar',
    zones: [
      { id: 'zone-10', label: 'Zona 10 · cobertura de prueba', fee: 0 },
      { id: 'zone-14', label: 'Zona 14 · cobertura de prueba', fee: 0 },
      { id: 'zone-15', label: 'Zona 15 · cobertura de prueba', fee: 0 },
      { id: 'outside', label: 'Otra zona · cobertura por confirmar', fee: null },
    ],
    slots: [
      { id: '18-19', label: '6:00–7:00 PM', available: true },
      { id: '19-20', label: '7:00–8:00 PM', available: true },
      { id: '20-21', label: '8:00–9:00 PM', available: true },
    ],
  },
};
export const previewStates: DropStatus[] = ['active', 'low_stock', 'sold_out', 'sales_closed', 'upcoming'];
export type PreviewParams = Record<string, string | string[] | undefined>;
export function getPreviewDrop(params: PreviewParams): Drop {
  const requested = typeof params.state === 'string' ? params.state : '';
  const status = previewStates.includes(requested as DropStatus) ? requested as DropStatus : currentDrop.status;
  return {
    ...currentDrop, status,
    sold: status === 'sold_out' ? 80 : status === 'low_stock' ? 74 : status === 'upcoming' ? 0 : currentDrop.sold,
    // Fixed example deadline, never a reset-on-load or rolling countdown.
    salesCloseAt: params.clock === 'demo' ? '2026-09-19T05:59:00-00:00' : null,
    heroImage: params.image === 'missing' ? '/missing-demo-image.webp' : currentDrop.heroImage,
    fulfillment: { ...currentDrop.fulfillment, slots: currentDrop.fulfillment.slots.map(slot => ({ ...slot, available: params.slots !== 'none' })) },
  };
}
