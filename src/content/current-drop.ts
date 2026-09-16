import type { Drop, DropStatus } from '@/types/drop';
const openingReference = { weekday: 2, time: '00:00' };

// DEMO CONTENT — REPLACE WITH REAL BACKEND DATA BEFORE PRODUCTION LAUNCH.
// 80 units / Friday closing / Saturday fulfillment: approved V0 specification.
// Q175 inclusive estimate and no per-order cap: user confirmed, 2026-09-13.
// Recipe and zone coverage remain demo content, pending validation.
// No launch date is confirmed. A real countdown starts only with a fixed deadline.
export const currentDrop: Drop = {
  id: 'drop-001', number: '001', slug: 'sunday-roast', name: 'SUNDAY ROAST',
  tagline: 'A CLASSIC, REIMAGINED.',
  description: 'Carne asada lentamente, papas doradas, pan de la casa, jus y crema de mostaza. Un ritual conocido, con algo más que contar.',
  // V0.2 fixture, not evidence of 13 actual business sales. In production these
  // fields represent confirmed units, configured/audited through DEIPO Admin.
  capacity: 80, prelaunchSoldUnits: 13, sold: 13, heldUnits: 0,
  status: 'active', price: 175, currency: 'GTQ',
  ordersOpenAt: null, openingReference,
  nextDropOpening: { ordersOpenAt: null, openingReference },
  salesCloseAt: null, closingReference: { weekday: 5, time: '23:59' },
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
  packagingFrames: [
    { src: '/drops/drop-001/packaging/frame-01-closed.webp', label: 'LA CAJA', alt: 'Caja deipo. cerrada, negra mate, con marca crema y sello naranja intacto.' },
    { src: '/drops/drop-001/packaging/frame-02-seal-detail.webp', label: 'EL SELLO', alt: 'Detalle del sello naranja DROP 001 — SUNDAY ROAST sobre la caja cerrada.' },
    { src: '/drops/drop-001/packaging/frame-03-crack-open.webp', label: 'LA PRIMERA APERTURA', alt: 'El sello se interrumpe y la tapa se levanta apenas, dejando ver el papel interior.' },
    { src: '/drops/drop-001/packaging/frame-04-half-open.webp', label: 'LO QUE VIENE', alt: 'Caja parcialmente abierta: aparecen el Sunday Roast, el papel crema y el insert.' },
    { src: '/drops/drop-001/packaging/frame-05-full-reveal.webp', label: 'GOOD THINGS. INSIDE.', alt: 'Caja abierta con roast beef, Yorkshire pudding, papas, vegetales y un insert deipo.' },
    { src: '/drops/drop-001/packaging/frame-06-final-ritual.webp', label: 'EL RITUAL', alt: 'Detalle del interior abierto: insert deipo., papel crema, caja negra y Sunday Roast.' },
  ],
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
      { id: '18-19', startsAt: '18:00', endsAt: '19:00', available: true },
      { id: '19-20', startsAt: '19:00', endsAt: '20:00', available: true },
      { id: '20-21', startsAt: '20:00', endsAt: '21:00', available: true },
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
    sold: status === 'sold_out' ? currentDrop.capacity : status === 'low_stock' ? currentDrop.capacity - 6 : currentDrop.sold,
    ordersOpenAt: params.opening === 'demo' ? '2026-09-15T00:00:00-06:00' : currentDrop.ordersOpenAt,
    // Fixed example deadline, never a reset-on-load or rolling countdown.
    salesCloseAt: params.clock === 'demo' ? '2026-09-19T05:59:00-00:00' : null,
    heroImage: params.image === 'missing' ? '/missing-demo-image.webp' : currentDrop.heroImage,
    fulfillment: { ...currentDrop.fulfillment, slots: currentDrop.fulfillment.slots.map(slot => ({ ...slot, available: params.slots !== 'none' })) },
  };
}
