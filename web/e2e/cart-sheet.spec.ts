import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { seedPassword, seedPasswordMissing } from './seed-password';
import { COLOUR_PROBE } from './colour-probe';

/**
 * The cart is the navbar "Your cart" sheet - there is no /cart route in this app. What the owner
 * asked for was a basket that shows what it holds, so this asks the live DOM three things: does the
 * line list have a height and rows (it measured 0px on a 1440x900 laptop before this round), does
 * the total stay reachable while the sheet scrolls, and does anything in the page paint over the
 * dismiss control on a phone.
 *
 *   E2E_API_BASE=http://127.0.0.1:5099 E2E_BASE_URL=http://127.0.0.1:5199 npm run e2e cart-sheet
 */
const API = process.env.E2E_API_BASE ?? 'http://127.0.0.1:5080';
const LOADED = { timeout: 90_000 };

async function openCart(page: Page, request: APIRequestContext, theme: 'light' | 'dark') {
  const response = await request.post(`${API}/api/auth/login`, {
    data: { email: 'customer@ninecube.demo', password: seedPassword }
  });
  expect(response.ok(), `customer sign-in failed: ${await response.text()}`).toBe(true);
  const session = await response.json() as { accessToken: string };

  await page.addInitScript(({ session, theme }) => {
    sessionStorage.setItem('ninecube.auth.session', JSON.stringify(session));
    localStorage.setItem('ninecube-theme', theme);
  }, { session, theme });

  await page.goto('/#/products');
  await expect(page.getByRole('heading', { name: /catalogue/i })).toBeVisible(LOADED);
  const card = page.locator('.product-card').filter({ hasText: /Add to cart/i }).first();
  await expect(card, 'the catalogue never filled').toBeVisible(LOADED);
  await card.getByRole('button', { name: /add to cart/i }).click();
  await page.getByRole('button', { name: /^Cart, / }).click();
  await expect(page.locator('.cart-panel')).toBeVisible(LOADED);
}

test.describe('the cart sheet', () => {
  test.skip(!seedPassword, seedPasswordMissing);

  test('shows its lines, keeps its total pinned and stays dismissible', async ({ page }) => {
    for (const [width, height] of [[1440, 900], [390, 844]] as const) {
      for (const theme of ['light', 'dark'] as const) {
        await page.setViewportSize({ width, height });
        await openCart(page, page.request, theme);
        await expect(page.locator('.cart-line').first()).toBeVisible(LOADED);
        await page.evaluate(COLOUR_PROBE);

        const sheet = await page.evaluate(() => {
          const box = (el: Element | null) => {
            const node = el as HTMLElement | null;
            if (!node) return null;
            const rect = node.getBoundingClientRect();
            return { h: Math.round(rect.height), top: Math.round(rect.top), bottom: Math.round(rect.bottom) };
          };
          const lines = document.querySelector('.cart-lines');
          const close = document.querySelector('.cart-sheet__close');
          const dock = document.querySelector('.cart-sticky-dock');
          const closeRect = close?.getBoundingClientRect();
          // Whatever the topmost pixel of the dismiss control actually meets: if a strip painted over
          // the sheet, this returns the strip and not the button.
          const hit = closeRect
            ? document.elementFromPoint(closeRect.left + closeRect.width / 2, closeRect.top + closeRect.height / 2)
            : null;
          return {
            lines: box(lines),
            rows: [...document.querySelectorAll('.cart-line')].map(row => Math.round(row.getBoundingClientRect().height)),
            close: box(close),
            closePaints: !!hit && !!close?.contains(hit),
            dock: box(dock),
            dockPosition: dock ? getComputedStyle(dock).position : 'missing',
            total: document.querySelector('.cart-sticky-dock__total')?.textContent?.trim() ?? '',
            viewport: { w: window.innerWidth, h: window.innerHeight }
          };
        });

        expect(sheet.lines, `${width}/${theme}: the line tray is gone`).not.toBeNull();
        expect(sheet.rows.length, `${width}/${theme}: the tray holds no rows`).toBeGreaterThan(0);
        expect(sheet.lines!.h, `${width}/${theme}: the tray paints ${sheet.lines!.h}px tall`).toBeGreaterThanOrEqual(60);
        for (const row of sheet.rows) {
          expect(row, `${width}/${theme}: a line row collapsed to ${row}px`).toBeGreaterThanOrEqual(40);
        }

        expect(sheet.closePaints, `${width}/${theme}: something paints over the Close control`).toBe(true);
        expect(sheet.close!.top, `${width}/${theme}: the Close control is off the top of the screen`).toBeGreaterThanOrEqual(0);

        expect(sheet.dockPosition, `${width}/${theme}: the total is not pinned`).toBe('sticky');
        expect(sheet.dock!.h, `${width}/${theme}: the dock is ${sheet.dock!.h}px tall`).toBeGreaterThanOrEqual(60);
        expect(sheet.dock!.bottom, `${width}/${theme}: the dock hangs below the viewport`).toBeLessThanOrEqual(sheet.viewport.h + 2);
        expect(sheet.total, `${width}/${theme}: the pinned total states nothing`).toMatch(/\d/);

        // A control that resolves to its own paint is the whole point of the option tokens.
        const stepper = await page.evaluate(() => window.__edge('.cart-line .stepper'));
        expect(stepper, `${width}/${theme}: no quantity stepper`).not.toBeNull();
        expect(stepper!.width).toBeGreaterThanOrEqual(1);
        expect(Math.max(stepper!.vsOwn, stepper!.vsParent),
          `${width}/${theme}: the stepper edge ${stepper!.edge} is invisible on ${stepper!.own}`).toBeGreaterThanOrEqual(3);

        await page.screenshot({ path: `artifacts/cart-${width}-${theme}.png` });
      }
    }
  });

  test('the sheet scrolls to the last row without hiding it behind the dock', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openCart(page, page.request, 'light');

    await page.locator('.cart-sticky-dock').scrollIntoViewIfNeeded();
    await expect(page.locator('.cart-summary-box')).toBeVisible(LOADED);
    const last = await page.evaluate(() => {
      const box = document.querySelector('.cart-summary-box')!.getBoundingClientRect();
      const dock = document.querySelector('.cart-sticky-dock')!.getBoundingClientRect();
      return { boxBottom: Math.round(box.bottom), dockTop: Math.round(dock.top) };
    });
    expect(last.boxBottom, `the summary ends at ${last.boxBottom} but the dock starts at ${last.dockTop}`)
      .toBeLessThanOrEqual(last.dockTop + 2);
  });
});
