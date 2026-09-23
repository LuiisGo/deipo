'use client';
import type { ReactNode } from 'react';
import { useDrop } from './drop-context';
import { isPurchasable, pad } from '@/lib/drop';
import { DropCTA } from './controls';
import { PreviewOnly } from '@/components/ui/site-presentation';

export function CommerceOnly({ children }: { children: ReactNode }) {
  return isPurchasable(useDrop().status) ? children : null;
}
export function DropSection({ children }: { children: ReactNode }) {
  const { status } = useDrop();
  return <section id="the-drop" className={`drop-section page-grid ${isPurchasable(status) ? '' : 'drop-retrospective'}`}>{children}</section>;
}
export function DropSectionLabel() {
  const { drop, status } = useDrop();
  return <p className="eyebrow">{status === 'sold_out' ? `DROP ${drop.number} / ARCHIVE` : status === 'sales_closed' ? `DROP ${drop.number} / NOW, WE COOK` : status === 'upcoming' ? `DROP ${drop.number} / COMING SOON` : '01 / THE DROP'}</p>;
}
export function ArchiveNote() {
  const { drop, status } = useDrop();
  if (isPurchasable(status)) return null;
  if(status==='temporarily_unavailable')return <aside className="archive-note"><span className="eyebrow">CURRENTLY RESERVED.</span><p className="body-copy">Las unidades disponibles están reservadas temporalmente. Algunas podrían volver a estar disponibles pronto.</p></aside>;
  return <aside className="archive-note">
    <span className="eyebrow">{status === 'sold_out' ? 'LIMITED BY DESIGN.' : status === 'sales_closed' ? 'EL SIGUIENTE PASO ES EN LA COCINA.' : 'SOMETHING GOOD IS COMING.'}</span>
    <p className="archive-number">{status === 'sold_out' ? <>{pad(drop.capacity)}<span> / {pad(drop.capacity)}</span></> : status === 'sales_closed' ? 'NOW, WE COOK.' : 'WORTH THE WAIT.'}</p>
    <span className="eyebrow">{status === 'sold_out' ? `DROP ${drop.number} IS GONE.` : status === 'sales_closed' ? 'LA VENTA CERRÓ. EL RITUAL SIGUE.' : 'FECHA POR ANUNCIAR.'}</span>
    <p className="body-copy">{status === 'sold_out' ? 'Así se ve una edición que llegó a su fin. La mesa cambia. Las ganas de volver, no.' : status === 'sales_closed' ? 'Llegó el momento de dedicarle tiempo a cada detalle.' : 'Un primer vistazo a lo que estamos preparando. Los detalles llegan antes de abrir pedidos.'}</p>
    <PreviewOnly><p className="caption">Estado de presentación. No representa ventas ni pedidos reales.</p></PreviewOnly>
  </aside>;
}
export function NextChapter() {
  const { status, drop } = useDrop();
  if (isPurchasable(status)) return null;
  return <section className="next-chapter page-grid"><p className="eyebrow">{status === 'sold_out' ? `END OF DROP ${drop.number}.` : 'A MORE INTERESTING TABLE AWAITS.'}</p><h2>{status === 'upcoming' ? <>GOOD FOOD<br />AHEAD<span className="brand-dot">.</span></> : <>NEXT DROP<br />SOON<span className="brand-dot">.</span></>}</h2><div><p className="body-copy">{status === 'sold_out' ? 'Esta edición termina aquí. Nos vemos en la próxima.' : 'Lo bueno merece un momento.'}</p><DropCTA /></div></section>;
}
