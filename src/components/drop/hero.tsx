'use client';
import { ArrowIcon } from '@/components/ui/arrow-icon';
import { DeipoLogo } from '@/components/brand/deipo-logo';
import { brand } from '@/content/brand';
import { useDrop } from './drop-context';
import { pad } from '@/lib/drop';
export function DropHero() {
  const { drop, status } = useDrop();
  const soldOut = status === 'sold_out';
  const closed = status === 'sales_closed';
  const upcoming = status === 'upcoming';
  return <section className={`brand-opening ${soldOut ? 'is-sold-out' : closed ? 'is-closed' : upcoming ? 'is-upcoming' : ''}`} aria-labelledby="drop-title">
    <div className="brand-stage page-grid">
      <DeipoLogo variant="hero" className="hero-wordmark" />
      <div className="brand-statement"><span className="eyebrow">{brand.tagline}</span><p>FOOD.<br />CULTURE.<br />SOMETHING TO<br />LOOK FORWARD TO.</p></div>
    </div>
    <div className="campaign-title page-grid">
      <div className="campaign-eyebrow eyebrow"><span>DROP {drop.number}</span><span>{soldOut ? `${pad(drop.sold)} / ${pad(drop.capacity)}` : 'EST. GUATEMALA'}</span></div>
      <h1 id="drop-title">{soldOut ? <>SOLD OUT<span className="brand-dot">.</span></> : closed ? <>ORDERS CLOSED<span className="brand-dot">.</span></> : upcoming ? <>COMING SOON<span className="brand-dot">.</span></> : drop.name}</h1>
      <div className="campaign-aside"><p>{soldOut ? `DROP ${drop.number} IS GONE.` : closed ? 'NOW, WE COOK.' : upcoming ? 'SOMETHING GOOD IS COMING.' : drop.tagline}</p><span className="short-rule" /><p>{soldOut ? 'SEE YOU NEXT DROP.' : closed ? 'LA VENTA CERRÓ.' : upcoming ? 'FECHA POR ANUNCIAR.' : `${drop.capacity} POR EDICIÓN / SOLO SÁBADO`}</p></div>
    </div>
    <div className="hero-baseline page-grid eyebrow"><span>{soldOut || closed ? 'LIMITED BY DESIGN.' : status === 'upcoming' ? 'PRÓXIMAMENTE · FECHA POR CONFIRMAR' : 'ONE DROP. ONE VERY GOOD EVENING.'}</span><a href={soldOut || closed ? '#next-drop' : '#product'}>{soldOut || closed ? 'EL PRÓXIMO CAPÍTULO' : 'CONOCÉ EL DROP'} <span aria-hidden="true"><ArrowIcon direction="down" /></span></a></div>
  </section>;
}
