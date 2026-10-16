import { expect, test } from '@playwright/test';
import { seedPassword, seedPasswordMissing } from './seed-password';

for (const width of [390, 768, 1024, 1440]) {
  test(`order detail and invoice remain readable at ${width}px`, async ({ page }) => {
    test.skip(!seedPassword, seedPasswordMissing);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/login');
    await page.getByRole('textbox', { name: 'Email' }).fill('customer@ninecube.demo');
    await page.getByRole('textbox', { name: 'Password' }).fill(seedPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('.navbar__user')).toBeVisible();
    await page.goto('/orders');
    const invoiceLink = page.locator('a[href$="/invoice"]').first();
    await expect(invoiceLink).toBeVisible();
    const invoicePath = (await invoiceLink.getAttribute('href'))!;
    for (const path of [invoicePath.replace('/invoice', ''), invoicePath]) {
      await page.goto(path);
      await expect(page.locator('main table')).toBeVisible();
      for (const theme of ['Light', 'Dark']) {
        await page.getByRole('button', { name: `${theme} theme` }).click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
        expect(await page.locator('main table').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
        await page.screenshot({ path: `artifacts/order-${path.endsWith('/invoice') ? 'invoice' : 'detail'}-${theme.toLowerCase()}-${width}.png`, fullPage: true });
      }
    }
  });
}
