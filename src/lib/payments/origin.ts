import { PaymentError } from './errors';
// Hosted authorization uses explicit Functions/runtime configuration, never
// Netlify build-only deploy metadata or a Host-derived allowlist.
export function trustedPaymentOrigin(
  request: Request,
  env: Record<string, string | undefined> = process.env,
) {
  const raw = request.headers.get('origin');
  let origin: URL;
  try {
    origin = new URL(raw ?? '');
  } catch {
    throw new PaymentError('NOT_AUTHORIZED');
  }
  if (
    origin.origin !== raw ||
    origin.host !== request.headers.get('host') ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    throw new PaymentError('NOT_AUTHORIZED');
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(
    origin.hostname,
  );
  if (loopback) {
    // SITE_ID is guaranteed at Netlify Functions runtime; NETLIFY also covers
    // local Netlify tooling. An explicit allowlist cannot enable loopback there.
    if (origin.protocol !== 'http:' || env.NETLIFY || env.SITE_ID)
      throw new PaymentError('NOT_AUTHORIZED');
    return origin.origin;
  }
  let allowed: URL;
  try {
    allowed = new URL(env.PAYMENT_ALLOWED_ORIGIN ?? '');
  } catch {
    throw new PaymentError('NOT_AUTHORIZED');
  }
  // Require a canonical HTTPS origin, without credentials, path, query or hash.
  // Production has no configured value and therefore remains fail-closed.
  if (
    allowed.protocol !== 'https:' ||
    allowed.origin !== env.PAYMENT_ALLOWED_ORIGIN ||
    origin.origin !== allowed.origin
  )
    throw new PaymentError('NOT_AUTHORIZED');
  return origin.origin;
}
