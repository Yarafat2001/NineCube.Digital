import { expect, test } from '@playwright/test';

/**
 * The home page without WebGL is the page every visitor who cannot run the scene gets, so this spec
 * answers the questions a screenshot cannot: which column the promotions sit in, how many offer tiles
 * the server's campaigns produce, and whether the bar and the cards still draw an edge over the page.
 * The API is stubbed here exactly the way CI's other customer specs stub it, so no password is needed.
 */
test('the home page lays out its hero, offers and edges at laptop and phone widths', async ({ page }) => {
  const PRODUCT = {
    id: 12, sku: 'BD-ACER-ASPI-3', name: 'Acer Aspire 3 A325-42-V2', price: 57000, compareAtPrice: 64000,
    currency: 'BDT', stockQuantity: 10, isActive: true, rowVersion: 'AA', brandId: 3, brandName: 'Acer',
    brandSlug: 'acer', description: 'Ryzen 3; 8GB RAM; 256GB SSD.', imageUrl: '/products/48.webp', images: [],
    categories: [{ id: 1, name: 'Laptops', slug: 'laptops', isPrimary: true }], tags: []
  };
  const campaigns = [
    { id: 1, code: 'SAVE10', discountType: 'Percentage', discountValue: 10, minOrderAmount: 0, maxDiscountCap: 1500, targetType: 'Order', expiresAt: null, usageLimit: null, usageCount: 0, isActive: true, isAutomatic: false, isBannerPromoted: true },
    { id: 4, code: 'EID2026', discountType: 'Percentage', discountValue: 15, minOrderAmount: 1000, maxDiscountCap: 2500, targetType: 'Category', targetId: 1, expiresAt: null, usageLimit: null, usageCount: 0, isActive: true, isAutomatic: false, isBannerPromoted: true },
    { id: 7, code: 'DURAMO25', discountType: 'Percentage', discountValue: 25, minOrderAmount: 0, maxDiscountCap: 3000, targetType: 'Product', targetId: 1, expiresAt: null, usageLimit: null, usageCount: 0, isActive: true, isAutomatic: false, isBannerPromoted: true },
    { id: 6, code: 'APEX15', discountType: 'Percentage', discountValue: 15, minOrderAmount: 500, maxDiscountCap: 1500, targetType: 'Brand', targetId: 1, expiresAt: null, usageLimit: null, usageCount: 0, isActive: true, isAutomatic: false, isBannerPromoted: true },
    { id: 5, code: 'AUTO2000', discountType: 'Percentage', discountValue: 10, minOrderAmount: 2000, maxDiscountCap: 2000, targetType: 'Order', expiresAt: null, usageLimit: null, usageCount: 0, isActive: true, isAutomatic: true, isBannerPromoted: true }
  ];
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/products') {
      return json({
        items: Array.from({ length: 12 }, (_, i) => ({ ...PRODUCT, id: 20 + i, name: `${PRODUCT.name} ${i}` })),
        page: 1, pageSize: 24, totalCount: 12, totalPages: 1, hasNext: false, hasPrevious: false
      });
    }
    if (path.startsWith('/api/products/')) return json(PRODUCT);
    if (path === '/api/categories') {
      return json(['Laptops', 'Kitchen', 'Footwear', 'Home'].map((name, i) =>
        ({ id: i + 1, name, slug: name.toLowerCase(), productCount: 12 - i * 2, isActive: true })));
    }
    if (path === '/api/brands') {
      return json([{ id: 3, name: 'Acer', slug: 'acer', productCount: 9 },
        { id: 4, name: 'Apex', slug: 'apex', productCount: 6 },
        { id: 5, name: 'Duramo', slug: 'duramo', productCount: 3 },
        { id: 6, name: 'Empty', slug: 'empty', productCount: 0 }]);
    }
    if (path === '/api/coupons/campaigns') return json(campaigns);
    return json([]);
  });

  await page.goto('./#/');
  const home = page.locator('.showcase--static');
  await expect(home.getByRole('heading', { level: 1 })).toBeVisible();

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme)
        await page.getByRole('button', { name: `Switch to ${theme} theme`, exact: true }).click();

      // The hero's copy keeps the first track, the live deal panel takes the second one on a
      // laptop, and the collection cards sit under the copy. On a phone everything stacks.
      const intro = await home.locator('.showcase__hero-intro').boundingBox();
      const promo = await home.locator('.hero-promotions').boundingBox();
      const deal = await home.locator('.hero-deal').boundingBox();
      expect(promo!.y).toBeGreaterThan(intro!.y + intro!.height - 8);
      if (width >= 1000) {
        expect(deal!.x).toBeGreaterThan(intro!.x + intro!.width - 8);
      } else {
        expect(deal!.y).toBeGreaterThan(promo!.y + promo!.height - 8);
      }
      // The actions row, the search and the CTA share the hero's own gap; stacked margins doubled it.
      // Measured from the row, because a browser that can run the scene adds the 3D launch button to it.
      const actions = await home.locator('.showcase__hero-actions').boundingBox();
      const search = await home.locator('.home-search').boundingBox();
      expect(search!.y - (actions!.y + actions!.height)).toBeLessThanOrEqual(24);

      // Four live campaigns reach the list; the fifth one is printed once, on the band above,
      // so the same discount never reads as two different offers.
      const offers = home.locator('.home-offers-section');
      await expect(offers.locator('.home-offer-card')).toHaveCount(4);
      await expect(home.locator('.home-campaign-banner').getByText('DURAMO25')).toBeVisible();
      await expect(offers.getByText('DURAMO25')).toHaveCount(0);

      // A browser that can run the scene gets the launch button; its ghost edge must survive both themes.
      const ghost = home.locator('.showcase__3d-btn');
      if (await ghost.count()) {
        const g = await ghost.evaluate(el => {
          const s = getComputedStyle(el);
          return { border: s.borderTopColor, bg: s.backgroundColor, ink: s.color };
        });
        expect(g.border).not.toBe('rgba(0, 0, 0, 0)');
        expect(g.bg).not.toBe('rgba(0, 0, 0, 0)');
        expect(g.ink).not.toBe('rgba(0, 0, 0, 0)');
      }
      // The offers grid is auto-fit: one card per row on a phone, all four on one row on a laptop.
      const columns = await offers.locator('.home-offers-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
      const rows = await offers.locator('.home-offer-card').evaluateAll(cards =>
        new Set(cards.map(card => Math.round(card.getBoundingClientRect().top))).size);
      if (width >= 1000) {
        expect(columns).toBe(4);
        expect(rows).toBe(1);
      } else {
        expect(columns).toBe(1);
        expect(rows).toBe(4);
      }
      const copy = await offers.locator('.home-offer-copy').first().boundingBox();
      expect(copy!.height).toBeGreaterThanOrEqual(width >= 900 ? 40 : 44);
      await expect(offers.getByText('Applied automatically at checkout')).toBeVisible();
      await expect(offers.getByText('AUTO2000')).toHaveCount(0);

      // The icon sits on the well's centreline, not beside it.
      const alignment = await offers.locator('.home-offer-icon').first().evaluate(element => {
        const icon = element.querySelector('svg')!.getBoundingClientRect();
        const well = element.getBoundingClientRect();
        return { dx: Math.abs((icon.left + icon.right) / 2 - (well.left + well.right) / 2), dy: Math.abs((icon.top + icon.bottom) / 2 - (well.top + well.bottom) / 2) };
      });
      expect(alignment.dx).toBeLessThan(2);
      expect(alignment.dy).toBeLessThan(2);

      // Only brands the catalogue says have products, and they are chips on a rail, not cards.
      await expect(home.locator('.home-brand-chip')).toHaveCount(3);
      await expect(home.locator('.home-brand-card')).toHaveCount(0);

      // The stock board is gone; it repeated the product grid in a dashboard shape.
      await expect(home.locator('.home-store-pulse')).toHaveCount(0);

      // Every surface keeps its edge: a transparent border is the old invisible card.
      for (const selector of ['.home-offer-card', '.home-category-card']) {
        const border = await home.locator(selector).first().evaluate(el => getComputedStyle(el).borderTopColor);
        expect(border).not.toBe('rgba(0, 0, 0, 0)');
      }

      // The bar keeps a painted fill and an edge after the page scrolls under it.
      await page.evaluate(() => window.scrollTo(0, 1400));
      await page.waitForTimeout(400);
      await page.evaluate(() => window.scrollTo(0, 1340));
      await page.waitForTimeout(400);
      const bar = home.page().locator('.navbar');
      await expect(bar).toHaveClass(/navbar--compact/);
      await expect(bar).not.toHaveClass(/navbar--hidden/);
      const paint = await bar.evaluate(el => {
        const s = getComputedStyle(el);
        return { fill: s.backgroundColor, edge: s.borderBottomColor, width: s.borderBottomWidth };
      });
      expect(paint.fill).not.toBe('rgba(0, 0, 0, 0)');
      expect(paint.edge).not.toBe('rgba(0, 0, 0, 0)');
      expect(paint.width).toBe('1px');

      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
  }

  // Copying a code puts the code on the clipboard label, not a toast the shopper has to catch.
  const copyButton = home.locator('.home-offer-copy').first();
  await copyButton.scrollIntoViewIfNeeded();
  await copyButton.click();
  await expect(copyButton).toContainText('Copied!');
});
