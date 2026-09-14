'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import type { Contact, DemoOrder, Selection } from '@/types/drop';
import { currentDrop } from '@/content/current-drop';
const emptyContact: Contact = { name: '', phone: '', email: '', address: '' };
const defaultSelection: Selection = { quantity: 1, extras: [], fulfillment: 'delivery', zone: '', slot: '' };
type OrderContextValue = {
  selection: Selection; setSelection: (next: Selection) => void;
  contact: Contact; setContact: (next: Contact) => void;
  order: DemoOrder | null; setOrder: (next: DemoOrder) => void;
  clearContact: () => void;
};
const OrderContext = createContext<OrderContextValue | null>(null);
export function OrderProvider({ children }: { children: React.ReactNode }) {
  const [selection, updateSelection] = useState(defaultSelection);
  const [contact, setContact] = useState(emptyContact);
  const [order, setOrder] = useState<DemoOrder | null>(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('deipo-selection-v1') || 'null');
      if (saved && Number.isInteger(saved.quantity) && saved.quantity >= 1 && saved.quantity <= currentDrop.capacity) {
        // Hydrate only non-sensitive browser storage after SSR; one intentional sync.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        updateSelection({
          quantity: saved.quantity,
          extras: Array.isArray(saved.extras) ? saved.extras.filter((id: unknown) => currentDrop.extras.some(extra => extra.id === id)) : [],
          fulfillment: saved.fulfillment === 'pickup' ? 'pickup' : 'delivery',
          zone: currentDrop.fulfillment.zones.some(zone => zone.id === saved.zone) ? saved.zone : '',
          slot: currentDrop.fulfillment.slots.some(slot => slot.id === saved.slot) ? saved.slot : '',
        });
      }
    } catch { /* Storage can be unavailable; checkout still works in memory. */ }
  }, []);
  function setSelection(next: Selection) {
    updateSelection(next);
    try { sessionStorage.setItem('deipo-selection-v1', JSON.stringify(next)); } catch { /* Optional persistence. */ }
  }
  return <OrderContext.Provider value={{ selection, setSelection, contact, setContact, order, setOrder, clearContact: () => setContact(emptyContact) }}>{children}</OrderContext.Provider>;
}
export function useOrder() {
  const context = useContext(OrderContext);
  if (!context) throw new Error('OrderProvider is required.');
  return context;
}
