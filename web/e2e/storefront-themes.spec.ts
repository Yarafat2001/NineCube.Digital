import { expect, test } from '@playwright/test';

const product = { id: 9101, name: 'Preview laptop', sku: 'PREVIEW-1', price: 1200, currency: 'BDT', stockQuantity: 5,
  isActive: true, rowVersion: null, brandName: 'Preview', imageUrl: null, images: [], categories: [], tags: [] };
const variant = { ...product, id: 9102, name: 'Preview shoe options', hasVariants: true };

test('storefront and gallery remain readable in both themes on desktop and mobile', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(cached => localStorage.setItem('ninecube:recent_views', JSON.stringify([cached])), { ...product, price: 10 });
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/api/')) return route.continue();
    if (path === '/api/products') return route.fulfill({ json: { items: [product, variant], totalCount: 2, page: 1, pageSize: 8, totalPages: 1 } });
    if (path === '/api/products/9101') return route.fulfill({ json: product });
    if (path === '/api/products/low-stock-threshold') return route.fulfill({ json: { lowStockThreshold: 3 } });
    if (path.startsWith('/api/reviews/products/')) return route.fulfill({ json: { totalReviews: 0, averageRating: 0, recentReviews: [] } });
    if (path === '/api/categories') return route.fulfill({ json: [{ id: 1, name: 'Live electronics', slug: 'live-electronics', productCount: 2,
      isActive: true, children: [], breadcrumb: [], path: '/1/', depth: 1, parentId: null }] });
    return route.fulfill({ json: [] });
  });
  const sha = process.env.E2E_DEPLOYMENT_SHA;
  await page.goto(sha ? `./?v=${sha}#/` : './#/');
  if (sha) expect((await (await page.request.get(new URL(`version.json?check=${Date.now()}`, info.project.use.baseURL).href)).json()).version).toBe(sha);
  await expect(page.getByRole('heading', { name: 'Available to shop' })).toBeVisible();
  await expect(page.locator('.home-category-card')).toHaveCount(1);
  await expect(page.locator('.home-category-card')).toHaveAttribute('href', '#/products?category=live-electronics');
  await expect(page.locator('.home-category-count')).toHaveText('2 items');
  await expect(page.locator('.home-deal-card').filter({ hasText: variant.name }).getByRole('link', { name: 'Choose options' })).toBeVisible();
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: `Switch to ${theme} theme`, exact: true }).click();
      const card = page.locator('.recently-viewed__card').first();
      await expect(card).toBeVisible();
      expect(await card.evaluate(el => getComputedStyle(el).backgroundImage)).toContain('gradient');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath(`home-${theme}-${width}.png`), fullPage: true });
    }
  }
  await page.locator('.recently-viewed__add-btn').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ninecube.cart.v1') ?? '[]')[0]?.unitPrice)).toBe(1200);
  await page.getByRole('searchbox', { name: 'Find your next favourite' }).fill('laptop');
  await page.getByRole('search', { name: 'Search the catalogue' }).getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/#\/products\?q=laptop/);
  await page.goto('./#/products/9101');
  const modes = page.getByRole('group', { name: 'Product view mode', exact: true });
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: `Switch to ${theme} theme`, exact: true }).click();
      for (const name of ['Photo', '3D photo']) {
        await modes.getByRole('button', { name, exact: true }).click();
        await expect(modes.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
        for (const button of await modes.getByRole('button').all()) {
          const contrast = await button.evaluate(el => {
            const style = getComputedStyle(el);
            const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number).slice(0, 3);
            const luminance = (channels: number[]) => channels.map(c => { const s = c / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
            const ink = luminance(rgb(style.color));
            const stops = style.backgroundImage.match(/rgba?\([^)]+\)/g) ?? [style.backgroundColor];
            return Math.min(...stops.map(stop => { const fill = luminance(rgb(stop)); return (Math.max(ink, fill) + .05) / (Math.min(ink, fill) + .05); }));
          });
          expect(contrast, `${theme} ${width}: ${await button.textContent()}`).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath(`gallery-${theme}-${width}.png`), fullPage: true });
    }
  }
  expect(errors).toEqual([]);
});
