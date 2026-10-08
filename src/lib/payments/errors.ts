export class PaymentError extends Error {
  constructor(
    public readonly code: string,
    public readonly uncertain = false,
  ) {
    super(code);
    this.name = 'PaymentError';
  }
}
export const paymentErrors: Record<string, string> = {
  PAYMENT_METHODS_UNAVAILABLE: 'Recurrente no confirmó los métodos o la referencia de transferencia. Necesitás asistencia antes de iniciar otro pago.',
  PAYMENTS_NOT_CONFIGURED: 'Los pagos no están disponibles en este momento.',
  INVALID_PAYMENT_ENVIRONMENT:
    'Los pagos no están disponibles en este entorno.',
  PAYMENT_NOT_AVAILABLE: 'Este pedido no puede iniciar un pago.',
  PAYMENT_PENDING: 'Tu pago está en proceso. Consultá el estado del pago antes de iniciar otro intento.',
  PAYMENT_ATTEMPT_IN_PROGRESS:
    'Estamos preparando el pago. Esperá un momento y actualizá.',
  PAYMENT_CREATION_UNKNOWN:
    'Estamos verificando el intento de pago. No iniciés otro pago; necesitás asistencia.',
  PAYMENT_PROVIDER_UNAVAILABLE:
    'Recurrente no está disponible. Intentá de nuevo más tarde.',
  PAYMENT_LIMIT:
    'El proveedor no puede procesar este monto. Necesitás asistencia.',
  PAYMENT_REJECTED: 'No se pudo iniciar el pago. Tu pedido sigue pendiente.',
  ORDER_ALREADY_PAID: 'Tu pedido ya está pagado. Consultá tu recibo.',
  HOLD_EXPIRED:
    'Tu reserva venció. Volvé al drop para consultar disponibilidad.',
  NOT_AUTHORIZED: 'Solicitud no autorizada.',
};
export function paymentError(error: unknown) {
  return (
    paymentErrors[(error as { message?: string })?.message ?? ''] ??
    'No pudimos confirmar el pago. Actualizá su estado antes de continuar.'
  );
}
