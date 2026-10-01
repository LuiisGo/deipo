import { NextResponse } from 'next/server';
import { paymentClient } from '@/lib/payments/repository';
import { PaymentError } from '@/lib/payments/errors';
import {
  readWebhookBody,
  verifyWebhook,
} from '@/lib/payments/recurrente/webhooks';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    if (
      process.env.RECURRENTE_MODE !== 'sandbox' ||
      !process.env.RECURRENTE_SANDBOX_ID ||
      !process.env.RECURRENTE_WEBHOOK_SECRET
    )
      throw new PaymentError('PAYMENTS_NOT_CONFIGURED');
    const verified = verifyWebhook(
      await readWebhookBody(request),
      request.headers,
      process.env.RECURRENTE_WEBHOOK_SECRET,
    );
    const db = paymentClient();
    const saved = await db.rpc('receive_payment_webhook', {
      p_svix_id: verified.svixId,
      p_sha256: verified.sha256,
      p_payload: verified.payload,
    });
    if (saved.error || !saved.data) throw new PaymentError('INBOX_UNAVAILABLE');
    const processed = await db.rpc('process_payment_webhook', {
      p_event_id: saved.data,
      p_sandbox_id: process.env.RECURRENTE_SANDBOX_ID,
    });
    if (processed.error) throw new PaymentError('PROCESSING_UNAVAILABLE');
    // Diagnostic anomalies are durably visible to Admin, acknowledged to avoid
    // infinite provider retries. Transient persistence/processing errors are 503.
    return NextResponse.json(
      { received: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const code =
      error instanceof PaymentError ? error.code : 'PROCESSING_UNAVAILABLE';
    const status =
      code === 'INVALID_SIGNATURE'
        ? 401
        : code === 'INVALID_WEBHOOK'
          ? 400
          : code === 'BODY_TOO_LARGE'
            ? 413
            : 503;
    return NextResponse.json(
      {
        error:
          status === 503
            ? 'Webhook temporarily unavailable'
            : 'Invalid webhook',
      },
      { status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
