import 'server-only';
import { PaymentError } from '../errors';
import { recurrenteConfig } from './config';
import type { CheckoutResult, PaymentPreparation } from './types';
const base = 'https://app.recurrente.com/api';
export function providerCheckoutUrl(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^https:\/\/app\.recurrente\.com\/checkout-session\/[A-Za-z0-9_-]+$/.test(
      value,
    )
  )
    throw new PaymentError('PAYMENT_CREATION_UNKNOWN', true);
  return value;
}
export function checkoutBody(p: PaymentPreparation, origin: string) {
  if (!p.item || !p.order_code || p.attempt.currency !== 'GTQ')
    throw new PaymentError('PAYMENT_NOT_AVAILABLE');
  const { item } = p;
  for (const n of [
    item.quantity,
    item.unit_price_minor,
    p.delivery_fee_minor,
    p.attempt.amount_minor,
  ])
    if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0)
      throw new PaymentError('PAYMENT_NOT_AVAILABLE');
  if (
    item.quantity < 1 ||
    item.unit_price_minor < 1 ||
    item.quantity * item.unit_price_minor + (p.delivery_fee_minor ?? 0) !==
      p.attempt.amount_minor
  )
    throw new PaymentError('PAYMENT_NOT_AVAILABLE');
  const line = (name: string, amount: number, quantity: number) => ({
    name,
    amount_in_cents: amount,
    quantity,
    currency: 'GTQ',
    charge_type: 'one_time',
    payment_method_types: ['card', 'bank_transfer'],
    available_installments: [],
    billing_info_requirement: 'none',
  });
  // Official API permits 1..9 units per line. Preserve DEIPO's stock-based quantity.
  const items = [];
  for (let remaining = item.quantity; remaining > 0; remaining -= 9)
    items.push(line(item.name, item.unit_price_minor, Math.min(remaining, 9)));
  if (p.delivery_fee_minor)
    items.push(line('Entrega', p.delivery_fee_minor, 1));
  return {
    items,
    success_url: `${origin}/success`,
    cancel_url: `${origin}/checkout?payment=cancelled`,
    expires_at: p.attempt.expires_at,
    metadata: {
      integration: 'deipo',
      integration_version: 'sprint-03',
      deipo_order_code: p.order_code,
      deipo_payment_attempt_id: p.attempt.id,
    },
  };
}
export function recurrenteClient(
  fetcher: typeof fetch = fetch,
  env: Record<string, string | undefined> = process.env,
  timeoutMs = 10000,
) {
  const config = recurrenteConfig(env);
  async function request(path: string, body?: unknown) {
    const write = body !== undefined;
    let response: Response;
    try {
      response = await fetcher(`${base}${path}`, {
        method: write ? 'POST' : 'GET',
        headers: {
          'X-SECRET-KEY': config.key,
          'Content-Type': 'application/json',
        },
        body: write ? JSON.stringify(body) : undefined,
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new PaymentError(
        write ? 'PAYMENT_CREATION_UNKNOWN' : 'PAYMENT_PROVIDER_UNAVAILABLE',
        write,
      );
    }
    let data: Record<string, unknown>;
    try {
      data = await response.json();
      if (!data || typeof data !== 'object' || Array.isArray(data))
        throw Error();
    } catch {
      throw new PaymentError(
        write ? 'PAYMENT_CREATION_UNKNOWN' : 'PAYMENT_PROVIDER_UNAVAILABLE',
        write,
      );
    }
    if (!response.ok) {
      if (write && (response.status >= 500 || response.status === 408))
        throw new PaymentError('PAYMENT_CREATION_UNKNOWN', true);
      throw new PaymentError(
        data.code === 'amount_exceeds_unverified_limit'
          ? 'PAYMENT_LIMIT'
          : 'PAYMENT_REJECTED',
      );
    }
    return data;
  }
  return {
    async create(
      p: PaymentPreparation,
      origin: string,
    ): Promise<CheckoutResult> {
      const body = checkoutBody(p, origin);
      // The key prefix cannot distinguish named Sandbox from legacy TEST. Read-only
      // preflight verifies /test before any provider mutation, on every creation.
      const identity = await request('/test');
      if (
        identity.environment !== 'sandbox' ||
        identity.sandbox_id !== config.sandboxId
      )
        throw new PaymentError('INVALID_PAYMENT_ENVIRONMENT');
      const data = await request('/checkouts', body);
      if (
        typeof data.id !== 'string' ||
        !/^ch_[A-Za-z0-9_-]+$/.test(data.id) ||
        data.status !== 'unpaid' ||
        data.live_mode === true ||
        (data.sandbox_id !== undefined &&
          data.sandbox_id !== config.sandboxId) ||
        (data.total_in_cents !== undefined &&
          data.total_in_cents !== p.attempt.amount_minor) ||
        (data.currency !== undefined && data.currency !== 'GTQ') ||
        (data.expires_at !== undefined &&
          Date.parse(String(data.expires_at)) !==
            Date.parse(p.attempt.expires_at)) ||
        (data.created_at !== undefined &&
          !Number.isFinite(Date.parse(String(data.created_at))))
      )
        throw new PaymentError('PAYMENT_CREATION_UNKNOWN', true);
      const checkout_url = providerCheckoutUrl(data.checkout_url);
      if (!checkout_url.endsWith('/' + data.id))
        throw new PaymentError('PAYMENT_CREATION_UNKNOWN', true);
      return {
        status: 'checkout_ready',
        id: data.id,
        checkout_url,
        provider_status: data.status,
        created_at:
          typeof data.created_at === 'string' ? data.created_at : null,
      };
    },
    async inspect(id: string) {
      if (!/^ch_[A-Za-z0-9_-]+$/.test(id))
        throw new PaymentError('PAYMENT_NOT_AVAILABLE');
      return request(`/checkouts/${encodeURIComponent(id)}`);
    },
  };
}
