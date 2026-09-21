'use client';
import { ArrowIcon } from '@/components/ui/arrow-icon';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useDrop } from './drop-context';
import { useOrder } from '@/components/checkout/order-context';
import { isPurchasable, pad, quantityLimit, money } from '@/lib/drop';
import { track } from '@/lib/analytics';
import { PreviewOnly, useSiteMode } from '@/components/ui/site-presentation';
import type { Drop } from '@/types/drop';
import { formatOpening, formatWeeklyTime, openingFor } from '@/lib/time';

export function usePreviewHref(path: string) {
  const params = useSearchParams();
  const mode = useSiteMode();
  const next = new URLSearchParams();
  if (mode === 'admin-preview') return '#next-drop';
  if (mode === 'production') return '/checkout';
  for (const key of ['state', 'clock', 'opening', 'slots', 'payment', 'mode', 'image']) if (params.get(key)) next.set(key, params.get(key)!);
  return `${path}${next.size ? `?${next}` : ''}`;
}
export function LiveStockIndicator({ inline = false }: { inline?: boolean }) {
  const { drop, status, inventory } = useDrop();
  const href = usePreviewHref('/checkout');
  const available = isPurchasable(status) && inventory.available > 0;
  const mode = useSiteMode();
  const opening = openingFor(drop, status);
  const showCount = available || status === 'sold_out';
  const label = status === 'sold_out' ? 'SOLD OUT' : status === 'sales_closed' ? 'ORDERS CLOSED' : status === 'upcoming' ? 'NEXT DROP' : status === 'low_stock' ? `${inventory.available === 1 ? 'QUEDA' : 'QUEDAN'} ${inventory.available}` : 'GET THE DROP';
  const context = showCount ? `${inventory.totalSold} de ${inventory.capacity} vendidos` : `${label}. Apertura ${formatOpening(opening)}${opening?.ordersOpenAt ? '' : ', fecha por confirmar'}`;
  return <Link href={available ? href : '#next-drop'} className={`stock-indicator ${inline ? 'stock-inline' : ''}`} data-stock-status={status} aria-label={`${context}. ${mode === 'preview' ? 'Stock de prueba. ' : ''}${available ? 'Ir al checkout de prueba' : 'Próximo drop'}`}>
    <span className="stock-state"><i aria-hidden="true" />{available && status === 'low_stock' && <span className="low-stock-label">{label}</span>}<span className="stock-action">{available ? <>GET <span className="stock-full-word">THE </span>DROP</> : 'NEXT DROP'}</span></span>
    <span className="stock-count" aria-live={inline ? undefined : 'polite'} aria-atomic="true">{showCount ? <><span className="stock-sold" key={inventory.totalSold}>{pad(inventory.totalSold)}</span> <span>/ {pad(inventory.capacity)}</span><span className="stock-full-word"> SOLD</span></> : <><span className="stock-opening-full">{status === 'sales_closed' ? 'ORDERS CLOSED' : formatOpening(opening)}</span><span className="stock-opening-short">{formatOpening(opening, true)}</span></>}<PreviewOnly><small>DEMO</small></PreviewOnly></span>
    <span className="stock-arrow" aria-hidden="true"><ArrowIcon /></span>
  </Link>;
}
export function StockProgress() {
  const { inventory } = useDrop();
  return <div className="stock-track" aria-hidden="true"><span style={{ width: `${inventory.soldFraction * 100}%` }} /></div>;
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
  if (!isPurchasable(status)) return null;
  return <div className="countdown">
    <span className="eyebrow">CIERRE DE PEDIDOS</span>
    <strong>{clock ?? formatWeeklyTime(drop.closingReference)}</strong>
    <PreviewOnly><span className="caption">{drop.salesCloseAt ? 'FECHA DE PRUEBA · GUATEMALA, UTC−6' : 'Guatemala, UTC−6 · fecha por confirmar'}</span></PreviewOnly>
  </div>;
}
export function DropCTA({ className = '', children }: { className?: string; children?: React.ReactNode }) {
  const { drop, status } = useDrop();
  const href = usePreviewHref('/checkout');
  const canOrder = isPurchasable(status) && quantityLimit(drop) > 0;
  return <Link className={`button ${className}`} href={canOrder ? href : '#next-drop'} onClick={() => { if (canOrder) track('click_get_drop', { drop_id: drop.id }); }}>
    {children ?? (canOrder ? 'GET THE DROP' : 'NEXT DROP')}<span aria-hidden="true"><ArrowIcon /></span>
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
  if (!isPurchasable(status)) return null;
  if (drop.source) return <p className="caption purchase-note">Pedidos online todavía no habilitados.</p>;
  if (quantityLimit(drop) === 0) return <p className="caption">No hay unidades disponibles en este momento.</p>;
  return <><div className="quantity-row"><span className="eyebrow">CANTIDAD</span><QuantityControl drop={drop} /></div>{drop.extras.length > 0 && <Extras drop={drop} />}<DropCTA /><PreviewOnly><p className="caption purchase-note">Checkout de prueba. Sin cobro. Sin reserva.</p></PreviewOnly></>;
}
