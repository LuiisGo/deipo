'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { DeipoLogo } from '@/components/brand/deipo-logo';
import { minorMoney } from '@/lib/deipo/checkout';
import type {
  PaymentState,
  PaymentReceipt,
} from '@/lib/payments/recurrente/types';
const messages: Record<PaymentState['status'], [string, string]> = {
  none: ['Sin pedido para consultar.', 'Volvé al drop para continuar.'],
  confirming: [
    'Confirmando tu pago.',
    'La confirmación puede tardar unos momentos. Esperamos la respuesta del proveedor.',
  ],
  bank_transfer_pending: [
    'Transferencia pendiente.',
    'Tu pedido todavía no está confirmado. Lo confirmaremos cuando el pago se acredite y podamos asignar las unidades. La reserva conserva su vencimiento original.',
  ],
  paid: ['Pago confirmado.', 'Tu inventario está asignado.'],
  failed: [
    'El pago no se completó.',
    'Podés volver al checkout e intentar de nuevo mientras tu reserva esté vigente.',
  ],
  canceled: ['Pago cancelado.', 'Volvé al checkout para consultar tu reserva.'],
  expired: [
    'Tu reserva venció.',
    'Si ya pagaste, el pago necesita verificación. Actualizá el estado antes de iniciar otro pedido.',
  ],
  review_required: [
    'Tu pago necesita revisión.',
    'Recibimos una confirmación de pago, pero el pedido aún no está confirmado. Necesitás asistencia de DEIPO; no hagás otro pago.',
  ],
  creation_unknown: [
    'Estamos verificando tu intento.',
    'No iniciés otro pago. Necesitás asistencia de DEIPO para confirmar el resultado.',
  ],
};
export function PaymentStatus({ initial }: { initial: PaymentState | null }) {
  const [state, setState] = useState(initial),
    [waiting, setWaiting] = useState(false),
    [error, setError] = useState('');
  const status = state?.status;
  useEffect(() => {
    if (status !== 'confirming' && status !== 'bank_transfer_pending') return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempt = 0;
    const delays = [1500, 2000, 3000, 5000, 8000, 12000, 15000, 15000];
    async function refresh() {
      try {
        const response = await fetch('/api/payments/state', {
          cache: 'no-store',
          signal: AbortSignal.timeout(8000),
        });
        if (response.ok && !stopped) {
          const next = (await response.json()) as PaymentState;
          if (!stopped) setState(next);
        }
      } catch {
        /* Manual refresh remains available after a finite polling window. */
      }
      if (!stopped && attempt < delays.length)
        timer = setTimeout(() => void refresh(), delays[attempt++]);
    }
    timer = setTimeout(() => void refresh(), delays[attempt++]);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [status]);
  async function reload() {
    setWaiting(true);
    setError('');
    try {
      const r = await fetch('/api/payments/state', {
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) throw Error();
      setState(await r.json());
    } catch {
      setError('No pudimos actualizar tu pago. Intentá de nuevo.');
    } finally {
      setWaiting(false);
    }
  }
  if (state?.status === 'paid' && state.receipt)
    return <VerifiedReceipt receipt={state.receipt} />;
  const message = state
    ? messages[state.status]
    : [
        'No pudimos consultar tu pago.',
        'Actualizá para consultar el estado verificado.',
      ];
  return (
    <main id="main" className="receipt-empty payment-status">
      <Link href="/" aria-label="deipo. Inicio">
        <DeipoLogo tone="cream" />
      </Link>
      <p className="eyebrow">TU PAGO</p>
      <div role="status" aria-live="polite">
        <h1>{message[0]}</h1>
        <p>{message[1]}</p>
      </div>
      {state?.order_code && <p>{state.order_code}</p>}
      {error && <p role="alert">{error}</p>}
      <button
        className="button"
        disabled={waiting}
        onClick={() => void reload()}
      >
        {waiting ? 'CONSULTANDO…' : 'ACTUALIZAR ESTADO'}
      </button>
      <Link className="text-button" href="/checkout">
        VOLVER AL CHECKOUT
      </Link>
    </main>
  );
}
function VerifiedReceipt({ receipt: r }: { receipt: PaymentReceipt }) {
  const [replay, setReplay] = useState(0);
  const date = new Intl.DateTimeFormat('es-GT', {
    dateStyle: 'medium',
    timeStyle: 'short',
    hourCycle: 'h23',
    timeZone: 'America/Guatemala',
  }).format(new Date(r.paid_at));
  return (
    <main id="main" className="receipt-scene">
      <div className="receipt-status eyebrow">
        PAGO VERIFICADO{' '}
        {r.environment === 'sandbox' && (
          <small> · SANDBOX / SIN DINERO REAL</small>
        )}
      </div>
      <div className="printer">
        <div className="printer-edge" aria-hidden="true">
          <span>deipo. / PRINT STUDIO</span>
          <i />
        </div>
        <div className="paper-feed" key={replay}>
          <article
            className="receipt-paper"
            aria-label="Recibo de pago verificado"
          >
            <header className="receipt-heading">
              <DeipoLogo variant="receipt" />
              <p>
                FOOD DROPS BY CHEFS
                <br />
                FOR WHAT’S NEXT
              </p>
            </header>
            <div className="receipt-meta">
              <div>
                <span>ORDER NO.</span>
                <span>{r.code}</span>
              </div>
              <div>
                <span>PAGADO</span>
                <span>{date}</span>
              </div>
              <div>
                <span>MÉTODO</span>
                <span>
                  {r.payment_method === 'bank_transfer'
                    ? 'TRANSFERENCIA'
                    : 'TARJETA'}
                </span>
              </div>
              <div>
                <span>MODALIDAD</span>
                <span>
                  {r.fulfillment_method === 'pickup' ? 'PICKUP' : 'ENTREGA'}
                </span>
              </div>
            </div>
            <div className="receipt-drop">
              <span className="receipt-signal" />
              <div>
                <h1>
                  DROP {String(r.drop_number).padStart(3, '0')} — {r.drop_name}
                </h1>
                <span>LIMITED FOOD DROPS</span>
              </div>
            </div>
            <div className="receipt-items">
              <div>
                <span>
                  {r.quantity} × {r.drop_name}
                </span>
                <span>{minorMoney(r.subtotal_minor)}</span>
              </div>
            </div>
            <div className="receipt-totals">
              <div>
                <span>SUBTOTAL</span>
                <span>{minorMoney(r.subtotal_minor)}</span>
              </div>
              <div>
                <span>ENTREGA</span>
                <span>{minorMoney(r.delivery_fee_minor)}</span>
              </div>
              <div className="receipt-total">
                <strong>TOTAL PAGADO</strong>
                <strong>{minorMoney(r.total_minor)}</strong>
              </div>
            </div>
            <div className="receipt-window">
              <span>
                {r.fulfillment_method === 'pickup'
                  ? r.pickup_label
                  : r.zone_label}
              </span>
              <strong>
                {r.slot_start?.slice(0, 5)}{' '}
                {r.slot_end ? `– ${r.slot_end.slice(0, 5)}` : ''}
              </strong>
              <small>{r.fulfillment_date}</small>
            </div>
            <p className="receipt-good">
              GOOD
              <br />
              FOOD
              <br />
              AHEAD<span className="brand-dot">.</span>
            </p>
            <footer className="receipt-thanks">
              <strong>THANK YOU.</strong>
              <span>
                PAGO VERIFICADO
                <br />
                INVENTARIO ASIGNADO
              </span>
              <small>NO ES UN DOCUMENTO FISCAL</small>
            </footer>
          </article>
        </div>
      </div>
      <div className="receipt-actions">
        <button className="text-button" onClick={() => window.print()}>
          IMPRIMIR RECIBO
        </button>
        <button className="text-button" onClick={() => setReplay((v) => v + 1)}>
          VOLVER A IMPRIMIR
        </button>
      </div>
      <Link href="/" className="receipt-back text-button">
        VOLVER AL DROP
      </Link>
    </main>
  );
}
