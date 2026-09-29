import { PaymentError } from './errors';
// Netlify sets DEPLOY_PRIME_URL to this deploy's alias. Never infer a preview
// origin from a wildcard Host header or accept a preview of another site.
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
  const local =
    ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) &&
    origin.protocol === 'http:' &&
    !env.NETLIFY;
  const production = origin.origin === 'https://bydeipo.com';
  const preview =
    origin.origin === env.DEPLOY_PRIME_URL &&
    /^https:\/\/deploy-preview-\d+--deipo\.netlify\.app$/.test(origin.origin) &&
    env.CONTEXT === 'deploy-preview';
  if (!local && !production && !preview)
    throw new PaymentError('NOT_AUTHORIZED');
  // Sandbox acceptance cannot be accidentally activated on production hosting.
  if (env.CONTEXT === 'production')
    throw new PaymentError('PAYMENT_NOT_AVAILABLE');
  return origin.origin;
}
