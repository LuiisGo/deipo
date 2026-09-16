'use client';
import { useDrop } from './drop-context';
import { DROP_TIME_ZONE, formatOpening, openingFor } from '@/lib/time';

export function OpeningInformation() {
  const { drop, status } = useDrop();
  const opening = openingFor(drop, status);
  const date = opening?.ordersOpenAt;
  return <div className="opening-information">
    <span className="eyebrow">APERTURA DE PEDIDOS</span>
    {date ? <time dateTime={date}>{formatOpening(opening)}</time> : <strong>{formatOpening(opening)}</strong>}
    <span className="caption">{date ? new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: DROP_TIME_ZONE }).format(new Date(date)) : 'FECHA POR CONFIRMAR'} · GUATEMALA</span>
  </div>;
}
