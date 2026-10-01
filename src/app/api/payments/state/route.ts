import { NextResponse } from 'next/server';
import { customerPaymentState } from '@/lib/payments/repository';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = {
  'Cache-Control': 'private, no-store',
  'Netlify-CDN-Cache-Control': 'no-store',
  Vary: 'Cookie',
};
export async function GET() {
  try {
    return NextResponse.json(await customerPaymentState(), { headers });
  } catch {
    return NextResponse.json(
      { error: 'No pudimos consultar tu pago.' },
      { status: 503, headers },
    );
  }
}
