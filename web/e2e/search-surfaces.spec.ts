import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { seedPassword, seedPasswordMissing } from './seed-password';
import { COLOUR_PROBE } from './colour-probe';

/**
 * Two search surfaces, one material: the Ctrl+K spotlight in the navbar and the "Name or SKU"
 * field on the catalogue. This asks the live DOM what it resolved rather than what app.css says,
 * because the panel rows once passed every stylesheet check while painting as underlined accent
 * links - a later touchscreen rule in responsive.css outranked the class.
 *
 *   E2E_BASE_URL=http://127.0.0.1:5173 NINECUBE_SEED_PASSWORD='<demo password>' npm run e2e search-surfaces
 */
const API = process.env.E2E_API_BASE ?? 'http://127.0.0.1:5080';
const LOADED = { timeout: 90_000 };

async function signIn(page: Page, request: APIRequestContext, theme: 'light' | 'dark') {
  const response = await request.post(`${API}/api/auth/login`, {
    data: { email: 'customer@ninecube.demo', password: seedPassword }
  });
  expect(response.ok(), `customer sign-in failed: ${await response.text()}`).toBe(true);
  const session = await response.json() as { accessToken: string };
  await page.addInitScript(({ session, theme }) => {
    sessionStorage.setItem('ninecube.auth.session', JSON.stringify(session));
    localStorage.setItem('ninecube-theme', theme);
  }, { session, theme });
}

/** A search term taken from the loaded grid, so the spec matches whatever the store actually holds. */
async function termFromGrid(page: Page) {
  const name = await page.locator('.product-card__name').first().innerText(LOADED);
  return name.trim().slice(0, 3);
}

test.describe('search surfaces on the system plate', () => {
  test.skip(!seedPassword, seedPasswordMissing);
  mkdirSync('artifacts/scope', { recursive: true });

  for (const width of [1440, 390]) {
    const themes: ('light' | 'dark')[] = ['light', 'dark'];
    for (const theme of themes) {
      test(`${width} ${theme}: spotlight, suggestion rows and the idle waterfall`, async ({ page, request }) => {
        await signIn(page, request, theme);

        const apiCalls: string[] = [];
        page.on('request', entry => {
          const url = new URL(entry.url());
          if (url.pathname.endsWith('/api/products')) apiCalls.push(url.searchParams.get('pageSize') ?? '?');
        });

        await page.setViewportSize({ width, height: 900 });
        await page.goto('/#/products');
        await expect(page.getByRole('heading', { name: /catalogue/i })).toBeVisible(LOADED);
        await page.evaluate(COLOUR_PROBE);

        // The dialog is closed, so nothing in it may cost a request - not even the stock poll.
        const beforeIdle = apiCalls.length;
        await page.waitForTimeout(17_000);
        expect(apiCalls.slice(beforeIdle).filter(size => size === '6'), 'the closed spotlight polled the catalogue')
          .toHaveLength(0);

        // Spotlight: the shared modal plate, the house input well, controls at the tap floor.
        await page.keyboard.press('Control+k');
        const dialog = page.locator('.spotlight-dialog');
        await expect(dialog).toBeVisible(LOADED);
        await expect(dialog).toHaveCSS('background-color', theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(27, 24, 26)');
        await expect(dialog).toHaveCSS('border-top-width', '1px');
        await expect(page.locator('.spotlight-field')).toHaveCSS('background-color', theme === 'light' ? 'rgb(241, 244, 249)' : 'rgb(19, 17, 19)');
        await expect(page.locator('.spotlight-input')).toHaveCSS('border-top-width', '0px');

        const term = await termFromGrid(page);
        await page.locator('.spotlight-input').fill(term);
        await expect(page.getByText(/top matching products/i)).toBeVisible(LOADED);

        const chip = await page.evaluate(() => window.__edge('.spotlight-chip'));
        expect(chip, 'no category chip rendered').toBeTruthy();
        expect(chip!.px, 'chip label sits below the 13px floor').toBeGreaterThanOrEqual(13);
        expect(chip!.vsParent, `chip edge resolves to ${chip!.vsParent}:1 against the panel`)
          .toBeGreaterThanOrEqual(3);
        const row = await page.evaluate(() => window.__edge('.spotlight-item'));
        expect(row!.vsParent, `result row edge resolves to ${row!.vsParent}:1 against the panel`)
          .toBeGreaterThanOrEqual(3);
        await expect(page.locator('.spotlight-item__meta .badge').first()).toHaveCSS('font-size', '13px');
        // The shared stock badge is the translated component, not a raw "✓ 6 in stock".
        await expect(page.locator('.spotlight-item__meta .badge').first()).toBeVisible();
        expect(await dialog.innerText(), 'a stock label leaked untranslated ASCII').not.toMatch(/✓\s*\d+\s+in stock/i);
        const clear = page.locator('.spotlight-clear-btn');
        await expect(clear).toBeVisible();
        expect(Math.round((await clear.boundingBox())!.height)).toBeGreaterThanOrEqual(30);
        await page.screenshot({ path: `artifacts/scope/search-${width}-${theme}-spotlight.png` });
        await page.keyboard.press('Escape');

        // Catalogue matches: a solid plate over the navbar plane, painted as rows rather than links.
        await page.locator('#product-search').fill(term);
        const panel = page.locator('.search-suggestions');
        await expect(panel).toBeVisible(LOADED);
        await expect(panel).toHaveCSS('position', 'absolute');
        await expect(panel.locator('.search-suggestions__row').first()).toHaveCSS('text-decoration-line', 'none');
        const rowInk = await panel.locator('.search-suggestions__row').first().evaluate(el => getComputedStyle(el).color);
        const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent-text').trim());
        expect(rowInk, 'a match row is painted with the link accent').not.toBe(accent);
        const clamp = await panel.locator('.search-suggestions__name').evaluate(el => getComputedStyle(el).getPropertyValue('-webkit-line-clamp'));
        expect(clamp, 'a long catalogue name is cut mid-word instead of taking two lines').toBe('2');

        // Reproduce the collision from the screenshots: park the pill on top of the open panel.
        await page.evaluate(() => {
          const panelBox = document.querySelector('.search-suggestions')!.getBoundingClientRect();
          const navBox = document.querySelector('.navbar')!.getBoundingClientRect();
          window.scrollTo(0, window.scrollY + Math.max(0, panelBox.top - navBox.bottom - 10));
        });
        await page.waitForTimeout(700);
        const stacked = await page.evaluate(() => {
          const panel = document.querySelector('.search-suggestions')!;
          const nav = document.querySelector('.navbar')!;
          const p = panel.getBoundingClientRect(), n = nav.getBoundingClientRect();
          const top = Math.max(p.top, n.top), bottom = Math.min(p.bottom, n.bottom);
          if (bottom <= top) return { overlapped: false };
          const hit = document.elementFromPoint((p.left + p.right) / 2, (top + bottom) / 2);
          return {
            overlapped: true,
            overPanel: !!hit?.closest('.search-suggestions'),
            panelZ: getComputedStyle(panel).zIndex,
            navZ: getComputedStyle(nav).zIndex
          };
        });
        if (stacked.overlapped) {
          expect(stacked.overPanel, 'the navbar clips the open match panel').toBe(true);
        }
        expect(Number(stacked.panelZ ?? 60)).toBeGreaterThan(Number(stacked.navZ ?? 50));

        // Scrolling content must be covered by the pill, not smeared through its translucent tint.
        await page.evaluate(() => window.scrollTo(0, 400));
        await page.waitForTimeout(600);
        const pill = await page.locator('.navbar').evaluate(el => {
          const cs = getComputedStyle(el);
          return { backing: cs.backgroundColor, tintOnTop: cs.backgroundImage.includes('gradient') };
        });
        expect(pill.backing, 'the pill has no opaque backing, so a page line passes through it').not.toMatch(/rgba\(/);
        expect(pill.tintOnTop, 'the approved glass tint was taken off the pill').toBe(true);
        await page.screenshot({ path: `artifacts/scope/search-${width}-${theme}-rows.png` });
      });
    }
  }
});
