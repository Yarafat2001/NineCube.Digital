import { expect, test, type Page } from '@playwright/test';
import { seedPassword, seedPasswordMissing } from './seed-password';

/**
 * UI audit: logs in as every role, walks the main pages at 390 / 768 / 1024 / 1440 px and fails on
 *   * console errors or uncaught page errors,
 *   * failed network requests (broken API paths),
 *   * horizontal overflow (layout wider than the viewport).
 *
 * Run it with:  NINECUBE_SEED_PASSWORD='<seed password>' npx playwright test ui-audit
 */
test.describe('ui-audit', () => {
  test.skip(!seedPassword, seedPasswordMissing);

  const viewports = [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 }
  ];

  // Signed-in home visits redirect into the workspace; public scene checks live in showcase.spec.ts.
  const roles: { email: string; paths: string[] }[] = [
    { email: 'customer@ninecube.demo', paths: ['/', '/products', '/orders'] },
    { email: 'staff@ninecube.demo', paths: ['/', '/products', '/staff', '/staff/sales'] },
    { email: 'inventory@ninecube.demo', paths: ['/', '/products', '/inventory'] },
    { email: 'admin@ninecube.demo', paths: ['/', '/products', '/admin', '/staff', '/inventory'] }
  ];

  async function signIn(page: Page, email: string) {
    await page.goto('/login');
    await page.getByRole('textbox', { name: 'Email' }).fill(email);
    await page.getByRole('textbox', { name: 'Password' }).fill(seedPassword);
    await page.getByRole('button', { name: 'LOGIN', exact: true }).click();

    // Wait for the signed-in email in the navbar. The "Log out" CTA is hidden by design at
    // <= 600px (replaced by the "Sign out" link), so it cannot be the success signal here.
    await expect(page.locator('.navbar__user', { hasText: email })).toBeVisible();
  }

  for (const viewport of viewports) {
    test.describe(`@${viewport.width}px`, () => {
      test.use({ viewport });

      for (const role of roles) {
        test(`${role.email} stays clean at ${viewport.width}px`, async ({ page }) => {
          const problems: string[] = [];

          page.on('console', (message) => {
            if (message.type() === 'error') problems.push(`console.error: ${message.text()}`);
          });
          page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
          page.on('requestfailed', (request) => {
            const failure = request.failure()?.errorText ?? '';
            const url = request.url();
            // Vite HMR uses a websocket which Playwright can report as failed on teardown.
            if (url.includes('ws') || url.includes('hot-update')) return;
            // A page navigation cancels whatever fetches are still in flight - that is normal
            // browser behaviour, not a broken path.
            if (failure.includes('ERR_ABORTED')) return;
            problems.push(`request failed: ${request.method()} ${url} - ${failure}`);
          });

          await signIn(page, role.email);

          for (const path of role.paths) {
            for (const theme of ['light', 'dark']) {
              await page.goto(path, { waitUntil: 'domcontentloaded' });
              // Wait for real content instead of networkidle (the dev server keeps a HMR socket open).
              await expect(page.locator('main')).toBeVisible();
              await page.getByRole('button', { name: `${theme === 'light' ? 'Light' : 'Dark'} theme` }).click();
              await page.waitForTimeout(800);
              const smallControls = await page.locator('main input:not([type=checkbox]), main .btn, main table').evaluateAll(elements =>
                elements.filter(el => el.getBoundingClientRect().width > 0 && parseFloat(getComputedStyle(el).fontSize) < 14).map(el => el.tagName)
              );
              expect(smallControls, `unreadable controls on ${path} in ${theme}`).toEqual([]);

              const overflow = await page.evaluate(
                () => document.documentElement.scrollWidth - window.innerWidth
              );
              expect(overflow, `horizontal overflow of ${overflow}px on ${path} in ${theme}`).toBeLessThanOrEqual(1);
            }
          }

          expect(problems, `browser problems for ${role.email} at ${viewport.width}px`).toEqual([]);
        });
      }
    });
  }
});
