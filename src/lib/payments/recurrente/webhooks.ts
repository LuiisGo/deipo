import 'server-only';
import { createHash } from 'node:crypto';
import { Webhook } from 'svix';
import { PaymentError } from '../errors';
import type { Json } from '@/types/database.types';
export function verifyWebhook(
  raw: string,
  headers: Headers,
  secret: string | undefined,
) {
  if (!secret) throw new PaymentError('PAYMENTS_NOT_CONFIGURED');
  const id = headers.get('svix-id'),
    timestamp = headers.get('svix-timestamp'),
    signature = headers.get('svix-signature');
  if (!id || !timestamp || !signature)
    throw new PaymentError('INVALID_SIGNATURE');
  let value: unknown;
  try {
    new Webhook(secret).verify(raw, {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
    });
  } catch {
    throw new PaymentError('INVALID_SIGNATURE');
  }
  // Svix 2.5 verifies only; parsing must happen explicitly after verification.
  try {
    value = JSON.parse(raw);
  } catch {
    throw new PaymentError('INVALID_WEBHOOK');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new PaymentError('INVALID_WEBHOOK');
  const p = value as Record<string, unknown>;
  // Root id identifies the provider intent, not this delivery. Business and
  // environment fields are optional here; SQL records and diagnoses them safely.
  if (
    typeof p.id !== 'string' ||
    !p.id.trim() ||
    p.id.length > 256 ||
    typeof p.event_type !== 'string' ||
    !p.event_type.trim() ||
    p.event_type.length > 120
  )
    throw new PaymentError('INVALID_WEBHOOK');
  return {
    svixId: id,
    sha256: createHash('sha256').update(raw).digest('hex'),
    payload: p as Json,
  };
}
export async function readWebhookBody(request: Request, max = 262144) {
  if (Number(request.headers.get('content-length')) > max)
    throw new PaymentError('BODY_TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) throw new PaymentError('INVALID_WEBHOOK');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new PaymentError('BODY_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}
