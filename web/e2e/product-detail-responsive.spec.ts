import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { seedPassword, seedPasswordMissing } from './seed-password';

test.describe('responsive product detail', () => {
  test.skip(!seedPassword, seedPasswordMissing);
  for (const theme of ['light', 'dark']) for (const width of [390, 768, 1440]) {
    test(`${width}px ${theme}: gallery, purchase and cart`, async ({page, request}) => {
      const response = await request.post('http://127.0.0.1:5080/api/auth/login', {data: {email: 'customer@ninecube.demo', password: seedPassword}});
      expect(response.ok()).toBeTruthy();
      const session = await response.json();
      await page.addInitScript(({session, theme}) => {
        sessionStorage.setItem('ninecube.auth.session', JSON.stringify(session));
        localStorage.setItem('ninecube-theme', theme);
      }, {session, theme});
      await page.setViewportSize({width, height: 1000});
      await page.goto('/products/11');
      await expect(page.getByRole('heading', {level: 1, name: 'Bamboo Spatula'})).toBeVisible();
      const media = page.locator('.product-detail__media');
      await expect(media).toHaveCSS('background-color', 'rgb(244, 245, 247)');
      const photo = media.locator('img');
      await expect.poll(() => photo.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await expect(photo).toHaveCSS('object-fit', 'contain');
      const gallery = (await media.boundingBox())!;
      const summary = (await page.locator('.product-detail__summary').boundingBox())!;
      expect(gallery.height).toBeLessThanOrEqual(540);
      if (width <= 768) expect(summary.y).toBeGreaterThanOrEqual(gallery.y + gallery.height);
      else expect(summary.x).toBeGreaterThan(gallery.x + gallery.width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
      mkdirSync('artifacts/modern', {recursive: true});
      await page.screenshot({path: `artifacts/modern/product-detail-${width}-${theme}.png`, fullPage: true});
      await page.getByRole('button', {name: 'Add to cart', exact: true}).click();
      await expect(page.getByRole('status').filter({hasText: 'Added to your cart.'})).toBeVisible();
      await page.getByRole('button', {name: 'View cart', exact: true}).click();
      await expect(page.getByRole('dialog', {name: 'Your cart', exact: true})).toBeVisible();
      await expect(page.getByTestId('cart-line-11')).toBeVisible();
      await page.getByRole('button', {name: 'Close cart'}).click();

    });
  }
});
