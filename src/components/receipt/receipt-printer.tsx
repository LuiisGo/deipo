'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useOrder } from '@/components/checkout/order-context';
import { Wordmark } from '@/components/brand/wordmark';
import { money } from '@/lib/drop';
import { playPrinterSound, stopPrinterSound } from '@/lib/receipt-audio';
export function ReceiptPrinter() {
  const { order } = useOrder();
  const [replay, setReplay] = useState(0);
  const [sound, setSound] = useState(false);
  useEffect(() => () => { void stopPrinterSound(); }, []);
  if (!order) return <main id="main" className="receipt-empty"><Wordmark /><span className="eyebrow">EL RECIBO ES PARTE DEL RITUAL.</span><h1>GOOD FOOD<br />AHEAD<span className="brand-dot">.</span></h1><p>Completá el checkout de prueba para ver tu recibo.<br />Por privacidad, los datos del recibo no se conservan al recargar.</p><Link href="/checkout" className="button">PROBAR EL CHECKOUT <span>↗</span></Link><Link href="/" className="text-button">VOLVER AL DROP</Link></main>;
  function runAgain() { setReplay(value => value + 1); if (sound) void playPrinterSound(); }
  const date = new Intl.DateTimeFormat('es-GT', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Guatemala' }).format(new Date(order.createdAt));
  return <main id="main" className="receipt-scene">
    <div className="receipt-status eyebrow">RECIBO DE PRUEBA <span>·</span> NO ES UNA COMPRA REAL</div>
    <div className="printer"><div className="printer-edge" aria-hidden="true"><span>deipo. / PRINT STUDIO</span><i /></div><div className="paper-feed" key={replay}>
      <article className="receipt-paper" aria-label="Recibo de demostración">
        <header className="receipt-heading"><Wordmark /><p>FOOD DROPS BY CHEFS<br />FOR WHAT’S NEXT</p></header>
        <div className="receipt-meta"><div><span>ORDER NO.</span><span>{order.id}</span></div><div><span>FECHA</span><span>{date}</span></div><div><span>CLIENTE</span><span>{order.contact.name}</span></div><div><span>MODALIDAD</span><span>{order.selection.fulfillment === 'delivery' ? 'ENTREGA' : 'PICKUP'}</span></div></div>
        <div className="receipt-drop"><span className="receipt-signal" /><div><h1>DROP {order.dropNumber} — {order.dropName}</h1><span>LIMITED FOOD DROPS</span></div></div>
        <div className="receipt-items">{order.items.map(item => <div key={item.name}><span>{item.quantity} × {item.name}</span><span>{money(item.total)}</span></div>)}</div>
        <div className="receipt-totals"><div><span>SUBTOTAL</span><span>{money(order.subtotal)}</span></div><div><span>ENTREGA</span><span>{order.deliveryFee === 0 ? 'INCLUIDA' : money(order.deliveryFee)}</span></div><div className="receipt-total"><strong>TOTAL ESTIMADO</strong><strong>{money(order.total)}</strong></div></div>
        <div className="receipt-window"><span>{order.selection.fulfillment === 'delivery' ? 'HORARIO DE ENTREGA' : 'HORARIO DE PICKUP'}</span><strong>{order.slotLabel}</strong><small>{order.fulfillmentDay}</small></div>
        <p className="receipt-good">GOOD<br />FOOD<br />AHEAD<span className="brand-dot">.</span></p>
        <footer className="receipt-thanks"><strong>THANK YOU.</strong><span>A MORE INTERESTING<br />TABLE AWAITS.</span><small>DEMOSTRACIÓN · SIN COBRO · SIN RESERVA<br />NO ES UN DOCUMENTO FISCAL</small></footer>
      </article>
    </div></div>
    <div className="receipt-actions"><button className="text-button" onClick={() => window.print()}>IMPRIMIR RECIBO ↗</button><button className="text-button" onClick={runAgain}>VOLVER A IMPRIMIR ↓</button><button className="text-button" aria-pressed={sound} onClick={() => { const next = !sound; setSound(next); if (next) { setReplay(value => value + 1); void playPrinterSound(); } else void stopPrinterSound(); }}>SONIDO: {sound ? 'ACTIVADO' : 'APAGADO'}</button></div>
    <details className="receipt-order-details"><summary>DETALLES DEL PEDIDO</summary><p>{order.selection.quantity} drop{order.selection.quantity === 1 ? '' : 's'} · {order.contact.name}</p><p>{order.selection.fulfillment === 'delivery' ? order.contact.address : 'Pickup en Zona 10 · dirección por confirmar'}</p><p>{order.slotLabel} · sábado por confirmar</p><p>La información existe solo durante esta visita. Este recibo no representa un pedido aceptado.</p></details>
    <Link href="/" className="receipt-back text-button">← VOLVER AL DROP</Link>
  </main>;
}
