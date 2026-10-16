import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { seedPassword, seedPasswordMissing } from './seed-password';

/**
 * The header has one selected look. The tab you are on, an open account menu and the switched-on
 * theme choice are all "this one", so they must resolve to the same material rather than to three
 * different treatments that drift apart between themes.
 */
test.describe('matching navbar selection states', () => {
  test.skip(!seedPassword, seedPasswordMissing);

  for (const theme of ['light', 'dark']) test(`${theme}: the current tab is selected in the same amber as the open account menu`, async ({ page, request }) => {
    const r = await request.post('http://127.0.0.1:5080/api/auth/login', { data: { email: 'admin@ninecube.demo', password: seedPassword } });
    expect(r.ok()).toBeTruthy();
    const session = await r.json();
    await page.addInitScript(({ session, theme }) => {
      sessionStorage.setItem('ninecube.auth.session', JSON.stringify(session));
      localStorage.setItem('ninecube-theme', theme);
    }, { session, theme });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/products');

    const nav = page.getByRole('navigation', { name: 'Main', exact: true });
    const selected = nav.getByRole('link', { name: 'Products', exact: true });
    await expect(selected).toHaveAttribute('aria-current', 'page');
    const other = nav.getByRole('link', { name: 'Staff', exact: true });

    const paint = (loc: typeof selected) => loc.evaluate(el => {
      const s = getComputedStyle(el);
      return { gradient: s.backgroundImage, ink: s.color, edge: s.borderColor };
    });

    // The current tab is filled; its neighbours are not.
    const current = await paint(selected);
    expect(current.gradient, `${theme}: the current tab carries no selected fill at all`).toMatch(/gradient/);
    expect((await paint(other)).gradient, `${theme}: an unselected tab is filled as if it were current`).toBe('none');

    // Same material as the account button when its menu is open.
    const account = nav.getByRole('button', { name: 'Account', exact: true });
    await account.click();
    await expect(account).toHaveAttribute('aria-expanded', 'true');
    expect(await paint(account), `${theme}: the open account menu and the current tab diverged`).toEqual(current);

    // And the marker follows the page: navigating moves the fill, it does not leave it behind.
    await page.keyboard.press('Escape');
    await other.click();
    await expect(other).toHaveAttribute('aria-current', 'page');
    await expect(selected).not.toHaveAttribute('aria-current', 'page');
    expect(await paint(other), `${theme}: the tab you moved to did not take the selected fill`).toEqual(current);

    mkdirSync('artifacts/modern', { recursive: true });
    await page.screenshot({ path: `artifacts/modern/navbar-matched-${theme}.png` });
  });
});
