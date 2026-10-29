import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { seedPassword, seedPasswordMissing } from './seed-password';

/** The origin the SPA resolves uploaded media against, so an <img src> can be compared here. */
const API = 'http://localhost:5080';
const VIEWPORTS = [320, 768, 1024, 1440];

/**
 * A page of the real catalogue against real SQL Server has measured ~26 s on this box, so the
 * assertions that wait for loaded data name this budget explicitly instead of relying on the config
 * default. Waiting for a response is not an alternative: the catalogue is polled, so any
 * /api/products reply could belong to another page.
 */
const LOADED = { timeout: 90_000 };

/** 1x1 PNG - the API checks the file header, so the bytes have to be an actual picture. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

type ProductLite = { id: number; sku: string; name: string; imageUrl?: string; images?: unknown[] };

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(seedPassword);
  await page.getByRole('button', { name: 'LOGIN', exact: true }).click();
  // The account menu only renders once the session is really written; waiting for the redirect alone
  // lets a later goto() race it and be bounced back to the login page.
  await expect(page.getByRole('button', { name: 'Account' }), 'sign-in established no session')
    .toBeVisible(LOADED);
}

async function token(request: APIRequestContext, email: string): Promise<string> {
  const response = await request.post(`${API}/api/auth/login`, { data: { email, password: seedPassword } });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

test.describe('Catalogue cards', () => {
  test.skip(!seedPassword, seedPasswordMissing);
  test.setTimeout(300_000);

  test('fits the viewport at every width, keeps the SKU off the card and always shows media', async ({ page }) => {
    await signIn(page, 'customer@ninecube.demo');
    await page.goto('/products');
    const cards = page.locator('.product-card');
    await expect(cards.first(), 'no card rendered').toBeVisible(LOADED);

    for (const width of VIEWPORTS) {
      await page.setViewportSize({ width, height: 900 });
      const count = await cards.count();
      expect(count).toBeGreaterThan(0);

      // Nothing may push the page sideways - a 63 character SKU inside a card used to do exactly that.
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `the page scrolls sideways at ${width}px`).toBeLessThanOrEqual(1);

      for (let index = 0; index < count; index++) {
        const card = cards.nth(index);
        await card.scrollIntoViewIfNeeded();
        await expect(card.locator('.product-card__sku')).toHaveCount(0);
        await expect(card.locator('.product-card__media img, .product-card__media .image-placeholder').first())
          .toBeVisible();
        await expect(card.locator('h3.product-card__name')).toHaveAttribute('title', /.+/);
      }

      // Equal heights in a row keep the price rows in a line; the grid stretches every card.
      const boxes = await page.$$eval('.grid-products > .product-card', nodes =>
        nodes.map(node => {
          const rect = (node as HTMLElement).getBoundingClientRect();
          return { top: Math.round(rect.top), height: Math.round(rect.height) };
        }));
      const rows = new Map<number, number[]>();
      for (const box of boxes) rows.set(box.top, [...(rows.get(box.top) ?? []), box.height]);

      for (const [top, heights] of rows) {
        expect(new Set(heights).size, `cards in the row at y=${top} differ in height at ${width}px`).toBe(1);
      }

      // 320px fits a single 200px column; wider viewports must place cards side by side.
      const middle = await page.evaluate(() =>
        Math.round((document.querySelector('.catalogue-main') as HTMLElement).getBoundingClientRect().width));
      const widestRow = Math.max(...[...rows.values()].map(heights => heights.length));
      // The sidebar's own contract decides how much is left for the results: at 1024 the grid is
      // 280px sidebar + results + 320px cart, which leaves ~330px in the middle - one card, not two.
      // From 1280 up the middle column always takes two 200px cards.
      const expected = width <= 479 ? 1 : width < 1024 ? 2 : width < 1280 ? 1 : 2;
      expect(widestRow, `the grid shows ${widestRow} column(s) at ${width}px, expected ${expected}`)
        .toBeGreaterThanOrEqual(expected);
      // A single column is only acceptable because the column is narrow, never because it collapsed.
      expect(middle, `the results column collapsed at ${width}px`).toBeGreaterThanOrEqual(200);
    }
  });
});

test.describe('Product pictures', () => {
  test.skip(!seedPassword, seedPasswordMissing);
  test.setTimeout(300_000);

  test('an upload is stored, served from /uploads and drawn on the card', async ({ page, request }) => {
    const headers = { Authorization: `Bearer ${await token(request, 'inventory@ninecube.demo')}` };

    // A product the seed left without a picture, chosen from live data: this run gives one a picture,
    // so a fixed SKU would stop being imageless the next time the spec runs.
    const listed = await request.get(`${API}/api/products?pageSize=50`, { headers });
    expect(listed.ok()).toBe(true);
    const items = ((await listed.json()) as { items: ProductLite[] }).items;
    const product = items.find(item => !item.imageUrl && (item.images?.length ?? 0) === 0);
    expect(product, 'the first page has no product without a picture').toBeTruthy();

    const upload = await request.post(`${API}/api/products/${product!.id}/images`, {
      headers,
      multipart: { file: { name: 'cycle-count.png', mimeType: 'image/png', buffer: PNG } }
    });
    expect(upload.status(), await upload.text()).toBe(201);
    const image = (await upload.json()) as { id: number; url: string; isPrimary: boolean };
    expect(image.url).toMatch(/^\/uploads\/[0-9a-f]{32}\.png$/);
    expect(image.isPrimary).toBe(true);

    const search = `/products?q=${encodeURIComponent(product!.sku)}`;
    const card = page.getByTestId(`product-${product!.id}`);

    try {
      // The stored path only counts if the file itself answers 200 with the same bytes.
      const served = await request.get(`${API}${image.url}`);
      expect(served.status()).toBe(200);
      expect(served.headers()['content-type']).toBe('image/png');
      expect(await served.body()).toEqual(PNG);

      const afterUpload = await request.get(`${API}/api/products/${product!.id}`, { headers });
      expect(((await afterUpload.json()) as ProductLite).imageUrl).toBe(image.url);

      await signIn(page, 'customer@ninecube.demo');
      await page.goto(search);
      await expect(card).toBeVisible(LOADED);
      await expect(card.locator('img')).toHaveAttribute('src', `${API}${image.url}`);
      await expect
        .poll(() => card.locator('img').evaluate(el => (el as HTMLImageElement).naturalWidth), LOADED)
        .toBeGreaterThan(0);

      // The detail page draws the same picture and keeps the SKU there instead of on the card.
      await card.locator('h3 a').click();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible(LOADED);
      await expect(page.locator('.sku-line code')).toHaveText(product!.sku);
    } finally {
      await request.delete(`${API}/api/products/${product!.id}/images/${image.id}`, { headers });
    }

    const missing = await request.get(`${API}${image.url}`);
    expect(missing.status(), 'a deleted picture stops being served').toBe(404);

    await page.goto(search);
    await expect(card.locator('.image-placeholder')).toBeVisible(LOADED);
  });
});

test.describe('Brand and series filter', () => {
  test.skip(!seedPassword, seedPasswordMissing);
  test.setTimeout(300_000);

  test('a deep link restores the selection, the chips and the result count', async ({ page, request }) => {
    const headers = { Authorization: `Bearer ${await token(request, 'customer@ninecube.demo')}` };
    const lines = (await (await request.get(`${API}/api/brands/apple/lines`, { headers })).json()) as {
      productCount: number;
      lines: Array<{ name: string; slug: string; productCount: number }>;
    };
    const series = lines.lines.find(line => line.productCount > 0);
    expect(series, 'Apple has no series with products in the seeded catalogue').toBeTruthy();

    await signIn(page, 'customer@ninecube.demo');
    await page.goto(`/products?brand=apple&line=${series!.slug}`);

    const panel = page.getByRole('complementary', { name: 'Catalogue filters' });
    const apple = panel.getByRole('checkbox', { name: /Apple/ });
    await expect(apple).toBeChecked(LOADED);
    await expect(panel.getByRole('checkbox', { name: series!.name })).toBeChecked();
    await expect(page.getByRole('button', { name: 'Remove Brand: Apple filter' })).toBeVisible();
    await expect(page.getByRole('button', { name: `Remove Series: ${series!.name} filter` })).toBeVisible();
    await expect(page.getByText(new RegExp(`${series!.productCount} products? found`))).toBeVisible();

    await page.getByRole('button', { name: `Remove Series: ${series!.name} filter` }).click();
    await expect(page).toHaveURL(/brand=apple/);
    await expect(page).not.toHaveURL(/line=/);
    await expect(apple).toBeChecked();

    // The number beside an option is the number of results clicking that option produces.
    const promised = await apple.evaluate(el => (el.closest('label')!.textContent ?? '').replace(/\D/g, ''));
    await page.goto('/products?brand=apple');
    await expect(page.getByText(new RegExp(`${promised} products? found`))).toBeVisible(LOADED);

    // The panel's own reset; the empty state offers "Reset all filters" and nothing else does.
    await page.getByRole('button', { name: /reset all/i }).click();
    await expect(page).toHaveURL(/\/products$/);
  });
});
