import 'server-only';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/types/database.types';
import {
  checkoutCookieName,
  checkoutHash,
  validCheckoutToken,
} from '@/lib/deipo/checkout-session';
import { PaymentError } from './errors';
import { recurrenteConfig } from './recurrente/config';
import { providerCheckoutUrl, recurrenteClient } from './recurrente/client';
import type { PaymentPreparation, PaymentState } from './recurrente/types';
export function paymentClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new PaymentError('PAYMENTS_NOT_CONFIGURED');
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: 'no-store',
          signal: AbortSignal.timeout(10000),
        }),
    },
  });
}
export async function customerPaymentState(): Promise<PaymentState> {
  const token = (await cookies()).get(checkoutCookieName)?.value;
  if (!validCheckoutToken(token)) return { status: 'none' };
  const { data, error } = await paymentClient().rpc('customer_payment_state', {
    p_session_hash: checkoutHash(token),
  });
  if (error) throw new PaymentError('PAYMENT_PROVIDER_UNAVAILABLE');
  // RPC produces an explicit whitelist; never query raw attempts for the browser.
  return data as unknown as PaymentState;
}
export async function initiatePayment(token: string, origin: string) {
  if (!validCheckoutToken(token)) throw new PaymentError('NOT_AUTHORIZED');
  const config = recurrenteConfig(),
    provider = recurrenteClient(),
    db = paymentClient();
  const { data, error } = await db.rpc('prepare_payment_checkout', {
    p_session_hash: checkoutHash(token),
    p_sandbox_id: config.sandboxId,
  });
  if (error) throw new PaymentError(error.message);
  const p = data as unknown as PaymentPreparation;
  if (p.action === 'reuse') {
    if (p.attempt.internal_status === 'creation_unknown')
      throw new PaymentError('PAYMENT_CREATION_UNKNOWN');
    if (p.attempt.internal_status === 'creating')
      throw new PaymentError('PAYMENT_ATTEMPT_IN_PROGRESS');
    if (
      p.attempt.resolution_status === 'review_required' ||
      p.attempt.internal_status === 'succeeded'
    )
      throw new PaymentError('PAYMENT_NOT_AVAILABLE');
    if (Date.parse(p.attempt.expires_at) <= Date.now())
      throw new PaymentError('HOLD_EXPIRED');
    return providerCheckoutUrl(p.attempt.checkout_url);
  }
  let result;
  try {
    result = await provider.create(p, origin);
  } catch (error) {
    const known = error instanceof PaymentError;
    await db.rpc('save_payment_checkout', {
      p_attempt_id: p.attempt.id,
      p_result: {
        status: known && !error.uncertain ? 'failed' : 'creation_unknown',
        code: known ? error.code : 'PAYMENT_CREATION_UNKNOWN',
      },
    });
    throw error;
  }
  const saved = await db.rpc('save_payment_checkout', {
    p_attempt_id: p.attempt.id,
    p_result: result as unknown as Json,
  });
  // Persisting the mapping must succeed before redirect. On uncertainty, the
  // existing creating attempt blocks retries and ages to creation_unknown.
  if (saved.error) throw new PaymentError('PAYMENT_CREATION_UNKNOWN', true);
  return result.checkout_url;
}
