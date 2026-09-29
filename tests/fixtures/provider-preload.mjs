// Test-process-only fetch interception. Not imported by any application module.
if (
  process.env.RECURRENTE_SECRET_KEY !== 'sk_test_isolated_fixture' ||
  process.env.NEXT_PUBLIC_SUPABASE_URL !== 'http://127.0.0.1:54329'
)
  throw Error('Provider interception requires isolated fixtures');
const original = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = String(input);
  return original(
    url.startsWith('https://app.recurrente.com/api/')
      ? url.replace(
          'https://app.recurrente.com/api/',
          'http://127.0.0.1:54329/provider/',
        )
      : input,
    init,
  );
};
