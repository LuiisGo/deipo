import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function moment(page: Page, index: number) {
  await expect(page.locator('#packaging')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const visual = page.locator('.packaging-visual');
  if (await visual.getAttribute('data-packaging-frame') === '-1') {
    await visual.scrollIntoViewIfNeeded();
    await expect(visual).not.toHaveAttribute('data-packaging-frame', '-1');
  }
  await page.locator('#packaging').evaluate((section, frame) => {
    const rect = section.getBoundingClientRect();
    const travel = rect.height - innerHeight;
    scrollTo({ top: scrollY + rect.top + travel * (frame + .4) / 6, behavior: 'instant' });
  }, index);
  await expect(page.locator('.packaging-visual')).toHaveAttribute('data-packaging-target', String(index));
}

for (const width of [390, 430, 768, 1440]) {
  test(`packaging scroll reveals six decoded frames and reverses at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/?mode=customer-preview');
    for (let index = 0; index < 6; index++) {
      await moment(page, index);
      await expect(page.locator('.packaging-visual')).toHaveAttribute('data-packaging-frame', String(index));
      const visible = page.locator('.packaging-layer[data-visible=true]');
      await expect(visible).toHaveCSS('opacity', '1');
      await expect(visible.locator('img')).toHaveJSProperty('complete', true);
      expect(await visible.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      expect(await page.locator('.packaging-visual').evaluate(el => {
        const box = el.getBoundingClientRect();
        const header = document.querySelector('.navigation')!.getBoundingClientRect();
        return box.top >= header.bottom && box.bottom <= innerHeight;
      })).toBe(true);
      await page.screenshot({ path: `test-results/packaging-${width}-${index + 1}.png` });
    }
    await moment(page, 0);
    await expect(page.locator('.packaging-visual')).toHaveAttribute('data-packaging-frame', '0');
    await page.keyboard.press('PageDown');
    await expect(page.locator('.packaging-visual')).not.toHaveAttribute('data-packaging-frame', '0');
    await expect(page.locator('#packaging').getByRole('button')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    if (width === 390) expect((await new AxeBuilder({ page }).include('#packaging').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  });
}

test('packaging skips a failed image without a blank stage', async ({ page }) => {
  await page.route('**/*frame-04-half-open*', route => route.abort());
  await page.goto('/?mode=customer-preview');
  await moment(page, 2);
  await expect(page.locator('.packaging-visual')).toHaveAttribute('data-packaging-frame', '2');
  await moment(page, 3);
  await expect(page.locator('.packaging-visual')).toHaveAttribute('data-packaging-frame', '2');
  await moment(page, 4);
  await expect(page.locator('.packaging-visual')).toHaveAttribute('data-packaging-frame', '4');
  await expect(page.locator('.packaging-placeholder')).toHaveCount(0);
});

for (const height of [601, 667]) {
  test(`short portrait packaging stays below the header at 430x${height}`, async ({ page }) => {
    await page.setViewportSize({ width: 430, height });
    await page.goto('/?mode=preview');
    for (const index of [0, 3, 5]) {
      await moment(page, index);
      await expect(page.locator('.packaging-visual')).toHaveAttribute('data-packaging-frame', String(index));
      // Programmatic scrolling jumps past the header's existing collapse transition.
      await expect(page.locator('.navigation')).toHaveCSS('height', '72px');
      expect(await page.locator('.packaging-sticky').evaluate(el => {
        const heading = el.querySelector('.packaging-copy')!.getBoundingClientRect();
        const image = el.querySelector('.packaging-visual')!.getBoundingClientRect();
        return heading.top >= document.querySelector('.navigation')!.getBoundingClientRect().bottom && image.bottom <= innerHeight;
      })).toBe(true);
    }
  });
}

test('packaging waits for a delayed image to decode before revealing it', async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/*frame-04-half-open*', async route => { await gate; await route.continue(); });
  await page.goto('/?mode=customer-preview', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.packaging-visual').scrollIntoViewIfNeeded();
  await expect(page.locator('.packaging-visual')).not.toHaveAttribute('data-packaging-frame', '-1');
  await moment(page, 2);
  await expect(page.locator('.packaging-visual')).toHaveAttribute('data-packaging-frame', '2');
  await moment(page, 3);
  await expect(page.locator('.packaging-visual')).toHaveAttribute('data-packaging-frame', '2');
  release();
  await expect(page.locator('.packaging-visual')).toHaveAttribute('data-packaging-frame', '3');
  await expect(page.locator('.packaging-layer[data-visible=true] img')).toHaveJSProperty('complete', true);
});

test('packaging handles total image failure without an empty pinned journey', async ({ page }) => {
  await page.route('**/*', route => decodeURIComponent(route.request().url()).includes('/packaging/frame-') ? route.abort() : route.continue());
  await page.goto('/?mode=customer-preview');
  await page.locator('.packaging-visual').scrollIntoViewIfNeeded();
  await expect(page.locator('#packaging')).toHaveAttribute('data-packaging-static', 'true');
  await expect(page.getByText('El próximo detalle está en camino.')).toBeVisible();
  await expect(page.locator('.packaging-layer')).toHaveCount(0);
  await expect(page.locator('.packaging-sticky')).toHaveCSS('position', 'relative');
});

test('short landscape viewports use a static ritual without clipping', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/?mode=customer-preview');
  await page.locator('.packaging-visual').scrollIntoViewIfNeeded();
  await expect(page.locator('.packaging-visual')).toHaveAttribute('data-packaging-frame', '5');
  await expect(page.locator('#packaging')).toHaveAttribute('data-packaging-static', 'true');
  await expect(page.locator('.packaging-sticky')).toHaveCSS('position', 'relative');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
