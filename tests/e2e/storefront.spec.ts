import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function completeSteps(page: Page, mode: 'pickup' | 'delivery' = 'pickup') {
  await page.getByRole('button', { name: 'Aumentar cantidad' }).click();
  await page.getByRole('button', { name: 'CONTINUAR', exact: false }).click();
  if (mode === 'pickup') await page.getByText('Lo paso a recoger', { exact: true }).click();
  else { await page.getByLabel('Zona de entrega').selectOption('zone-10'); await page.getByLabel('Dirección', { exact: true }).fill('Dirección de prueba 123, Zona 10'); }
  await page.getByText('19:00 — 20:00', { exact: true }).click();
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
  await expect(page.locator('.receipt-window')).toContainText('19:00 — 20:00');
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
  await page.getByText('19:00 — 20:00', { exact: true }).click();
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

for (const width of [390, 1440]) {
  test(`V0.1 presentation states and approved artwork at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const mode of ['preview', 'customer-preview']) {
      for (const state of ['active', 'low_stock', 'sold_out', 'sales_closed', 'upcoming']) {
        await page.goto(`/?mode=${mode}&state=${state}`);
        await page.evaluate(() => document.fonts.ready);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await expect(page.locator('.hero-wordmark')).toHaveAttribute('data-logo-status', 'approved-png');
        await expect(page.locator('.hero-wordmark')).toHaveJSProperty('complete', true);
        if (mode === 'customer-preview') {
          await expect(page.locator('.presentation-notice')).toContainText('PEDIDOS NO HABILITADOS');
          await expect(page.locator('.demo-banner, .preview-controls')).toHaveCount(0);
          await expect(page.locator('main')).not.toContainText(/PRECIO ESTIMADO|FOTOGRAFÍA ILUSTRATIVA|CONCEPTO DE EMPAQUE/);
        } else await expect(page.locator('.preview-controls')).toBeVisible();
        if (['sold_out', 'sales_closed', 'upcoming'].includes(state)) {
          await expect(page.locator('.purchase-panel, .quantity-control, .countdown, .final-drop')).toHaveCount(0);
          await expect(page.locator('a[href^="/checkout"]')).toHaveCount(0);
          await expect(page.locator('.navigation .stock-state')).toContainText('NEXT DROP');
          await expect(page.locator('.next-chapter')).toBeVisible();
          if (state === 'sold_out') await expect(page.locator('#the-drop')).toContainText('DROP 001 / ARCHIVE');
          else {
            await expect(page.locator('.navigation .stock-indicator')).not.toContainText(/013|040|080|SOLD/);
            await expect(page.locator('#next-drop .opening-information')).toContainText('MARTES 00:00');
          }
        } else {
          await expect(page.locator('.navigation .stock-state')).toContainText('GET THE DROP');
          await expect(page.locator('.purchase-panel')).toContainText('Q175.00');
          await expect(page.locator('.campaign-aside')).toContainText('80 POR EDICIÓN');
          if (state === 'active') await expect(page.locator('.navigation .stock-sold')).toHaveText('013');
          const cta = page.locator('.navigation .stock-indicator');
          expect(await cta.evaluate(el => { const r=el.getBoundingClientRect(); return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2) === el || el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); })).toBe(true);
        }
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
        expect(await page.locator('body').innerText()).not.toMatch(/\b\d{1,2}(?::\d{2})?\s*(?:AM|PM)\b/i);
        await page.locator('.box-image').scrollIntoViewIfNeeded();
        await expect(page.locator('.box-image img')).toHaveJSProperty('complete', true);
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
        await page.screenshot({ path: `test-results/v01-${mode}-${state}-${width}.png`, fullPage: true });
      }
    }
  });
  test(`customer presentation retains mock checkout and receipt at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?mode=customer-preview');
    await page.locator('.navigation .stock-indicator').click();
    await expect(page).toHaveURL(/checkout\?mode=customer-preview/);
    await expect(page.locator('.demo-banner')).toContainText('NO SE REALIZARÁ NINGÚN COBRO');
    await page.screenshot({ path: `test-results/v01-checkout-step-0-${width}.png`, fullPage: true });
    await completeSteps(page);
    await page.screenshot({ path: `test-results/v01-checkout-review-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'COMPLETAR PRUEBA' }).click();
    await expect(page).toHaveURL(/success\?mode=customer-preview/);
    await expect(page.locator('.receipt-total')).toContainText('Q350.00');
    await expect(page.locator('.receipt-paper')).toContainText('SIN COBRO · SIN RESERVA');
    await expect(page.locator('.receipt-heading img')).toHaveAttribute('data-logo-status', 'approved-png');
    await page.screenshot({ path: `test-results/v01-receipt-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.receipt-back').click();
    await expect(page).toHaveURL(/mode=customer-preview/);
  });
}

test('packaging details are keyboard controlled and reduced motion remains static', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?mode=customer-preview');
  const packaging = page.locator('.packaging-visual');
  await packaging.scrollIntoViewIfNeeded();
  await expect(packaging).toHaveAttribute('data-packaging-frame', '0');
  const seal = packaging.getByRole('button', { name: '02 EL SELLO' });
  await seal.focus(); await page.keyboard.press('Enter');
  await expect(seal).toHaveAttribute('aria-pressed', 'true');
  await expect(packaging).toHaveAttribute('data-packaging-frame', '1');
  await expect(page.locator('.box-image img')).toHaveJSProperty('complete', true);
  await page.screenshot({ path: 'test-results/v01-packaging-seal.png', fullPage: false });
  await packaging.getByRole('button', { name: '03 LA MARCA' }).click();
  await page.screenshot({ path: 'test-results/v01-packaging-wordmark.png', fullPage: false });
  await packaging.getByRole('button', { name: '04 EL RITUAL' }).click();
  await expect(packaging).toHaveAttribute('data-packaging-frame', '3');
});

test('customer archive and receipt meet automated accessibility checks', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?state=sold_out&mode=customer-preview');
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.goto('/checkout?mode=customer-preview'); await completeSteps(page);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'COMPLETAR PRUEBA' }).click();
  await expect(page).toHaveURL(/success/);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
});


test('preview defaults and Netlify badge clearance keep the mobile action safe', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?mode=production');
  await expect(page.locator('.demo-banner')).toContainText('VISTA PREVIA');
  await expect(page.locator('.skip-link')).toHaveCSS('clip-path', 'inset(50%)');
  // Reproduce the observed hosting overlay without loading a third-party script.
  await page.evaluate(() => {
    const badge=document.createElement('iframe');badge.id='nl-badge-frame';badge.title='Hosting badge test';
    badge.style.cssText='position:fixed;bottom:16px;right:16px;width:176px;height:42px;z-index:9999;border:0';
    document.body.appendChild(badge);
  });
  const cta=page.locator('.navigation .stock-indicator');
  const badge=page.locator('#nl-badge-frame');
  const ctaBox=await cta.boundingBox(); const badgeBox=await badge.boundingBox();
  expect(ctaBox!.y+ctaBox!.height).toBeLessThan(badgeBox!.y);
  await cta.click(); await expect(page).toHaveURL(/checkout/);
  await page.reload(); await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await expect(page.locator('.skip-link')).toHaveCSS('clip-path', 'none');
  expect((await page.locator('.skip-link').boundingBox())!.y).toBeGreaterThanOrEqual(0);
});

for (const width of [320, 390, 430]) {
  test(`mobile signal stays usable while compacting and returning at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/?mode=customer-preview');
    await page.evaluate(() => document.fonts.ready);
    const nav = page.locator('.navigation');
    const signal = nav.locator('.stock-indicator');
    await expect(signal).toContainText('013');
    await expect(nav).toHaveAttribute('data-signal', 'expanded');
    await signal.focus();
    await page.evaluate(() => scrollTo({ top: 400, behavior: 'instant' }));
    await expect(nav).toHaveAttribute('data-signal', 'compact');
    await expect(nav).toHaveCSS('height', '72px');
    await expect(signal).toBeFocused();
    const navBox = (await nav.boundingBox())!;
    const signalBox = (await signal.boundingBox())!;
    const logoBox = (await nav.locator('img').boundingBox())!;
    expect(navBox.y).toBe(0);
    expect(signalBox.y).toBeGreaterThanOrEqual(navBox.y);
    expect(signalBox.y + signalBox.height).toBeLessThanOrEqual(navBox.y + navBox.height);
    expect(signalBox.x).toBeGreaterThan(logoBox.x + logoBox.width);
    expect(signalBox.height).toBeGreaterThanOrEqual(44);
    expect(await signal.evaluate(el => { const r=el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); })).toBe(true);
    await page.screenshot({ path: `test-results/v02-signal-compact-${width}.png` });
    await page.evaluate(() => scrollTo({ top: 180, behavior: 'instant' }));
    await expect(nav).toHaveAttribute('data-signal', 'compact');
    await page.evaluate(() => scrollTo({ top: 80, behavior: 'instant' }));
    await expect(nav).toHaveAttribute('data-signal', 'expanded');
    await expect(nav).toHaveCSS('height', '128px');
    await expect(signal).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/checkout\?mode=customer-preview/);
  });
}

test('stock movement is bounded and opt-in for preview; customer-preview remains stable', async ({ page }) => {
  await page.clock.install();
  await page.goto('/?mode=preview&stock=drift');
  const sold = page.locator('.navigation .stock-sold');
  await expect(sold).toHaveText('013');
  await expect(page.locator('.stock-demo-notice')).toContainText('SIN VENTAS REALES');
  for (const count of ['014', '016', '018']) { await page.clock.runFor(12000); await expect(sold).toHaveText(count); }
  await page.clock.runFor(120000);
  await expect(sold).toHaveText('018');
  expect(await page.locator('.stock-track > span').evaluate(el => (el as HTMLElement).style.width)).toBe('22.5%');
  await page.goto('/?mode=customer-preview&stock=drift');
  await expect(page.locator('.stock-demo-notice, .preview-controls')).toHaveCount(0);
  await page.clock.runFor(180000);
  await expect(sold).toHaveText('013');
  await page.goto('/?mode=preview');
  await page.clock.runFor(180000);
  await expect(sold).toHaveText('013');
  await page.goto('/?mode=preview&stock=drift&state=low_stock');
  await page.clock.runFor(36000);
  await expect(sold).toHaveText('079');
  await expect(page.locator('.navigation .stock-state')).toContainText('QUEDA 1');
});

test('opening boundary updates homepage and blocks then opens the same checkout', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-15T05:59:57Z') });
  await page.goto('/?mode=customer-preview&opening=demo');
  await expect(page.locator('h1')).toContainText('COMING SOON');
  await expect(page.locator('.navigation .stock-indicator')).not.toHaveAttribute('href', /checkout/);
  await page.clock.runFor(4000);
  await expect(page.locator('h1')).toHaveText('SUNDAY ROAST');
  await page.locator('.navigation .stock-indicator').click();
  await expect(page).toHaveURL(/checkout/);
  await expect(page.getByRole('button', { name: 'CONTINUAR' })).toBeVisible();
  await page.clock.setFixedTime(new Date('2026-09-15T05:00:00Z'));
  await page.goto('/checkout?mode=customer-preview&opening=demo');
  await expect(page.locator('.checkout-unavailable')).toContainText('COMING SOON');
});

test('compact closed signal pivots to next opening and respects reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?mode=customer-preview&state=sales_closed');
  await page.locator('.navigation .stock-indicator').focus();
  await page.evaluate(() => scrollTo({ top: 500, behavior: 'instant' }));
  const nav = page.locator('.navigation');
  await expect(nav).toHaveAttribute('data-signal', 'compact');
  await expect(nav.locator('.stock-opening-short')).toHaveText('MAR 00:00');
  await expect(nav.locator('.stock-indicator')).not.toContainText(/013|040|080|SOLD/);
  expect(await nav.evaluate(el => parseFloat(getComputedStyle(el).transitionDuration))).toBeLessThan(.01);
  await expect(nav.locator('.stock-indicator')).toHaveAttribute('href', '#next-drop');
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: 'test-results/v02-closed-compact-reduced.png' });
});
