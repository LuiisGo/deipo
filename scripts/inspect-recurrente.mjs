// Read-only diagnostics: node --env-file=.env.local scripts/inspect-recurrente.mjs ch_...
// Prints a whitelist, never raw provider JSON, headers, secrets, or customer PII.
const id = process.argv[2];
if (!/^ch_[A-Za-z0-9_-]+$/.test(id ?? ''))
  throw Error('Supply a known provider checkout ID from Admin');
const key = process.env.RECURRENTE_SECRET_KEY,
  sandbox = process.env.RECURRENTE_SANDBOX_ID;
if (
  process.env.RECURRENTE_MODE !== 'sandbox' ||
  !key?.startsWith('sk_test_') ||
  !sandbox
)
  throw Error('Sandbox configuration required');
async function get(path) {
  const r = await fetch('https://app.recurrente.com/api' + path, {
    headers: { 'X-SECRET-KEY': key },
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (!r.ok) throw Error('Provider inspection unavailable');
  return r.json();
}
try {
  const identity = await get('/test');
  if (identity.environment !== 'sandbox' || identity.sandbox_id !== sandbox)
    throw Error('Wrong provider environment');
  const c = await get('/checkouts/' + id);
  console.log(
    JSON.stringify(
      {
        id: c.id,
        status: c.status,
        total_in_cents: c.total_in_cents,
        currency: c.currency,
        live_mode: c.live_mode,
        expires_at: c.expires_at,
        created_at: c.created_at,
      },
      null,
      2,
    ),
  );
} catch {
  console.error(
    'Inspection failed; check environment and provider availability.',
  );
  process.exitCode = 1;
}
