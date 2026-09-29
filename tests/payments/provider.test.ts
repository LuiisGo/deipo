import { test } from 'node:test';
import flatPending from '../fixtures/recurrente-flat-pending.json';
import assert from 'node:assert/strict';
import { Webhook } from 'svix';
import {
  checkoutBody,
  recurrenteClient,
} from '../../src/lib/payments/recurrente/client';
import {
  verifyWebhook,
  readWebhookBody,
} from '../../src/lib/payments/recurrente/webhooks';
import { trustedPaymentOrigin } from '../../src/lib/payments/origin';
import type { PaymentPreparation } from '../../src/lib/payments/recurrente/types';
const env = {
  RECURRENTE_MODE: 'sandbox',
  RECURRENTE_SECRET_KEY: 'sk_test_isolated_fixture',
  RECURRENTE_SANDBOX_ID: 'sbx_isolated',
};
const p: PaymentPreparation = {
  action: 'create',
  attempt: {
    id: '00000000-0000-4000-8000-000000000001',
    internal_status: 'creating',
    checkout_url: null,
    expires_at: '2030-01-01T00:00:00.000Z',
    amount_minor: 35000,
    currency: 'GTQ',
    resolution_status: 'unresolved',
  },
  order_code: 'D-TEST',
  item: { name: 'Test drop', quantity: 2, unit_price_minor: 17500 },
  delivery_fee_minor: 0,
};
const identity = {
  environment: 'sandbox',
  sandbox_id: env.RECURRENTE_SANDBOX_ID,
};
const success = {
  id: 'ch_test',
  status: 'unpaid',
  checkout_url: 'https://app.recurrente.com/checkout-session/ch_test',
  live_mode: false,
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
function mock(result: () => Promise<Response> | Response) {
  return (async (url) =>
    String(url).endsWith('/test') ? json(identity) : result()) as typeof fetch;
}
test('Hosted checkout uses immutable snapshot, split quantities, fee and no installments', () => {
  const input = {
    ...p,
    attempt: { ...p.attempt, amount_minor: 175050 },
    item: { ...p.item!, quantity: 10 },
    delivery_fee_minor: 50,
  };
  const b = checkoutBody(input, 'https://bydeipo.com');
  assert.deepEqual(
    b.items.map((i) => i.quantity),
    [9, 1, 1],
  );
  assert.equal(
    b.items.reduce((s, i) => s + i.quantity * i.amount_in_cents, 0),
    175050,
  );
  assert(!('amount_in_cents' in b));
  for (const i of b.items) {
    assert.deepEqual(i.payment_method_types, ['card', 'bank_transfer']);
    assert.deepEqual(i.available_installments, []);
    assert.equal(i.billing_info_requirement, 'none');
  }
  assert.equal(b.expires_at, p.attempt.expires_at);
});
test('create preflights named Sandbox and sends exact authenticated server request', async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return json(String(url).endsWith('/test') ? identity : success);
  };
  const r = await recurrenteClient(fetcher, env).create(
    p,
    'https://bydeipo.com',
  );
  assert.equal(r.id, 'ch_test');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].init?.method, 'POST');
  assert.equal(
    new Headers(calls[1].init?.headers).get('Idempotency-Key'),
    null,
  );
  assert.equal(
    new Headers(calls[1].init?.headers).get('X-SECRET-KEY'),
    env.RECURRENTE_SECRET_KEY,
  );
});
for (const [status, body, code, uncertain] of [
  [422, { code: 'amount_exceeds_unverified_limit' }, 'PAYMENT_LIMIT', false],
  [400, { message: 'private provider detail' }, 'PAYMENT_REJECTED', false],
  [500, {}, 'PAYMENT_CREATION_UNKNOWN', true],
  [408, {}, 'PAYMENT_CREATION_UNKNOWN', true],
] as const)
  test(`provider ${status} translates without leaking details`, async () => {
    await assert.rejects(
      recurrenteClient(
        mock(() => json(body, status)),
        env,
      ).create(p, 'https://bydeipo.com'),
      (e: unknown) => {
        const err = e as { code: string; uncertain: boolean };
        assert.equal(err.code, code);
        assert.equal(err.uncertain, uncertain);
        assert(!JSON.stringify(e).includes('private provider detail'));
        return true;
      },
    );
  });
for (const [name, body] of [
  ['missing URL', { ...success, checkout_url: null }],
  ['unsafe URL', { ...success, checkout_url: 'https://evil.example/ch_test' }],
  ['wrong environment', { ...success, live_mode: true }],
  ['wrong sandbox', { ...success, sandbox_id: 'sbx_other' }],
  ['wrong total', { ...success, total_in_cents: 1 }],
  ['wrong expiry', { ...success, expires_at: '2031-01-01T00:00:00Z' }],
  ['paid at creation', { ...success, status: 'paid' }],
] as const)
  test(name + ' blocks uncertain creation retry', async () => {
    await assert.rejects(
      recurrenteClient(
        mock(() => json(body)),
        env,
      ).create(p, 'https://bydeipo.com'),
      { code: 'PAYMENT_CREATION_UNKNOWN', uncertain: true },
    );
  });
test('malformed JSON is uncertain after POST', async () => {
  await assert.rejects(
    recurrenteClient(
      mock(() => new Response('broken')),
      env,
    ).create(p, 'https://bydeipo.com'),
    { code: 'PAYMENT_CREATION_UNKNOWN' },
  );
});
test('network failure is uncertain after POST', async () => {
  await assert.rejects(
    recurrenteClient(
      mock(() => {
        throw Error('connection lost');
      }),
      env,
    ).create(p, 'https://bydeipo.com'),
    { code: 'PAYMENT_CREATION_UNKNOWN' },
  );
});
test('timeout aborts POST and cannot automatically retry', async () => {
  let calls = 0;
  const f: typeof fetch = async (url, init) => {
    if (String(url).endsWith('/test')) return json(identity);
    calls++;
    return new Promise((_, reject) => {
      const keepAlive = setTimeout(
        () => reject(Error('timeout test did not abort')),
        1000,
      );
      init?.signal?.addEventListener('abort', () => {
        clearTimeout(keepAlive);
        reject(Error('aborted'));
      });
    });
  };
  await assert.rejects(
    recurrenteClient(f, env, 20).create(p, 'https://bydeipo.com'),
    { code: 'PAYMENT_CREATION_UNKNOWN' },
  );
  assert.equal(calls, 1);
});
test('wrong key environment is rejected before a mutation', async () => {
  let calls = 0;
  const f: typeof fetch = async () => {
    calls++;
    return json({ environment: 'live', sandbox_id: null });
  };
  await assert.rejects(
    recurrenteClient(f, env).create(p, 'https://bydeipo.com'),
    { code: 'INVALID_PAYMENT_ENVIRONMENT' },
  );
  assert.equal(calls, 1);
  assert.throws(
    () => recurrenteClient(f, { ...env, RECURRENTE_MODE: 'live' }),
    { code: 'INVALID_PAYMENT_ENVIRONMENT' },
  );
});
const req = (origin: string, host = new URL(origin).host) =>
  new Request('https://internal.example', { headers: { origin, host } });
test('trusted origin allows exact preview and loopback, rejects arbitrary hosts', () => {
  const preview = 'https://deploy-preview-4--deipo.netlify.app';
  assert.equal(
    trustedPaymentOrigin(req(preview), {
      CONTEXT: 'deploy-preview',
      DEPLOY_PRIME_URL: preview,
    }),
    preview,
  );
  assert.equal(
    trustedPaymentOrigin(req('http://localhost:3000'), {}),
    'http://localhost:3000',
  );
  assert.throws(() => trustedPaymentOrigin(req('https://evil.example'), {}));
  assert.throws(() =>
    trustedPaymentOrigin(req(preview), {
      CONTEXT: 'deploy-preview',
      DEPLOY_PRIME_URL: 'https://deploy-preview-5--deipo.netlify.app',
    }),
  );
  assert.throws(() =>
    trustedPaymentOrigin(req('https://bydeipo.com'), { CONTEXT: 'production' }),
  );
  assert.throws(() =>
    trustedPaymentOrigin(req('http://localhost:3000'), { NETLIFY: 'true' }),
  );
  assert.throws(() =>
    trustedPaymentOrigin(req('https://bydeipo.com', 'evil.example'), {}),
  );
});
const secret =
  'whsec_' +
  Buffer.from('isolated-32-byte-signing-key-12345').toString('base64');
const raw = JSON.stringify({
  event_type: 'intent.succeeded',
  type: 'payment',
  status: 'succeeded',
  id: 'in_test',
  amount_in_cents: 35000,
  currency: 'GTQ',
  checkout: { id: 'ch_test' },
  live_mode: false,
  sandbox_id: 'sbx_isolated',
});
function signed(body = raw, when = new Date()) {
  return new Headers({
    'svix-id': 'msg_test',
    'svix-timestamp': String(Math.floor(when.getTime() / 1000)),
    'svix-signature': new Webhook(secret).sign('msg_test', when, body),
  });
}
test('official Svix verifies exact raw bytes and flat intent payload', () => {
  const v = verifyWebhook(raw, signed(), secret);
  assert.equal(v.svixId, 'msg_test');
  assert.equal(v.sha256.length, 64);
  assert.equal((v.payload as { id: string }).id, 'in_test');
});
for (const failure of ['missing', 'tampered', 'wrong secret', 'expired'])
  test('Svix rejects ' + failure, () => {
    const h =
      failure === 'missing'
        ? new Headers()
        : signed(
            raw,
            failure === 'expired' ? new Date(Date.now() - 600000) : new Date(),
          );
    assert.throws(
      () =>
        verifyWebhook(
          failure === 'tampered' ? raw + ' ' : raw,
          h,
          failure === 'wrong secret'
            ? 'whsec_' + Buffer.from('wrong-key').toString('base64')
            : secret,
        ),
      { code: 'INVALID_SIGNATURE' },
    );
  });
test('signing secret is required only on request; invalid contract rejected', () => {
  assert.throws(() => verifyWebhook(raw, signed(), undefined), {
    code: 'PAYMENTS_NOT_CONFIGURED',
  });
  const bare = JSON.stringify({ event_type: 'intent.succeeded' });
  assert.throws(() => verifyWebhook(bare, signed(bare), secret), {
    code: 'INVALID_WEBHOOK',
  });
});
test('stream body cap is enforced without trusting content-length', async () => {
  const r = new Request('https://test.example', {
    method: 'POST',
    body: '12345',
  });
  await assert.rejects(readWebhookBody(r, 4), { code: 'BODY_TOO_LARGE' });
});

test('signed flat Testing example accepts absent optional environment/payment fields', () => {
  const body = JSON.stringify(flatPending);
  assert.deepEqual(
    verifyWebhook(body, signed(body), secret).payload,
    flatPending,
  );
});
for (const [name, value] of [
  [
    'old camelCase envelope',
    { eventId: 'evt_old', eventType: 'intent.pending', data: flatPending },
  ],
  ['null', null],
  ['array', []],
  ['numeric intent id', { id: 123, event_type: 'intent.pending' }],
  ['missing event type', { id: 'in_test' }],
  ['blank event type', { id: 'in_test', event_type: ' ' }],
  ['blank intent id', { id: ' ', event_type: 'intent.pending' }],
] as const)
  test('signed malformed contract rejects ' + name, () => {
    const body = JSON.stringify(value);
    assert.throws(() => verifyWebhook(body, signed(body), secret), {
      code: 'INVALID_WEBHOOK',
    });
  });
test('signed invalid JSON rejects after successful signature verification', () => {
  const body = '{"event_type":';
  assert.throws(() => verifyWebhook(body, signed(body), secret), {
    code: 'INVALID_WEBHOOK',
  });
});
test('signed legacy flat event is accepted for durable ignored processing', () => {
  const body = JSON.stringify({
    id: 'pa_legacy',
    event_type: 'payment_intent.succeeded',
  });
  assert.equal(
    (verifyWebhook(body, signed(body), secret).payload as { id: string }).id,
    'pa_legacy',
  );
});
