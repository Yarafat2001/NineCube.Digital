import { test, expect } from '@playwright/test';
import { seedPassword, seedPasswordMissing } from './seed-password';

/**
 * Light-theme depth regression: page, sidebar, cards and image wells must be
 * visibly different surfaces (spec §5). Captures 1280px light+dark and the
 * 390px mobile drawer, and asserts the computed backgrounds differ.
 */
test('products page surfaces differ in light and dark, drawer at mobile', async ({ page }) => {
  test.skip(!seedPassword, seedPasswordMissing);
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill('customer@ninecube.demo');
  await page.getByRole('textbox', { name: 'Password' }).fill(seedPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Catalogue' })).toBeVisible();
  // The surfaces are only comparable once the grid has its cards; the catalogue query is slow enough
  // that measuring straight after the redirect used to read an empty page.
  await expect(page.locator('.product-card').first(), 'the catalogue never filled').toBeVisible();

  await page.setViewportSize({ width: 1280, height: 900 });
  for (const theme of ['light', 'dark'] as const) {
    await page.getByRole('button', { name: `${theme === 'light' ? 'Light' : 'Dark'} theme` }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.waitForTimeout(300);
    const surfaces = await page.evaluate(() => {
      // A card is painted by a gradient, so its background-color is transparent on its own: what has
      // to differ is the whole paint - a card carries a surface, the image well carries none.
      const bg = (selector: string) => {
        const el = document.querySelector(selector);
        if (!el) return 'missing';
        const style = getComputedStyle(el);
        return `${style.backgroundColor} | ${style.backgroundImage}`;
      };
      return {
        page: getComputedStyle(document.body).backgroundColor,
        sidebar: bg('.category-filter-panel'),
        card: bg('.product-card'),
        media: bg('.product-card__media'),
      };
    });
    const painted = (value: string) => value !== 'missing'
      && (!/^\s*rgba\(0,\s*0,\s*0,\s*0\)\s*\|/.test(value) || !/\|\s*none\s*$/.test(value));

    expect(painted(surfaces.card), `${theme}: the card paints no surface (${surfaces.card})`).toBe(true);
    expect(painted(surfaces.sidebar), `${theme}: the sidebar paints no surface (${surfaces.sidebar})`).toBe(true);
    // Card and image well must differ, or the picture has no well to sit in.
    expect(surfaces.media, `${theme}: image well background`).not.toBe('missing');
    expect(surfaces.card, `${theme}: card vs image well`).not.toEqual(surfaces.media);
    await page.screenshot({ path: `artifacts/products-${theme}-1280.png`, fullPage: true });
  }

  // Mobile drawer at 390px.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Light theme' }).click();
  // The panel trigger, not the identical button in the mobile bottom bar.
  await page.locator('.category-filter-trigger').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'artifacts/products-drawer-light-390.png', fullPage: true });
});
