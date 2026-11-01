import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { seedPassword, seedPasswordMissing } from './seed-password';

/**
 * The coupon scope builder over the real stack: the rule chips, the include/exclude switch, the
 * Any-and-All choice and the reach report are the parts an operator uses to decide how much money a
 * campaign can cost, so they are checked against the live catalogue rather than a mock.
 *
 * The API port is configurable because this box already reserves 5080 for another project:
 *   E2E_API_BASE=http://127.0.0.1:5099 E2E_BASE_URL=http://127.0.0.1:5199 npm run e2e coupon-scope-ui
 */
const API = process.env.E2E_API_BASE ?? 'http://127.0.0.1:5080';
const LOADED = { timeout: 90_000 };
const PREVIEW = '/api/coupons/scope-preview';

/** Land on the coupon builder with a session already in place. */
async function openBuilder(page: Page, request: APIRequestContext, theme: 'light' | 'dark') {
  const response = await request.post(`${API}/api/auth/login`, {
    data: { email: 'admin@ninecube.demo', password: seedPassword }
  });
  expect(response.ok(), `admin sign-in failed: ${await response.text()}`).toBe(true);
  const session = await response.json() as { accessToken: string };

  await page.addInitScript(({ session, theme }) => {
    sessionStorage.setItem('ninecube.auth.session', JSON.stringify(session));
    localStorage.setItem('ninecube-theme', theme);
  }, { session, theme });

  await page.goto('/#/admin');
  await expect(page.getByRole('heading', { name: /administration/i })).toBeVisible(LOADED);
  await page.getByRole('tab', { name: /coupons/i }).click();
  return { scopeCard: page.getByTestId('discount-step-3'), token: session.accessToken };
}

type PreviewRequest = { scopeRules?: Array<{ polarity: string; entityIds: number[] }> };
type PreviewAnswer = {
  matchedProducts: number;
  totalActiveProducts: number;
  matchedUnits: number;
  exposedStockValue: number;
  forecastDiscount: number;
  conflicts: unknown[];
};

/**
 * The panel debounces its check, so a number read from the screen can still belong to the previous
 * rule set. Waiting for the answer to *this* payload is the only way to compare two scopes.
 */
async function reachFor(page: Page, polarity: 'Is' | 'IsNot', action: () => Promise<void>): Promise<PreviewAnswer> {
  const waiting = page.waitForResponse(res => {
    if (!res.url().endsWith(PREVIEW)) return false;
    const payload = JSON.parse(res.request().postData() ?? '{}') as PreviewRequest;
    return payload.scopeRules?.length === 1 &&
      payload.scopeRules[0].polarity === polarity &&
      payload.scopeRules[0].entityIds.length === 2;
  }, { timeout: 120_000 });
  await action();
  const response = await waiting;
  expect(response.status(), `the reach check failed: ${await response.text()}`).toBe(200);
  return response.json() as Promise<PreviewAnswer>;
}

/** The panel reports "matched / total"; what the server answered must be what the operator reads. */
function parseReach(text: string | null): { matched: number; total: number } {
  const [matched, total] = (text ?? '').split('/').map(part => Number(part.replace(/[^\d.]/g, '')));
  return { matched, total };
}

async function shownReach(panel: Locator) {
  return parseReach(await panel.locator('dd').first().textContent());
}

async function expectShownReach(panel: Locator, matched: number, total: number) {
  await expect.poll(() => shownReach(panel), { timeout: 120_000 }).toEqual({ matched, total });
}

/** Leave the shop as it was found: deleting a coupon must drop its scope rows with it. */
async function deleteCouponByCode(request: APIRequestContext, token: string, code: string) {
  const headers = { Authorization: `Bearer ${token}` };
  const list = await request.get(`${API}/api/coupons`, { headers });
  expect(list.ok(), `the coupon list failed: ${await list.text()}`).toBe(true);
  const stored = ((await list.json()) as Array<{ id: number; code: string }>).find(c => c.code === code);
  expect(stored, `coupon ${code} was never stored`).toBeTruthy();

  const removed = await request.delete(`${API}/api/coupons/${stored!.id}`, { headers });
  expect(removed.ok(), `delete failed: ${await removed.text()}`).toBe(true);

  const after = await request.get(`${API}/api/coupons`, { headers });
  expect(((await after.json()) as Array<{ code: string }>).some(c => c.code === code),
    `coupon ${code} survived deletion`).toBe(false);
}

test.describe('coupon scope builder', () => {
  test.skip(!seedPassword, seedPasswordMissing);
  test.setTimeout(300_000);

  for (const theme of ['light', 'dark'] as const) {
    test(`${theme}: a two-brand rule reaches the catalogue, saves and reads back`, async ({ page, request }) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      const { scopeCard, token } = await openBuilder(page, request, theme);

      // A fresh code each run: the builder must be able to create, not merely re-run against residue.
      const code = `UIS${theme[0].toUpperCase()}${Date.now() % 100000}`;
      await page.locator('#coupon-code').fill(code);
      await page.locator('#coupon-value').fill('10');

      await page.getByRole('button', { name: 'Brand', exact: true }).click();
      const brand = scopeCard.locator('.scope-rule').filter({ hasText: 'Brand' }).first();
      await expect(brand.getByText('Nothing chosen yet')).toBeVisible();

      // Search, then pick: the real brand list is longer than one screen.
      await brand.getByRole('searchbox', { name: /Brand/i }).fill('Apple');
      await brand.getByRole('button', { name: 'Apple', exact: true }).click();

      const panel = page.getByTestId('scope-impact');
      const included = await reachFor(page, 'Is', async () => {
        await brand.getByRole('searchbox', { name: /Brand/i }).fill('Samsung');
        await brand.getByRole('button', { name: 'Samsung', exact: true }).click();
      });
      await expect(brand.getByText('2 chosen')).toBeVisible();
      expect(included.totalActiveProducts, 'the catalogue reported no active products').toBeGreaterThan(0);
      expect(included.matchedProducts, "two of the shop's best-known brands reached nothing").toBeGreaterThan(0);
      expect(included.matchedProducts).toBeLessThanOrEqual(included.totalActiveProducts);
      expect(included.matchedUnits, 'the reached products hold no stock at all').toBeGreaterThan(0);
      expect(included.exposedStockValue).toBeGreaterThan(0);
      expect(included.forecastDiscount).toBeGreaterThan(0);
      await expectShownReach(panel, included.matchedProducts, included.totalActiveProducts);

      mkdirSync('artifacts/scope', { recursive: true });
      await page.screenshot({ path: `artifacts/scope/builder-included-${theme}.png` });

      // Excluding the same two brands must reach the complement of including them: that is the whole
      // point of the switch, and it is the number the discount engine will work from.
      const excluded = await reachFor(page, 'IsNot', () =>
        brand.getByRole('button', { name: 'Exclude', exact: true }).click());
      expect(excluded.matchedProducts, 'excluding brands did not reach the complement')
        .toBe(excluded.totalActiveProducts - included.matchedProducts);
      await expectShownReach(panel, excluded.matchedProducts, excluded.totalActiveProducts);
      await page.screenshot({ path: `artifacts/scope/builder-excluded-${theme}.png` });

      const restored = await reachFor(page, 'Is', () =>
        brand.getByRole('button', { name: 'Include', exact: true }).click());
      expect(restored.matchedProducts, 'the reach did not return to the included set').toBe(included.matchedProducts);

      await page.getByRole('button', { name: 'Stack by scope', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Stack by scope' })).toHaveAttribute('aria-pressed', 'true');
      await page.locator('#coupon-min-eligible').fill('5000');

      // The registry list refetches after a create, and this box answers a catalogue-backed page
      // slowly, so the row is waited for as a response rather than guessed at from the screen.
      const refreshed = page.waitForResponse(res =>
        res.url().endsWith('/api/coupons') && res.request().method() === 'GET' && res.status() === 200,
        { timeout: 240_000 });

      await page.getByRole('button', { name: /create coupon/i }).click();
      await expect(page.getByText(`Coupon ${code} created.`)).toBeVisible(LOADED);
      await refreshed;

      // The registry row must show the scope the engine will actually use, by catalogue name.
      const row = page.getByRole('table').locator('tr').filter({ hasText: code });
      await expect(row).toBeVisible(LOADED);
      await expect(row).toContainText(/Apple.*Samsung|Samsung.*Apple/, LOADED);
      await expect(row).not.toContainText('All products');

      // And the editor reads the stored rule back rather than starting from storewide.
      // The first cell is the selection checkbox; the double-click-to-edit gesture lives on the code.
      await row.getByText(code).dblclick();
      const dialog = page.getByRole('dialog', { name: /edit coupon/i });
      await expect(dialog.getByRole('button', { name: 'Apple', exact: true, pressed: true })).toBeVisible(LOADED);
      await expect(dialog.getByText('2 chosen')).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Brand', exact: true })).toBeDisabled();
      await page.screenshot({ path: `artifacts/scope/edit-dialog-${theme}.png` });

      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: /edit coupon/i })).toHaveCount(0);

      await deleteCouponByCode(request, token, code);
    });
  }

  test('phone width: the rule card stays inside the screen and every control is reachable', async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { scopeCard } = await openBuilder(page, request, 'dark');

    await page.getByRole('button', { name: 'Category', exact: true }).click();
    const card = scopeCard.locator('.scope-rule').filter({ hasText: 'Category' }).first();
    await expect(card.getByRole('searchbox', { name: /Category/i })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `the builder overflows the 390 px viewport by ${overflow} px`).toBeLessThanOrEqual(1);

    mkdirSync('artifacts/scope', { recursive: true });
    await page.screenshot({ path: 'artifacts/scope/builder-phone.png', fullPage: true });
  });
});
