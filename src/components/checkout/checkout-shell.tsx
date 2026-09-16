'use client';
import { ArrowIcon } from '@/components/ui/arrow-icon';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { DeipoLogo } from '@/components/brand/deipo-logo';
import { PreviewOnly } from '@/components/ui/site-presentation';
import { useOrder } from './order-context';
import { useDrop } from '@/components/drop/drop-context';
import { Extras, QuantityControl, usePreviewHref } from '@/components/drop/controls';
import { isPurchasable, money, totals, validateFulfillment, validateQuantity } from '@/lib/drop';
import { completeDemoCheckout, validateContact } from '@/lib/demo-services';
import { track } from '@/lib/analytics';
import { Media } from '@/components/ui/media';
import { formatSlot } from '@/lib/time';

const steps = ['Tu drop', 'Entrega', 'Tus datos', 'Confirmar'];
export function CheckoutShell() {
  const { drop, status } = useDrop();
  const { selection, setSelection, contact, setContact, setOrder, clearContact } = useOrder();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [failedOnce, setFailedOnce] = useState(false);
  const params = useSearchParams();
  const router = useRouter();
  const back = usePreviewHref('/');
  const success = usePreviewHref('/success');
  const heading = useRef<HTMLHeadingElement>(null);
  const price = totals(drop, selection);
  useEffect(() => { track('begin_checkout', { drop_id: drop.id }); }, [drop.id]);
  function goTo(next: number) { setStep(next); setError(null); requestAnimationFrame(() => heading.current?.focus()); }
  async function next(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const problem = step === 0 ? validateQuantity(selection.quantity, drop) : step === 1 ? validateFulfillment(drop, selection, contact.address) : step === 2 ? validateContact(contact) : null;
    if (problem) { setError(problem); return; }
    if (step < 3) {
      if (step === 2) track('submit_contact', { drop_id: drop.id });
      goTo(step + 1); return;
    }
    if (!accepted) { setError('Confirmá que entendés que esta es una compra de prueba.'); return; }
    setBusy(true); setError(null);
    try {
      const result = await completeDemoCheckout(drop, selection, contact, params.get('payment') === 'fail' && !failedOnce);
      if (!result.ok) { setError(result.message); setFailedOnce(true); return; }
      setOrder(result.order); clearContact();
      track('checkout_complete', { drop_id: drop.id, quantity: selection.quantity, fulfillment: selection.fulfillment });
      router.push(success);
    } catch { setError('No pudimos completar la prueba. No se realizó ningún cobro. Intentá de nuevo.'); }
    finally { setBusy(false); }
  }
  if (!isPurchasable(status)) return <main id="main" className="checkout-unavailable page-grid"><Link href={back}><DeipoLogo /></Link><span className="eyebrow">DROP {drop.number}</span><h1>{status === 'sold_out' ? 'SOLD OUT.' : status === 'upcoming' ? 'COMING SOON.' : 'ORDERS CLOSED.'}</h1><p>Este drop no está recibiendo pedidos. Te esperamos en el próximo.</p><Link className="button" href={`${back}#next-drop`}>VER EL PRÓXIMO DROP <span><ArrowIcon /></span></Link></main>;
  return <>
    <div className="demo-banner">CHECKOUT DE PRUEBA — NO SE REALIZARÁ NINGÚN COBRO NI RESERVA.</div>
    <header className="checkout-nav page-grid"><Link href={back} aria-label="deipo. inicio"><DeipoLogo /></Link><Link href={back}><ArrowIcon direction="left" /> VOLVER AL DROP</Link><span className="eyebrow">DROP {drop.number}</span></header>
    <main id="main" className="checkout-main page-grid">
      <div className="checkout-form-column"><p className="eyebrow">BUENAS COSAS EN CAMINO.</p><h1>MAKE IT<br />A DATE<span className="brand-dot">.</span></h1>
        <div className="mobile-order-total"><span>{price.total === null ? 'SUBTOTAL' : 'TOTAL'} · {selection.quantity} DROP{selection.quantity === 1 ? '' : 'S'}</span><strong>{money(price.total ?? price.subtotal)}</strong><a href="#order-summary">VER RESUMEN <ArrowIcon direction="down" /></a></div>
        <ol className="checkout-steps" aria-label="Pasos del pedido">{steps.map((label, index) => <li key={label} className={step === index ? 'current' : step > index ? 'complete' : ''} aria-current={step === index ? 'step' : undefined}><button type="button" disabled={index > step || busy} onClick={() => goTo(index)}><span>0{index + 1}</span>{label}</button></li>)}</ol>
        <form onSubmit={next} className="checkout-form" aria-busy={busy}>
          <div className="step-heading"><span className="eyebrow">PASO 0{step + 1} / 04</span><h2 ref={heading} tabIndex={-1}>{steps[step]}</h2></div>
          {step === 0 && <><p className="body-copy">Todo lo que hace especial a este drop, incluido. Elegí cuántos querés compartir.</p><div className="checkout-product"><span>{drop.name}</span><span>{money(drop.price)} <small>/ drop</small></span></div><div className="quantity-row"><span>Cantidad</span><QuantityControl drop={drop} /></div>{drop.extras.length > 0 && <Extras drop={drop} />}<PreviewOnly><p className="caption">Precio estimado. Sin máximo por pedido; sujeto a las unidades disponibles.</p></PreviewOnly></>}
          {step === 1 && <><fieldset className="fulfillment-options"><legend className="eyebrow">¿CÓMO LO RECIBÍS?</legend>{([{ id: 'delivery', title: 'A tu puerta', detail: 'Entrega a domicilio', enabled: drop.fulfillment.deliveryEnabled }, { id: 'pickup', title: 'Lo paso a recoger', detail: 'Pickup en Zona 10', enabled: drop.fulfillment.pickupEnabled }] as const).map(option => <label key={option.id} className={selection.fulfillment === option.id ? 'selected' : ''}><input type="radio" name="fulfillment" value={option.id} disabled={!option.enabled} checked={selection.fulfillment === option.id} onChange={() => { setSelection({ ...selection, fulfillment: option.id }); track('select_fulfillment', { fulfillment: option.id }); }} /><span><strong>{option.title}</strong><small>{option.detail}</small></span></label>)}</fieldset>
            {selection.fulfillment === 'delivery' ? <><label>Zona de entrega<select required value={selection.zone} onChange={event => setSelection({ ...selection, zone: event.target.value })}><option value="">Seleccioná tu zona</option>{drop.fulfillment.zones.map(zone => <option key={zone.id} value={zone.id}>{zone.label}</option>)}</select></label><label>Dirección<input value={contact.address} onChange={event => setContact({ ...contact, address: event.target.value })} autoComplete="street-address" maxLength={300} required minLength={8} placeholder="Calle, avenida, número y referencias" /></label><p className="caption">Entrega incluida dentro de la cobertura normal. Zonas definitivas y cargos fuera de cobertura por confirmar.</p></> : <div className="pickup-note"><p>{drop.fulfillment.pickupLabel}</p><span className="caption">Esta prueba no reserva un horario ni confirma un punto de recogida.</span></div>}
            <fieldset className="slot-options"><legend className="eyebrow">SÁBADO · TU HORARIO</legend>{drop.fulfillment.slots.map(slot => <label key={slot.id} className={`${selection.slot === slot.id ? 'selected' : ''} ${!slot.available ? 'unavailable' : ''}`}><input type="radio" name="slot" required disabled={!slot.available} value={slot.id} checked={selection.slot === slot.id} onChange={() => { setSelection({ ...selection, slot: slot.id }); track('select_slot', { slot_id: slot.id }); }} /><span>{formatSlot(slot)}</span>{!slot.available && <small>No disponible</small>}</label>)}</fieldset>
            {!drop.fulfillment.slots.some(slot => slot.available) && <p className="form-error" role="alert">No hay horarios disponibles en esta vista de prueba. Volvé al drop para elegir otro estado.</p>}<p className="caption">Hora de Guatemala (UTC−6). Fecha de lanzamiento por confirmar.</p>
          </>}
          {step === 2 && <><p className="body-copy">Los datos se usan solo para mostrar tu recibo de prueba. No se guardan ni se envían.</p><label>Nombre<input required minLength={2} maxLength={100} autoComplete="name" value={contact.name} onChange={event => setContact({ ...contact, name: event.target.value })} placeholder="Tu nombre" /></label><label>WhatsApp / teléfono<input required type="tel" autoComplete="tel" maxLength={20} pattern="[+0-9() .\-]{8,20}" value={contact.phone} onChange={event => setContact({ ...contact, phone: event.target.value })} placeholder="+502" /></label><label>Correo electrónico<input required type="email" autoComplete="email" maxLength={254} value={contact.email} onChange={event => setContact({ ...contact, email: event.target.value })} placeholder="vos@ejemplo.com" /></label></>}
          {step === 3 && <><div className="review-details"><div><span className="eyebrow">A NOMBRE DE</span><p>{contact.name}</p><p>{contact.email}</p><p>{contact.phone}</p><button className="text-button" type="button" onClick={() => goTo(2)}>EDITAR DATOS <ArrowIcon /></button></div><div><span className="eyebrow">{selection.fulfillment === 'delivery' ? 'ENTREGA' : 'PICKUP'}</span><p>{selection.fulfillment === 'delivery' ? contact.address : drop.fulfillment.pickupLabel}</p><p>{(() => { const slot = drop.fulfillment.slots.find(slot => slot.id === selection.slot); return slot ? formatSlot(slot) : 'Horario por seleccionar'; })()}</p><p>Sábado · fecha por confirmar</p><button className="text-button" type="button" onClick={() => goTo(1)}>EDITAR ENTREGA <ArrowIcon /></button></div></div><div className="mock-payment"><span className="eyebrow">VISTA PREVIA DEL PAGO</span><p>Sin tarjeta. Sin cobro.</p><span className="caption">El siguiente paso genera un recibo de demostración. No confirma una compra real.</span></div><label className="check-row consent-row"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} required /><span>Entiendo que es una prueba y que no se realizará un pedido.</span></label><p className="caption">Podés revisar los borradores de <Link href="/legal/orders">política de pedidos</Link> y <Link href="/legal/privacy">privacidad</Link>.</p></>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="checkout-actions">{step > 0 && <button disabled={busy} type="button" className="text-button" onClick={() => goTo(step - 1)}><ArrowIcon direction="left" /> ATRÁS</button>}<button type="submit" className="button" disabled={busy || (step === 1 && !drop.fulfillment.slots.some(slot => slot.available))}>{busy ? 'PREPARANDO TU RECIBO…' : step === 3 ? 'COMPLETAR PRUEBA' : 'CONTINUAR'}<span aria-hidden="true"><ArrowIcon /></span></button></div>
        </form>
      </div>
      <aside id="order-summary" className="order-summary" aria-label="Resumen de tu pedido"><Media src={drop.heroImage} alt="Sunday Roast, fotografía ilustrativa del drop." className="summary-image" sizes="(max-width: 900px) 100vw, 35vw" /><div className="summary-content"><span className="eyebrow">DROP {drop.number} / TU PEDIDO</span><h2>{drop.name}</h2><div className="summary-line"><span>{selection.quantity} × drop completo</span><span>{money(drop.price * selection.quantity)}</span></div>{drop.extras.filter(extra => selection.extras.includes(extra.id)).map(extra => <div className="summary-line" key={extra.id}><span>{extra.name}</span><span>{money(extra.price)}</span></div>)}<div className="summary-line"><span>{selection.fulfillment === 'delivery' ? 'Entrega' : 'Recoger'}</span><span>{price.deliveryFee === null ? 'Por confirmar' : price.deliveryFee === 0 ? 'Incluido' : money(price.deliveryFee)}</span></div><div className="summary-total"><span>TOTAL<PreviewOnly> ESTIMADO</PreviewOnly></span><strong>{price.total === null ? 'Por confirmar' : money(price.total)}</strong></div><p className="caption">Todos los valores son de prueba. No se realizará ningún cobro.</p><p className="eyebrow summary-signoff">GOOD FOOD.<br />GOOD PLANS.</p></div></aside>
    </main>
  </>;
}
