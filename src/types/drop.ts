export type DropStatus = 'upcoming' | 'active' | 'low_stock' | 'sales_closed' | 'sold_out';
export type FulfillmentType = 'delivery' | 'pickup';
export interface Drop {
  id: string; number: string; slug: string; name: string; tagline: string;
  description: string; capacity: number; sold: number; status: DropStatus;
  price: number; currency: 'GTQ'; salesCloseAt: string | null;
  salesCloseLabel: string; fulfillmentDate: string | null; fulfillmentDay: string;
  maxQuantityPerOrder: number | null; lowStockThreshold: number; heroImage: string;
  includes: { name: string; description: string }[];
  extras: { id: string; name: string; price: number }[];
  packagingFrames: (string | PackagingFrame)[];
  fulfillment: {
    deliveryEnabled: boolean; pickupEnabled: boolean; pickupLabel: string;
    zones: { id: string; label: string; fee: number | null }[];
    slots: { id: string; label: string; available: boolean }[];
  };
}
export interface Selection { quantity: number; extras: string[]; fulfillment: FulfillmentType; zone: string; slot: string }
export interface Contact { name: string; phone: string; email: string; address: string }
export interface DemoOrder {
  id: string; createdAt: string; selection: Selection; contact: Contact;
  subtotal: number; deliveryFee: number; total: number; dropName: string; dropNumber: string;
  slotLabel: string; fulfillmentDay: string;
  items: { name: string; quantity: number; total: number }[];
}

// Only real supplied frames; labels describe the photographed state.
export type PackagingFrame = { src: string; alt: string; label: string };
