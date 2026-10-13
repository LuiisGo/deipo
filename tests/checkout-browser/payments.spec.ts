import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import flatPending from '../fixtures/recurrente-flat-pending.json';
test.beforeEach(async ({ request }) => {
  await request.get('http://127.0.0.1:54329/reset');
});
async function pending(page: Page) {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'COMPRAR ONLINE', exact: true })
    .click();
  await page.getByLabel('Nombre', { exact: true }).fill('Payment fixture');
  await page.getByLabel('Teléfono con código de país').fill('+50255551234');
  await page.getByRole('button', { name: 'CREAR PEDIDO PENDIENTE' }).click();
  await expect(
    page.getByRole('heading', { name: 'Pedido pendiente.' }),
  ).toBeVisible();
}
async function start(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/payments/recurrente/checkout', {
      method: 'POST',
    });
    return { status: response.status, body: await response.json() };
  });
}
test('payment checkout API reuses provider checkout, verifies signed webhook, prints private receipt', async ({
  page,
  request,
  browser,
}) => {
  await pending(page);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  const first = await start(page);
  expect(first.status).toBe(200);
  const second = await start(page);
  expect(second.body.checkoutUrl).toBe(first.body.checkoutUrl);
  expect(
    (await (await request.get('http://127.0.0.1:54329/payment-stats')).json())
      .attempts,
  ).toBe(1);
  await page.goto('/success?paid=true&order_code=D-OTHER');
  await expect(
    page.getByRole('heading', { name: 'Confirmando tu pago.' }),
  ).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
  const failed = await (
    await request.post('http://127.0.0.1:54329/payment-fixture', {
      data: { invalid: true },
    })
  ).json();
  expect(failed.status).toBe(401);
  const pendingDelivery = await (
    await request.post('http://127.0.0.1:54329/payment-fixture', {
      data: { status: 'pending' },
    })
  ).json();
  expect(pendingDelivery.status).toBe(200);
  expect(pendingDelivery.inbox[0].processing_status).toBe('processed');
  const paid = await (
    await request.post('http://127.0.0.1:54329/payment-fixture', { data: {} })
  ).json();
  expect(paid.status).toBe(200);
  expect(paid.svixId).not.toBe(pendingDelivery.svixId);
  expect(paid.inbox[0].provider_intent_id).toBe(
    pendingDelivery.inbox[0].provider_intent_id,
  );
  expect(paid.inbox[0].event_id).toBe(paid.svixId);
  await expect(
    page.getByRole('article', { name: 'Recibo de pago verificado' }),
  ).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.receipt-paper')).toHaveCSS(
    'transform',
    'matrix(1, 0, 0, 1, 0, 0)',
  );
  await expect(page.getByText('TOTAL PAGADO')).toBeVisible();
  await expect(page.getByText('Q175.00').last()).toBeVisible();
  const replay = await (
    await request.post('http://127.0.0.1:54329/payment-fixture', {
      data: { svixId: paid.svixId },
    })
  ).json();
  expect(replay.status).toBe(200);
  const stats = await (
    await request.get('http://127.0.0.1:54329/stats')
  ).json();
  expect(stats.inventory.online_sold_units).toBe(1);
  expect(stats.inventory.held_units).toBe(0);
  expect(stats.inventory.available).toBe(4);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: '/private/tmp/deipo-s03-receipt-desktop.png',
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByRole('article', { name: 'Recibo de pago verificado' }),
  ).toBeVisible();
  const other = await browser.newContext();
  const tab = await other.newPage();
  await tab.goto('http://127.0.0.1:3002/success?paid=true');
  await expect(
    tab.getByRole('heading', { name: 'Sin pedido para consultar.' }),
  ).toBeVisible();
  await other.close();
  const text = await page.content();
  expect(text).not.toContain('sk_test_');
  expect(text).not.toContain('sb_secret_');
  expect(text).not.toContain('whsec_');
  expect(text).not.toContain(first.body.checkoutUrl);
});
test('bank transfer pending then verified fixture success, mobile receipt and keyboard', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await pending(page);
  await page.route('https://app.recurrente.com/checkout-session/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<h1>Isolated hosted checkout</h1>',
    }),
  );
  await page.getByRole('button', { name: 'CONTINUAR AL PAGO' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/app.recurrente.com\/checkout-session/);
  await request.post('http://127.0.0.1:54329/payment-fixture', {
    data: { status: 'pending', type: 'bank_transfer' },
  });
  await page.goto('http://127.0.0.1:3002/success');
  await expect(
    page.getByRole('heading', { name: 'TRANSFERENCIA EN PROCESO' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await expect(page.getByRole('article')).toHaveCount(0);
  await request.post('http://127.0.0.1:54329/payment-fixture', {
    data: { status: 'succeeded', type: 'bank_transfer' },
  });
  await expect(
    page.getByRole('article', { name: 'Recibo de pago verificado' }),
  ).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.receipt-paper')).toHaveCSS(
    'transform',
    'matrix(1, 0, 0, 1, 0, 0)',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: '/private/tmp/deipo-s03-receipt-mobile.png',
    fullPage: true,
  });
});
test('amount mismatch is review required and prominent in Admin, no receipt', async ({
  page,
  request,
}) => {
  await pending(page);
  await start(page);
  await request.post('http://127.0.0.1:54329/payment-fixture', {
    data: { amount: 1 },
  });
  await page.goto('/success');
  await expect(
    page.getByRole('heading', { name: 'Tu pago necesita revisión.' }),
  ).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
  const stats = await (
    await request.get('http://127.0.0.1:54329/stats')
  ).json();
  expect(stats.inventory.online_sold_units).toBe(0);
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill('founder@example.test');
  await page.getByLabel('Contraseña').fill('fixture-password');
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto('/admin/payments');
  await expect(
    page.getByRole('heading', { name: 'Pagos', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('MONTO NO COINCIDE', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page
      .getByText(
        /Dinero confirmado por proveedor: Sí · Inventario asignado: No/,
      )
      .first(),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: '/private/tmp/deipo-s03-admin-payments.png',
    fullPage: true,
  });
});
test('failed payment never renders receipt and allows a new attempt; API rejects foreign Origin', async ({
  page,
  request,
}) => {
  await pending(page);
  const first = await start(page);
  await request.post('http://127.0.0.1:54329/payment-fixture', {
    data: { status: 'failed' },
  });
  await page.goto('/success');
  await expect(
    page.getByRole('heading', { name: 'El pago no se completó.' }),
  ).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
  const second = await start(page);
  expect(second.status).toBe(200);
  expect(second.body.checkoutUrl).not.toBe(first.body.checkoutUrl);
  expect(
    (
      await request.post('/api/payments/recurrente/checkout', {
        headers: { origin: 'https://evil.example' },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post('/api/webhooks/recurrente', {
        data: { eventType: 'intent.succeeded' },
      })
    ).status(),
  ).toBe(401);
});

test('flat signed Testing fixtures persist diagnostics; malformed/signature failures do not persist', async ({
  request,
}) => {
  const stats = async () =>
    await (await request.get('http://127.0.0.1:54329/payment-stats')).json();
  const inventory = async () =>
    (await (await request.get('http://127.0.0.1:54329/stats')).json())
      .inventory;
  const before = await stats(),
    beforeInventory = await inventory();
  const deliver = async (data: Record<string, unknown>) =>
    await (
      await request.post('http://127.0.0.1:54329/payment-fixture', { data })
    ).json();
  const example = await deliver({ payload: flatPending });
  expect(example.status).toBe(200);
  expect(example.inbox).toHaveLength(1);
  expect(example.inbox[0].processing_status).toBe('environment_mismatch');
  const replay = await deliver({
    svixId: example.svixId,
    raw: JSON.stringify(
      Object.fromEntries(Object.entries(flatPending).reverse()),
      null,
      2,
    ),
  });
  expect(replay.status).toBe(200);
  expect(replay.inbox).toEqual(example.inbox);
  const conflict = await deliver({
    svixId: example.svixId,
    payload: { ...flatPending, amount_in_cents: 1 },
  });
  expect(conflict.status).toBe(503);
  expect(conflict.inbox).toEqual(example.inbox);
  const natural = {
    ...flatPending,
    live_mode: false,
    sandbox_id: 'sbx_isolated',
  };
  for (const [payload, expected] of [
    [natural, 'unmatched'],
    [{ ...natural, sandbox_id: 'sbx_other' }, 'environment_mismatch'],
    [{ ...natural, live_mode: true }, 'environment_mismatch'],
    [{ id: 'pa_legacy', event_type: 'payment_intent.succeeded' }, 'ignored'],
    [{ ...natural, event_type: 'intent.paid', status: 'paid' }, 'ignored'],
  ] as const) {
    const r = await deliver({ payload });
    expect(r.status).toBe(200);
    expect(r.inbox[0].processing_status).toBe(expected);
  }
  for (const [data, status] of [
    [{ payload: flatPending, invalid: true }, 401],
    [{ raw: '{"event_type":' }, 400],
    [
      {
        payload: {
          eventId: 'evt_old',
          eventType: 'intent.pending',
          data: flatPending,
        },
      },
      400,
    ],
    [{ payload: { event_type: 'intent.pending' } }, 400],
  ] as const) {
    const r = await deliver(data);
    expect(r.status).toBe(status);
    expect(r.inbox).toEqual([]);
  }
  const after = await stats();
  expect(after.inbox - before.inbox).toBe(6);
  expect(after.attempts).toBe(before.attempts);
  expect(await inventory()).toEqual(beforeInventory);
});

// Signed HTTP → durable inbox → SQL → inventory/receipt, using the observed
// unified Sandbox shape (synthetic IDs; amounts bound to the fixture order).
for (const [name, overrides, omitSandbox, expected, reason] of [
  ['absent live_mode', {}, false, 'processed', null],
  ['false live_mode', { live_mode: false }, false, 'processed', null],
  ['null live_mode', { live_mode: null }, false, 'processed', null],
  [
    'true live_mode',
    { live_mode: true },
    false,
    'environment_mismatch',
    'ENVIRONMENT_MISMATCH',
  ],
  ['missing sandbox', {}, true, 'environment_mismatch', 'ENVIRONMENT_MISMATCH'],
  [
    'different sandbox',
    { sandbox_id: 'sbx_other' },
    false,
    'environment_mismatch',
    'ENVIRONMENT_MISMATCH',
  ],
  [
    'invalid amount without live_mode',
    { amount_in_cents: 1 },
    false,
    'review_required',
    'AMOUNT_MISMATCH',
  ],
  [
    'wrong checkout without live_mode',
    { checkout: { id: 'ch_unknown' } },
    false,
    'unmatched',
    'UNMATCHED_CHECKOUT',
  ],
] as const) {
  test(`signed unified Sandbox: ${name}`, async ({ page, request }) => {
    await pending(page);
    expect((await start(page)).status).toBe(200);
    const stats = async () =>
      (await (await request.get('http://127.0.0.1:54329/stats')).json())
        .inventory;
    const before = await stats();
    const body = { unified: true, overrides, omitSandbox };
    const deliver = async (data: Record<string, unknown>) =>
      (
        await request.post('http://127.0.0.1:54329/payment-fixture', { data })
      ).json();
    const invalid = await deliver({ ...body, invalid: true });
    expect(invalid.status).toBe(401);
    expect(invalid.inbox).toEqual([]);
    expect(await stats()).toEqual(before);
    const result = await deliver(body);
    expect(result.status).toBe(200);
    expect(result.inbox[0].processing_status).toBe(expected);
    expect(result.inbox[0].processing_error).toBe(reason);
    const replay = await deliver({ ...body, svixId: result.svixId });
    expect(replay.status).toBe(200);
    expect(replay.inbox).toEqual(result.inbox);
    const after = await stats();
    expect(after.online_sold_units).toBe(expected === 'processed' ? 1 : 0);
    if (expected === 'processed') {
      expect(after.held_units).toBe(0);
      expect(after.available).toBe(before.available);
    } else if (
      expected === 'environment_mismatch' ||
      expected === 'unmatched'
    ) {
      expect(after).toEqual(before);
    }
    await page.goto('/success');
    if (expected === 'processed') {
      await expect(
        page.getByRole('article', { name: 'Recibo de pago verificado' }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole('article', { name: 'Recibo de pago verificado' }),
      ).toHaveCount(0);
    }
  });
}
