import 'server-only';
import { PaymentError } from '../errors';
export function recurrenteConfig(
  env: Record<string, string | undefined> = process.env,
) {
  if (env.RECURRENTE_MODE !== 'sandbox')
    throw new PaymentError('INVALID_PAYMENT_ENVIRONMENT');
  const key = env.RECURRENTE_SECRET_KEY,
    sandboxId = env.RECURRENTE_SANDBOX_ID;
  if (!key || !sandboxId || !key.startsWith('sk_test_'))
    throw new PaymentError('PAYMENTS_NOT_CONFIGURED');
  return { key, sandboxId };
}
