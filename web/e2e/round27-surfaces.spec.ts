import { expect, test, type Page } from '@playwright/test';

/**
 * Round 27's four phone complaints and the two desktop ones, answered from the DOM: how many
 * navigation surfaces the dashboard shows, how much of a card photo the affordances paint over,
 * where the search sheet's category label sits, and whether the footer's bands line up on every
 * route. The API is stubbed the way CI's other customer specs stub it, so no password is needed.
 */
const USER = { id: 7, email: 'ngcian20@gmail.com', fullName: 'ngcian20', role: 'Customer' };
const PRODUCT = {
  id: 1, sku: 'BD-ACER-ASPI-3', name: 'Aspire 3 A325-42-V2 (8GB/256GB)', price: 57000, compareAtPrice: 64000,
  currency: 'BDT', stockQuantity: 10, isActive: true, rowVersion: 'AA', brandId: 3, brandName: 'Acer',
  brandSlug: 'acer', description: 'Ryzen 3; 8GB RAM; 256GB SSD.', imageUrl: '/products/48.webp', images: [],
  categories: [{ id: 1, name: 'Laptops', slug: 'laptops', isPrimary: true }], tags: []
};

async function stub(page: Page) {
  await page.addInitScript(session => sessionStorage.setItem('ninecube.auth.session', JSON.stringify(session)), {
    user: USER, accessToken: 'round27-surfaces', expiresAtUtc: '2099-01-01T00:00:00Z'
  });
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/products') {
      return json({
        items: Array.from({ length: 4 }, (_, i) => ({ ...PRODUCT, id: i + 1, name: `${PRODUCT.name} ${i}` })),
        page: 1, pageSize: 24, totalCount: 4, totalPages: 1, hasNext: false, hasPrevious: false
      });
    }
    if (path.startsWith('/api/products/')) return json(PRODUCT);
    if (path === '/api/categories') return json([{ id: 1, name: 'Laptops', slug: 'laptops', productCount: 4, isActive: true }]);
    if (path === '/api/brands') return json([{ id: 3, name: 'Acer', slug: 'acer', productCount: 4 }]);
    if (path === '/api/coupons/campaigns') return json([]);
    if (path === '/api/auth/me') return json(USER);
    if (path === '/api/me/dashboard') {
      return json({
        totalOrders: 6, totalSpent: 182500, currency: 'BDT', totalItems: 9, unreadNotifications: 0,
        ordersByStatus: [{ status: 'Delivered', count: 4 }, { status: 'Pending', count: 2 }],
        recentOrders: [{ id: 500, status: 'Delivered', totalAmount: 57000, currency: 'BDT', createdAt: '2026-10-01T10:00:00Z', itemCount: 2 }],
        recentNotifications: []
      });
    }
    if (path.startsWith('/api/me/notifications') || path === '/api/notifications') {
      return json({ items: [], page: 1, pageSize: 20, totalCount: 0, totalPages: 0 });
    }
    if (path.startsWith('/api/me')) return json({ user: USER, addresses: [], notifications: [] });
    if (path.startsWith('/api/wishlist')) return json([]);
    if (path.startsWith('/api/orders')) return json({ items: [], page: 1, pageSize: 10, totalCount: 0, totalPages: 0 });
    if (path.startsWith('/api/gift-cards')) return json({ items: [], totalCount: 0 });
    return json([]);
  });
}

test('phone: one account nav surface, a top-sheet search, an uncovered card photo', async ({ page }) => {
  await stub(page);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('./#/account');
  const tiles = page.locator('.account-hub-grid .account-hub-tile');
  await expect(tiles).toHaveCount(7);
  // One column: every tile spans the container, and no label is ellipsised to fit a half-width cell.
  const geometry = await tiles.evaluateAll(els => els.map(el => {
    const box = el.getBoundingClientRect();
    const clipped = Array.from(el.querySelectorAll('strong, .muted'))
      .some(node => (node as HTMLElement).scrollWidth > (node as HTMLElement).clientWidth + 1);
    return { width: Math.round(box.width), clipped };
  }));
  for (const tile of geometry) {
    expect(tile.width).toBeGreaterThan(300);
    expect(tile.clipped).toBe(false);
  }
  // The two surfaces that repeated the same destinations are gone on a phone.
  await expect(page.locator('.page-header .btn')).toHaveCount(0);
  expect(await page.locator('.quick-actions').evaluate(el => getComputedStyle(el).display)).toBe('none');

  await page.goto('./#/products');
  await page.getByRole('button', { name: 'Search catalogue' }).click();
  const dialog = page.locator('.spotlight-dialog');
  await expect(dialog).toBeVisible();
  const sheet = await dialog.boundingBox();
  expect(sheet!.x).toBeLessThanOrEqual(9);
  expect(sheet!.width).toBeGreaterThanOrEqual(372);
  const field = await page.locator('.spotlight-field').boundingBox();
  expect(field!.height).toBeGreaterThanOrEqual(44);
  // Label above the chips, chips using the sheet's full width.
  const label = await page.locator('.spotlight-categories-label').boundingBox();
  const list = await page.locator('.spotlight-categories-list').boundingBox();
  expect(list!.y).toBeGreaterThanOrEqual(label!.y + label!.height - 2);
  expect(list!.width).toBeGreaterThan(300);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  const media = await page.locator('.product-card__media-wrap').first().boundingBox();
  const wish = await page.locator('.product-card__wishlist-btn').first().boundingBox();
  const quick = await page.locator('.product-card__quick-view-btn').first().boundingBox();
  expect(wish!.width).toBe(32);
  expect(Math.abs(wish!.y - quick!.y)).toBeLessThan(2);
  // One 32px row of controls over the photo, where two 44px circles stacked covered 62% of it.
  expect(wish!.height / media!.height).toBeLessThan(0.25);
  await expect(page.locator('.product-card__compare-btn').first()).toBeVisible();
});

test('laptop: the hub yields to the button band, footer bands align on every route', async ({ page }) => {
  await stub(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto('./#/account');
  expect(await page.locator('.account-hub-grid').evaluate(el => getComputedStyle(el).display)).toBe('none');
  await expect(page.locator('.quick-actions .btn').first()).toBeVisible();

  for (const route of ['#/products', '#/account', '#/orders']) {
    await page.goto(`./${route}`);
    const inner = await page.locator('.site-footer__inner').boundingBox();
    const description = await page.locator('.site-footer__description').boundingBox();
    const policy = await page.locator('.site-footer__links').nth(1).boundingBox();
    // The tagline centres on the footer's own centreline, and the policy row spans the band.
    expect(Math.abs((description!.x + description!.width / 2) - (inner!.x + inner!.width / 2))).toBeLessThanOrEqual(2);
    expect(Math.abs(policy!.width - inner!.width)).toBeLessThanOrEqual(2);
  }

  await page.getByRole('button', { name: 'Account' }).hover();
  const email = page.locator('.account-menu__email');
  await expect(email).toBeVisible();
  // House scale, not the browser's 11px native tooltip face: 13px label over a 14px name.
  expect(await email.evaluate(el => getComputedStyle(el).fontSize)).toBe('13px');
  expect(await page.locator('.account-menu__name').evaluate(el => getComputedStyle(el).fontSize)).toBe('14px');
  expect(await page.locator('.account-name').getAttribute('title')).toBeNull();
});
