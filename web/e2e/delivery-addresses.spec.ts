import { expect, test } from '@playwright/test';
import type { Address, Profile } from '../src/api/types';

test('international address editing works on desktop and mobile', async ({ page }, testInfo) => {
  const user = { id: 501, email: 'address-preview@example.test', role: 'Customer', customerId: 501 };
  const profile: Profile = { ...user, role: 'Customer', name: 'Preview buyer', phone: '+8801700000000', createdAt: '2026-01-01T00:00:00Z', addresses: [] };
  await page.addInitScript(session => sessionStorage.setItem('ninecube.auth.session', JSON.stringify(session)), {
    user, accessToken: 'address-preview-only', expiresAtUtc: '2099-01-01T00:00:00Z'
  });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/api/')) return route.continue();
    if (path === '/api/auth/me') return route.fulfill({ json: user });
    if (path === '/api/me') return route.fulfill({ json: profile });
    if (path === '/api/me/addresses' && route.request().method() === 'POST') {
      const address = { ...route.request().postDataJSON(), id: 1, isDefault: true } as Address;
      profile.addresses.push(address);
      return route.fulfill({ status: 201, json: address });
    }
    if (path === '/api/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    return route.fulfill({ json: [] });
  });
  const release = process.env.E2E_DEPLOYMENT_SHA;
  await page.goto(release ? `./?v=${encodeURIComponent(release)}#/account/profile` : './#/account/profile');
  if (release) {
    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await page.request.get(new URL(`version.json?check=${Date.now()}`, testInfo.project.use.baseURL).href, {
          headers: { Connection: 'close' },
          timeout: 5000,
        });
        if (res.ok()) {
          response = res;
          break;
        }
      } catch {
        await new Promise(r => setTimeout(r, 600));
      }
    }
    expect(response?.ok()).toBe(true);
    expect((await response!.json()).version).toBe(release);
  }
  const book = page.locator('.delivery-address-book');
  await expect(book.getByRole('heading', { name: 'Saved delivery addresses' })).toBeVisible();
  await book.getByLabel('Country / region', { exact: false }).selectOption('US');
  await expect(book.getByLabel('State', { exact: true })).toBeVisible();
  await expect(book.getByLabel('ZIP code')).toHaveAttribute('required', '');
  await book.getByLabel('Country / region', { exact: false }).selectOption('GB');
  await expect(book.getByLabel('State', { exact: true })).toHaveCount(0);
  await book.getByLabel('Label', { exact: true }).fill('London home');
  await book.getByLabel('Address line', { exact: true }).fill('12 Example Street');
  await book.getByLabel('Apartment / floor / building (optional)', { exact: true }).fill('Flat 4');
  await book.getByLabel('Town / city', { exact: true }).fill('London');
  await book.getByLabel('Postal code', { exact: true }).fill('SW1A 1AA');
  await book.getByRole('button', { name: 'Save address', exact: true }).click();
  await expect(book.locator('.address-card')).toContainText('London home');
  await expect(book.locator('.address-card')).toContainText('Flat 4');
  await book.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(book.getByLabel('Postal code', { exact: true })).toHaveValue('SW1A 1AA');
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme)
        await page.getByRole('button', { name: `Switch to ${theme} theme`, exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await book.screenshot({ path: testInfo.outputPath(`delivery-address-${theme}-${width}.png`) });
    }
  }
});
