import { NextRequest, NextResponse } from 'next/server';
import { checkoutCookieName } from '@/lib/deipo/checkout-session';
import { trustedPaymentOrigin } from '@/lib/payments/origin';
import { initiatePayment } from '@/lib/payments/repository';
import { paymentError } from '@/lib/payments/errors';
import { getSiteMode } from '@/lib/site-mode';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = {
  'Cache-Control': 'private, no-store',
  'Netlify-CDN-Cache-Control': 'no-store',
  Vary: 'Cookie',
};
export async function POST(request: NextRequest) {
  try {
    const origin = trustedPaymentOrigin(request);
    if (getSiteMode({}) !== 'production') throw Error('PAYMENT_NOT_AVAILABLE');
    const checkoutUrl = await initiatePayment(
      request.cookies.get(checkoutCookieName)?.value ?? '',
      origin,
    );
    return NextResponse.json({ checkoutUrl }, { headers });
  } catch (error) {
    return NextResponse.json(
      { error: paymentError(error) },
      { status: 400, headers },
    );
  }
}
