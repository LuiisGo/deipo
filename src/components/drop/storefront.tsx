import { Suspense } from 'react';
import type { PreviewParams } from '@/content/current-drop';
import type { Drop } from '@/types/drop';
import type { SiteMode } from '@/lib/site-mode';
import { brand, campaign } from '@/content/brand';
import { PreviewStockDemo } from '@/components/drop/preview-stock-demo';
import { Navigation } from '@/components/layout/navigation';
import { Footer } from '@/components/layout/footer';
import { DropHero } from '@/components/drop/hero';
import { Media } from '@/components/ui/media';
import { Reveal } from '@/components/ui/reveal';
import { Countdown, DropCTA, LiveStockIndicator, PurchaseControls, StockProgress } from '@/components/drop/controls';
import { Waitlist } from '@/components/drop/waitlist';
import { PreviewControls } from '@/components/drop/preview-controls';
import { PackagingReveal } from '@/components/packaging/packaging-reveal';
import { money } from '@/lib/drop';

import { formatSlot, formatWeeklyTime } from '@/lib/time';
import { SitePresentation, PreviewOnly, PresentationNotice } from '@/components/ui/site-presentation';
import { CommerceOnly, DropSection, DropSectionLabel, ArchiveNote, NextChapter } from '@/components/drop/state-content';
export function Storefront({drop,mode,params={},initialTime}: {drop:Drop;mode:SiteMode;params?:PreviewParams;initialTime:number}) {
  return <Suspense><SitePresentation mode={mode}><PreviewStockDemo drop={drop} enabled={mode === 'preview' && params.stock === 'drift'} initialTime={initialTime}>
    <PresentationNotice />
    <Navigation />
    <main id="main">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name: brand.name, description: 'Marca gastronómica de drops limitados en Ciudad de Guatemala. En etapa de pre-lanzamiento.', ...(brand.siteUrl ? { url: brand.siteUrl } : {}) }).replace(/</g, '\\u003c') }} />
      <DropHero />
      <Waitlist early />
      <section id="product" className="product-reveal">
        <Media src={drop.heroImage} alt={drop.heroAlt ?? "Sunday Roast: carne asada, jus, papas doradas y pan. Fotografía de referencia del drop."} className="hero-food" priority />
        <div className="photo-footnote page-grid eyebrow"><span>DROP {drop.number} / {drop.name}</span><PreviewOnly><span>FOTOGRAFÍA ILUSTRATIVA · RECETA POR CONFIRMAR</span></PreviewOnly></div>
        <Reveal className="reveal-statement page-grid" event="view_product"><span className="eyebrow">TAKE YOUR TIME WITH THIS ONE.</span><h2>{campaign.reveal[0]}<br />{campaign.reveal[1]}</h2><p className="body-copy">{drop.source ? drop.description : campaign.productBody}</p></Reveal>
      </section>
      <DropSection>
        <div className="drop-intro"><DropSectionLabel /><h2>{drop.source ? drop.name : <>{campaign.productHeading[0]}<br />{campaign.productHeading[1]}</>}</h2><p className="body-copy">{drop.description}</p><div className="included"><p className="eyebrow">TODO LO QUE INCLUYE</p>{drop.includes.map((item, index) => <div className="ingredient-row" key={item.name}><span className="caption">0{index + 1}</span><div><h3>{item.name}</h3><p>{item.description}</p></div></div>)}</div><PreviewOnly><p className="caption">Menú ilustrativo. Receta, porciones y alérgenos por confirmar.</p></PreviewOnly></div>
        <CommerceOnly><Reveal className="purchase-panel" event="view_price"><div className="purchase-heading"><span className="eyebrow">DROP {drop.number}</span><span className="eyebrow">{drop.fulfillmentDay} ONLY</span></div><h3>{drop.name}</h3><div className="price-line"><span>{money(drop.price)}</span><span className="caption">POR DROP{drop.source==='production'?' · ENTREGA SEGÚN ZONA':' · TODO INCLUIDO'}<PreviewOnly><br />PRECIO ESTIMADO</PreviewOnly></span></div><LiveStockIndicator inline /><StockProgress /><Countdown /><PurchaseControls /></Reveal></CommerceOnly><ArchiveNote />
      </DropSection>
      {drop.packagingFrames.length > 0 && <PackagingReveal frames={drop.packagingFrames}><div className="packaging-copy"><p className="eyebrow">02 / PACKAGING</p><h2 id="packaging-title">{campaign.packagingHeading[0]}<br />{campaign.packagingHeading[1]}</h2><div className="packaging-note"><span className="seal-mark" aria-hidden="true" /><p className="eyebrow">ONE BOX.<br /> ONE SEAL.<br /> ONE LIMITED EDITION.</p></div><PreviewOnly><p className="caption">Visualización conceptual con IA. Empaque físico por validar.</p></PreviewOnly></div></PackagingReveal>}
      <section className="craft-section page-grid"><span className="eyebrow">03 / NO SHORTCUTS</span><h2>{campaign.craft.map(line => <span key={line}>{line}</span>)}</h2><div className="craft-note"><span className="short-rule" /><p className="body-copy">{campaign.craftBody}</p><span className="eyebrow">{brand.philosophy}</span></div></section>
      <CommerceOnly><section id="how-it-works" className="logistics-section page-grid"><div className="logistics-heading"><p className="eyebrow">04 / MAKE A LITTLE ROOM</p><h2>{drop.source ? <>{drop.fulfillmentDay || 'YOUR DROP'}.<br />SORTED.</> : <>YOUR SATURDAY.<br />SORTED.</>}</h2></div><div className="logistics-steps">{[
        [`HASTA EL ${formatWeeklyTime(drop.closingReference)}`, drop.source ? 'Consultá el cierre y la fecha de entrega de esta edición.' : 'Elegí cuántos drops querés. El cierre es el viernes; la mesa te espera el sábado.'],
        [drop.source ? [drop.fulfillment.deliveryEnabled ? 'A TU PUERTA' : '', drop.fulfillment.pickupEnabled ? 'PARA RECOGER' : ''].filter(Boolean).join(' / ') : 'A TU PUERTA O PARA RECOGER', drop.source ? [drop.fulfillment.zones.map(z => z.label).join(', '), drop.fulfillment.pickupLabel].filter(Boolean).join(' · ') || 'Detalles de entrega por confirmar.' : 'Entrega dentro de nuestra cobertura o pickup. Las zonas se confirman antes de abrir pedidos.'],
        ['ELEGÍ TU HORARIO', drop.fulfillment.slots.length ? `${drop.fulfillmentDay || 'Entrega'}, ${formatSlot({ startsAt: drop.fulfillment.slots[0].startsAt, endsAt: drop.fulfillment.slots.at(-1)!.endsAt })}. Elegí tu ventana de entrega o pickup al hacer el pedido.` : 'Horarios por confirmar.'],
        ['HACÉ ESPACIO PARA ALGO BUENO', 'Prepará la mesa. Poné algo que te guste. Tomate tu tiempo.'],
      ].map(([title, body], index) => <div className="logistics-row" key={title}><span className="eyebrow">0{index + 1}</span><div><h3>{title}</h3><p>{body}</p></div></div>)}</div></section>
      <section className="final-drop page-grid"><div className="final-drop-top"><p className="eyebrow">DROP {drop.number} / {drop.fulfillmentDay} ONLY</p><span className="eyebrow">LIMITED BY DESIGN.</span></div><h2>{drop.name}</h2><div className="final-drop-bottom"><div><span className="final-price">{money(drop.price)}</span><span className="caption"> <PreviewOnly>ESTIMADO / </PreviewOnly>{drop.source==='production'?'ENTREGA SEGÚN ZONA':'TODO INCLUIDO'}</span></div><Countdown /><DropCTA /></div><LiveStockIndicator inline /></section></CommerceOnly>
      <NextChapter /><Waitlist />
      <div className="page-grid"><PreviewControls /></div>
    </main><Footer />
  </PreviewStockDemo></SitePresentation></Suspense>;
}
