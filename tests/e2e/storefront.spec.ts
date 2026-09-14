import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function completeSteps(page: Page, mode: 'pickup' | 'delivery' = 'pickup') {
  await page.getByRole('button', { name: 'Aumentar cantidad' }).click();
  await page.getByRole('button', { name: 'CONTINUAR', exact: false }).click();
  if (mode === 'pickup') await page.getByText('Lo paso a recoger', { exact: true }).click();
  else { await page.getByLabel('Zona de entrega').selectOption('zone-10'); await page.getByLabel('Dirección', { exact: true }).fill('Dirección de prueba 123, Zona 10'); }
  await page.getByText('7:00–8:00 PM', { exact: true }).click();
  await page.getByRole('button', { name: 'CONTINUAR', exact: false }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Cliente de prueba');
  await page.getByLabel('WhatsApp / teléfono').fill('+502 5555 1234');
  await page.getByLabel('Correo electrónico').fill('preview@example.com');
  await page.getByRole('button', { name: 'CONTINUAR', exact: false }).click();
  await page.getByLabel('Entiendo que es una prueba').check();
}

for (const width of [320, 375, 390, 430, 768, 1024, 1280, 1440]) {
  test(`responsive storefront has no overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('h1')).toHaveText('SUNDAY ROAST');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByText('VISTA PREVIA', { exact: true }).first()).toBeVisible();
    if (width === 390 || width === 1440) {
      await page.locator('.box-image').scrollIntoViewIfNeeded();
      await expect(page.locator('.box-image img')).toHaveJSProperty('complete', true);
      await page.evaluate(() => window.scrollTo({top: 0, behavior: 'instant'}));
      await page.screenshot({ path: `test-results/home-${width}.png`, fullPage: true });
    }
  });
}
test('purchase, pickup, receipt, print and sensitive-storage boundary', async ({ page }) => {
  await page.goto('/checkout'); await completeSteps(page);
  await expect(page.locator('.summary-total')).toContainText('Q350.00');
  const storage = await page.evaluate(() => JSON.stringify({ ...sessionStorage }));
  expect(storage).not.toMatch(/Cliente|preview@|5555/);
  await page.getByRole('button', { name: 'COMPLETAR PRUEBA' }).click();
  await expect(page).toHaveURL(/success/);
  await expect(page.locator('.receipt-paper')).toContainText('Cliente de prueba');
  await expect(page.locator('.receipt-total')).toContainText('Q350.00');
  await expect(page.locator('.receipt-window')).toContainText('7:00–8:00 PM');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.receipt-actions')).toBeHidden();
  await expect(page.locator('.printer-edge')).toBeHidden();
  await page.pdf({ path: 'test-results/receipt.pdf', preferCSSPageSize: true });
  await page.emulateMedia({ media: 'screen', reducedMotion: 'reduce' });
  await expect(page.locator('.receipt-paper')).toHaveCSS('animation-name', 'none');
  await page.screenshot({ path: 'test-results/receipt.png', fullPage: true });
  await page.reload();
  await expect(page.getByText('Completá el checkout de prueba', { exact: false })).toBeVisible();
});
test('delivery flow and payment failure allow a safe retry', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/checkout?payment=fail'); await completeSteps(page, 'delivery');
  await page.getByRole('button', { name: 'COMPLETAR PRUEBA' }).click();
  await expect(page.locator('.form-error[role=alert]')).toContainText('No se realizó ningún cobro');
  await page.getByRole('button', { name: 'COMPLETAR PRUEBA' }).click();
  await expect(page).toHaveURL(/success/);
  await page.getByText('DETALLES DEL PEDIDO', { exact: true }).click();
  await expect(page.locator('.receipt-order-details')).toContainText('Dirección de prueba 123');
});
for (const state of ['sold_out', 'sales_closed', 'upcoming']) {
  test(`${state} state blocks purchase and exposes honest waitlist`, async ({ page }) => {
    await page.goto(`/?state=${state}`);
    await expect(page.locator('#next-drop')).toBeVisible();
    await page.locator('#next-drop').getByLabel('Nombre', { exact: true }).fill('Prueba');
    await page.locator('#next-drop').getByLabel('WhatsApp / teléfono').fill('55551234');
    await page.locator('#next-drop').getByLabel('Correo electrónico').fill('demo@example.com');
    await page.getByRole('button', { name: 'AVISAME DEL PRÓXIMO DROP' }).click();
    await expect(page.getByRole('status')).toContainText('No quedaste suscrito');
    await page.goto(`/checkout?state=${state}`);
    await expect(page.getByText('Este drop no está recibiendo pedidos.', { exact: false })).toBeVisible();
  });
}
test('no slots, invalid fields, unknown fee and quantity higher than available are blocked', async ({ page }) => {
  await page.goto('/checkout?slots=none');
  await page.getByRole('button', { name: 'CONTINUAR', exact: false }).click();
  await expect(page.getByRole('button', { name: 'CONTINUAR', exact: false })).toBeDisabled();
  await expect(page.locator('.form-error[role=alert]')).toContainText('No hay horarios');
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'CONTINUAR', exact: false }).click();
  await page.getByLabel('Zona de entrega').selectOption('outside');
  await page.getByLabel('Dirección', { exact: true }).fill('Dirección de prueba 123');
  await page.getByText('7:00–8:00 PM', { exact: true }).click();
  await page.getByRole('button', { name: 'CONTINUAR', exact: false }).click();
  await expect(page.locator('.form-error[role=alert]')).toContainText('está por confirmar');
  await page.evaluate(() => sessionStorage.setItem('deipo-selection-v1', JSON.stringify({ quantity: 80, extras: [], fulfillment: 'pickup', slot: '19-20' })));
  await page.goto('/checkout?state=low_stock');
  await page.getByRole('button', { name: 'CONTINUAR', exact: false }).click();
  await expect(page.locator('.form-error[role=alert]')).toContainText('Quedan 6');
});
test('fixed countdown expires, low-stock is real snapshot, and missing image has fallback', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-19T05:58:59Z') });
  await page.goto('/?clock=demo');
  await page.clock.runFor(2100);
  await expect(page.locator('h1')).toContainText('ORDERS CLOSED');
  await page.goto('/?state=low_stock');
  await expect(page.locator('.navigation .stock-state')).toContainText('QUEDAN 6');
  await page.goto('/?image=missing');
  await expect(page.locator('.hero-food')).toContainText('IMAGEN NO DISPONIBLE');
});
test('home and checkout pass WCAG A/AA automated checks', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  // Audit the settled interface, not a partially transparent entrance frame.
  await expect(page.locator('.brand-stage')).toHaveCSS('opacity', '1');
  await expect(page.locator('.campaign-title')).toHaveCSS('opacity', '1');
  const home = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(home.violations).toEqual([]);
  await page.goto('/checkout');
  const checkout = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(checkout.violations).toEqual([]);
});
test('all legal pages and honest success empty state exist without browser errors', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  for (const slug of ['terms', 'privacy', 'orders', 'quality']) {
    const response = await page.goto(`/legal/${slug}`); expect(response?.status()).toBe(200);
    await expect(page.getByText('BORRADOR — REQUIERE REVISIÓN LEGAL')).toBeVisible();
  }
  await page.goto('/success'); await expect(page.getByText('PROBAR EL CHECKOUT', { exact: false })).toBeVisible();
  expect(errors).toEqual([]);
});
