export type PaymentLaunchMode = 'CARD_ONLY' | 'CARD_AND_BANK_TRANSFER';
export function enabledPaymentMethods(mode: string | undefined): string[] {
  if (mode === 'CARD_ONLY') return ['card'];
  if (mode === 'CARD_AND_BANK_TRANSFER') return ['card', 'bank_transfer'];
  return [];
}
export function paymentCopy(mode: string | undefined) {
  return mode === 'CARD_ONLY' ? 'Tarjeta' : mode === 'CARD_AND_BANK_TRANSFER'
    ? 'Tarjeta · Transferencia bancaria' : 'Métodos de pago por confirmar';
}
