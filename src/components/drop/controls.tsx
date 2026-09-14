'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useDrop } from './drop-context';
import { useOrder } from '@/components/checkout/order-context';
import { isPurchasable, pad, quantityLimit, money } from '@/lib/drop';
import { track } from '@/lib/analytics';
import type { Drop } from '@/types/drop';

export function usePreviewHref(path: string) {
  const params = useSearchParams();
  const next = new URLSearchParams();
  for (const key of ['state', 'clock', 'slots', 'payment']) if (params.get(key)) next.set(key, params.get(key)!);
  return `${path}${next.size ? `?${next}` : ''}`;
}
export function LiveStockIndicator({ inline = false }: { inline?: boolean }) {
  const { drop, status } = useDrop();
  const href = usePreviewHref('/checkout');
  const available = isPurchasable(status);
  const label = status === 'sold_out' ? 'SOLD OUT' : status === 'sales_closed' ? 'PEDIDOS CERRADOS' : status === 'upcoming' ? 'PRÓXIMAMENTE' : status === 'low_stock' ? `QUEDAN ${drop.capacity - drop.sold}` : 'VISTA PREVIA';
  return <Link href={available ? href : '#next-drop'} className={`stock-indicator ${inline ? 'stock-inline' : ''}`} aria-label={`${label}. ${drop.sold} of ${drop.capacity} sold in this demo. ${available ? 'Go to checkout' : 'Next drop'}`}>
    <span className="stock-state"><i aria-hidden="true" />{label}</span>
    <span className="stock-count">{pad(drop.sold)} <span>/ {pad(drop.capacity)}</span> SOLD <small>DEMO</small></span>
    <span className="stock-arrow" aria-hidden="true">↗</span>
  </Link>;
}
export function Countdown() {
  const { drop, status } = useDrop();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!drop.salesCloseAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [drop.salesCloseAt]);
  const remaining = drop.salesCloseAt && now ? Math.max(0, Math.floor((Date.parse(drop.salesCloseAt) - now) / 1000)) : null;
  const clock = remaining === null ? null : `${String(Math.floor(remaining / 3600)).padStart(2, '0')} : ${String(Math.floor(remaining / 60) % 60).padStart(2, '0')} : ${String(remaining % 60).padStart(2, '0')}`;
  return <div className="countdown">
    <span className="eyebrow">{status === 'sales_closed' ? 'PEDIDOS CERRADOS' : 'CIERRE DE PEDIDOS'}</span>
    <strong>{clock ?? 'VIERNES A LAS 11:59 PM'}</strong>
    <span className="caption">{drop.salesCloseAt ? 'FECHA DE PRUEBA · GUATEMALA, UTC−6' : 'Guatemala, UTC−6 · fecha por confirmar'}</span>
  </div>;
}
export function DropCTA({ className = '', children }: { className?: string; children?: React.ReactNode }) {
  const { drop, status } = useDrop();
  const href = usePreviewHref('/checkout');
  const canOrder = isPurchasable(status);
  return <Link className={`button ${className}`} href={canOrder ? href : '#next-drop'} onClick={() => { if (canOrder) track('click_get_drop', { drop_id: drop.id }); }}>
    {children ?? (canOrder ? 'GET THE DROP' : 'PRÓXIMO DROP')}<span aria-hidden="true">↗</span>
  </Link>;
}
export function QuantityControl({ drop }: { drop: Drop }) {
  const { selection, setSelection } = useOrder();
  const max = quantityLimit(drop);
  function update(quantity: number) {
    setSelection({ ...selection, quantity });
    track('select_quantity', { drop_id: drop.id, quantity });
  }
  return <div className="quantity-control" role="group" aria-label="Cantidad de drops">
    <button type="button" aria-label="Reducir cantidad" disabled={selection.quantity <= 1} onClick={() => update(selection.quantity - 1)}>−</button>
    <output aria-label="Cantidad" aria-live="polite">{selection.quantity}</output>
    <button type="button" aria-label="Aumentar cantidad" disabled={selection.quantity >= max} onClick={() => update(selection.quantity + 1)}>+</button>
  </div>;
}
export function Extras({ drop }: { drop: Drop }) {
  const { selection, setSelection } = useOrder();
  return <fieldset className="extras"><legend className="eyebrow">A LITTLE EXTRA <span> / per order</span></legend>
    {drop.extras.map(extra => <label className="check-row" key={extra.id}><input type="checkbox" checked={selection.extras.includes(extra.id)} onChange={event => setSelection({ ...selection, extras: event.target.checked ? [...selection.extras, extra.id] : selection.extras.filter(id => id !== extra.id) })} /><span>{extra.name}</span><span>{money(extra.price)}</span></label>)}
  </fieldset>;
}
export function PurchaseControls() {
  const { drop, status } = useDrop();
  if (!isPurchasable(status)) return <div className="purchase-closed"><span className="eyebrow">{status.replaceAll('_', ' ')}</span><p>Esta edición ya no recibe pedidos.</p><DropCTA /></div>;
  return <><div className="quantity-row"><span className="eyebrow">CANTIDAD</span><QuantityControl drop={drop} /></div>{drop.extras.length > 0 && <Extras drop={drop} />}<DropCTA /><p className="caption purchase-note">Checkout de prueba. Sin cobro. Sin reserva.</p></>;
}
