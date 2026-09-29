import Link from 'next/link';
import { paymentsList } from '@/lib/payments/admin';
import { minorMoney } from '@/lib/deipo/checkout';
import { utcToGuatemala } from '@/lib/deipo/validation';
const reasons: Record<string, string> = {
  PAYMENT_RECEIVED_NO_CAPACITY: 'PAGO RECIBIDO — INVENTARIO NO ASIGNADO',
  AMOUNT_MISMATCH: 'MONTO NO COINCIDE',
  CURRENCY_MISMATCH: 'MONEDA NO COINCIDE',
  ENVIRONMENT_MISMATCH: 'ENTORNO NO COINCIDE',
  ATTEMPT_ENVIRONMENT_MISMATCH: 'ENTORNO DEL INTENTO NO COINCIDE',
  POSSIBLE_DUPLICATE_PAYMENT: 'POSIBLE PAGO DUPLICADO',
  UNMATCHED_CHECKOUT: 'CHECKOUT SIN PEDIDO ASOCIADO',
  CREATION_OUTCOME_UNKNOWN: 'RESULTADO DE CREACIÓN DESCONOCIDO',
  ORDER_NOT_ELIGIBLE: 'PAGO RECIBIDO — PEDIDO NO ELEGIBLE',
  METADATA_MISMATCH: 'REFERENCIA NO COINCIDE',
};
export default async function Payments() {
  const { attempts, inbox, attention, attentionCount } = await paymentsList();
  const date = (s: string | null) => utcToGuatemala(s).replace('T', ' ') || '—';
  const configured =
    process.env.RECURRENTE_MODE === 'sandbox' &&
    !!process.env.RECURRENTE_SECRET_KEY &&
    !!process.env.RECURRENTE_SANDBOX_ID &&
    !!process.env.SUPABASE_SECRET_KEY;
  return (
    <main id="main" className="admin-workspace">
      <div className="admin-title">
        <div>
          <p className="eyebrow">DEIPO OS / PAYMENTS</p>
          <h1>Pagos</h1>
          <p>
            {configured
              ? 'Sandbox configurado'
              : 'Sandbox pendiente de configuración'}{' '}
            / Producción deshabilitada
          </p>
          <p>
            {process.env.RECURRENTE_WEBHOOK_SECRET
              ? 'Verificación webhook configurada'
              : 'Signing secret pendiente'}
          </p>
        </div>
      </div>
      <section>
        <h2>Requieren atención ({attentionCount})</h2>
        <p>
          Revisá el pago en Recurrente antes de actuar. No se hacen reembolsos
          automáticos.
        </p>
        <ul className="admin-list admin-payment-list">
          {attention.map((a) => (
            <li key={a.id}>
              <strong>
                {reasons[a.review_reason ?? 'CREATION_OUTCOME_UNKNOWN'] ??
                  a.review_reason}
              </strong>
              <Link href={`/admin/orders/${a.order_id}`}>
                {a.orders?.order_code}
              </Link>
              <span>
                Dinero confirmado por proveedor:{' '}
                {a.internal_status === 'succeeded' ? 'Sí' : 'No confirmado'} ·
                Inventario asignado:{' '}
                {a.orders?.inventory_committed_at ? 'Sí' : 'No'}
              </span>
            </li>
          ))}
        </ul>
        {inbox.length > 0 && (
          <ul className="admin-list admin-payment-list">
            {inbox.map((e) => (
              <li key={e.id}>
                <strong>
                  {reasons[e.processing_error ?? ''] ?? e.processing_status}
                </strong>
                <span>
                  {e.event_type} · {e.provider_checkout_id ?? 'Sin checkout'} ·{' '}
                  {date(e.received_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2>Intentos recientes</h2>
        <p>Últimos 100 intentos. Horarios de Guatemala.</p>
        {attempts.length === 0 && <p>No hay intentos de pago.</p>}
        <ul className="admin-list admin-payment-list">
          {attempts.map((a) => (
            <li key={a.id}>
              <Link href={`/admin/orders/${a.order_id}`}>
                <strong>
                  {a.orders?.order_code} / Intento {a.attempt_number}
                </strong>
              </Link>
              <span>
                Recurrente · {a.environment} · {a.internal_status} ·{' '}
                {a.resolution_status}
              </span>
              <span>
                {minorMoney(a.amount_minor)} {a.currency} ·{' '}
                {a.payment_method_type ?? 'Método pendiente'}
              </span>
              <span>
                Proveedor: {a.provider_status ?? '—'} /{' '}
                {a.provider_raw_status ?? '—'}
              </span>
              <span>
                Checkout: {a.provider_checkout_id ?? '—'} · Intent:{' '}
                {a.provider_intent_id ?? '—'}
              </span>
              <span>
                Creado {date(a.created_at)} · Vence {date(a.expires_at)} · Éxito{' '}
                {date(a.provider_succeeded_at)}
              </span>
              {a.failure_code && (
                <span>
                  {a.failure_code}: {a.failure_message}
                </span>
              )}
              {a.review_reason && (
                <strong>{reasons[a.review_reason] ?? a.review_reason}</strong>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
