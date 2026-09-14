import { Suspense } from 'react';
import { getPreviewDrop, type PreviewParams } from '@/content/current-drop';
import { brand, campaign } from '@/content/brand';
import { DropProvider } from '@/components/drop/drop-context';
import { Navigation } from '@/components/layout/navigation';
import { Footer } from '@/components/layout/footer';
import { DropHero } from '@/components/drop/hero';
import { Media } from '@/components/ui/media';
import { Reveal } from '@/components/ui/reveal';
import { Countdown, DropCTA, LiveStockIndicator, PurchaseControls } from '@/components/drop/controls';
import { Waitlist } from '@/components/drop/waitlist';
import { PreviewControls } from '@/components/drop/preview-controls';
import { PackagingReveal } from '@/components/packaging/packaging-reveal';
import { money } from '@/lib/drop';
export default async function Home({ searchParams }: { searchParams: Promise<PreviewParams> }) {
  const drop = getPreviewDrop(await searchParams);
  return <Suspense><DropProvider drop={drop}>
    <div className="demo-banner">VISTA PREVIA <span>—</span> STOCK DE PRUEBA · PRECIO ESTIMADO · SIN PEDIDOS REALES</div>
    <Navigation />
    <main id="main">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name: brand.name, description: 'Marca gastronómica de drops limitados en Ciudad de Guatemala. En etapa de pre-lanzamiento.', ...(brand.siteUrl ? { url: brand.siteUrl } : {}) }).replace(/</g, '\\u003c') }} />
      <DropHero />
      <Waitlist early />
      <section id="product" className="product-reveal">
        <Media src={drop.heroImage} alt="Rosy roast beef in rich jus with golden roast potatoes and Yorkshire pudding. Illustrative Sunday Roast photography." className="hero-food" priority />
        <div className="photo-footnote page-grid eyebrow"><span>DROP {drop.number} / {drop.name}</span><span>FOTOGRAFÍA ILUSTRATIVA · RECETA POR CONFIRMAR</span></div>
        <Reveal className="reveal-statement page-grid" event="view_product"><span className="eyebrow">TAKE YOUR TIME WITH THIS ONE.</span><h2>{campaign.reveal[0]}<br />{campaign.reveal[1]}</h2><p className="body-copy">{campaign.productBody}</p></Reveal>
      </section>
      <section id="the-drop" className="drop-section page-grid">
        <div className="drop-intro"><p className="eyebrow">01 / THE DROP</p><h2>{campaign.productHeading[0]}<br />{campaign.productHeading[1]}</h2><p className="body-copy">{drop.description}</p><div className="included"><p className="eyebrow">TODO LO QUE INCLUYE</p>{drop.includes.map((item, index) => <div className="ingredient-row" key={item.name}><span className="caption">0{index + 1}</span><div><h3>{item.name}</h3><p>{item.description}</p></div></div>)}</div><p className="caption">Menú ilustrativo. Receta, porciones y alérgenos por confirmar.</p></div>
        <Reveal className="purchase-panel" event="view_price"><div className="purchase-heading"><span className="eyebrow">DROP {drop.number}</span><span className="eyebrow">{drop.fulfillmentDay} ONLY</span></div><h3>{drop.name}</h3><div className="price-line"><span>{money(drop.price)}</span><span className="caption">POR DROP<br />PRECIO ESTIMADO</span></div><LiveStockIndicator inline /><div className="stock-track" aria-hidden="true"><span style={{ width: `${100 * drop.sold / drop.capacity}%` }} /></div><Countdown /><PurchaseControls /></Reveal>
      </section>
      <section className="packaging-section page-grid"><div className="packaging-copy"><p className="eyebrow">02 / THE EXPERIENCE</p><h2>{campaign.packagingHeading[0]}<br />{campaign.packagingHeading[1]}</h2><p className="body-copy">{campaign.packagingBody}</p><div className="packaging-note"><span className="seal-mark" aria-hidden="true" /><p className="eyebrow">ONE BOX.<br />ONE SEAL.<br />ONE LIMITED EDITION.</p></div><p className="caption">Concepto de empaque. Pendiente de pruebas físicas.</p></div><PackagingReveal frames={drop.packagingFrames} /></section>
      <section className="craft-section page-grid"><span className="eyebrow">03 / NO SHORTCUTS</span><h2>{campaign.craft.map(line => <span key={line}>{line}</span>)}</h2><div className="craft-note"><span className="short-rule" /><p className="body-copy">{campaign.craftBody}</p><span className="eyebrow">{brand.philosophy}</span></div></section>
      <section id="how-it-works" className="logistics-section page-grid"><div className="logistics-heading"><p className="eyebrow">04 / MAKE A LITTLE ROOM</p><h2>YOUR SATURDAY.<br />SORTED.</h2></div><div className="logistics-steps">{[
        ['PEDÍ ANTES DEL VIERNES', 'Elegí tu drop antes del viernes a las 11:59 PM. La fecha del primer sábado está por confirmar.'],
        ['A TU PUERTA O PARA RECOGER', 'Elegí entrega o pickup. La entrega está prevista dentro de nuestra cobertura normal. Las zonas y cualquier tarifa adicional se confirmarán antes del lanzamiento.'],
        ['ELEGÍ TU HORARIO', 'Seleccioná tu ventana de entrega para el sábado en el checkout. Horarios de prueba disponibles entre las 6 y las 9 PM.'],
        ['HACÉ ESPACIO PARA ALGO BUENO', 'Prepará la mesa. Poné algo que te guste. Tomate tu tiempo.'],
      ].map(([title, body], index) => <div className="logistics-row" key={title}><span className="eyebrow">0{index + 1}</span><div><h3>{title}</h3><p>{body}</p></div></div>)}</div></section>
      <section className="final-drop page-grid"><div className="final-drop-top"><p className="eyebrow">DROP {drop.number} / {drop.fulfillmentDay} ONLY</p><span className="eyebrow">LIMITED BY DESIGN.</span></div><h2>{drop.name}</h2><div className="final-drop-bottom"><div><span className="final-price">{money(drop.price)}</span><span className="caption"> ESTIMADO / TODO INCLUIDO</span></div><Countdown /><DropCTA /></div><LiveStockIndicator inline /></section>
      <Waitlist />
      <div className="page-grid"><PreviewControls /></div>
    </main><Footer />
  </DropProvider></Suspense>;
}
