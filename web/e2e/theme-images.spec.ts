import { test, expect } from '@playwright/test';
import { seedPassword, seedPasswordMissing } from './seed-password';

test('logo is visible and selected themes persist across reloads', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/login');
  const logo = page.locator('.navbar__brand [role="img"]');
  await expect(logo).toBeVisible();
  await expect(logo.locator('svg')).toBeVisible();
  expect((await logo.boundingBox())!.width).toBeGreaterThanOrEqual(80);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Light theme' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Choose language' })).toBeVisible();
  await page.getByRole('button', { name: 'Light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Dark theme' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Light theme' }).click();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('API catalogue photographs load and broken images have a fallback', async ({ page }) => {
  test.skip(!seedPassword, seedPasswordMissing);
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill('customer@ninecube.demo');
  await page.getByRole('textbox', { name: 'Password' }).fill(seedPassword);
  await page.getByRole('button', { name: 'LOGIN', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Catalogue' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search products' }).fill('Bamboo Spatula');
  const card = page.locator('.product-card').filter({ has: page.getByRole('link', { name: /^Open Bamboo Spatula/ }) });
  const image = card.locator('.product-card__image');
  await expect(image).toHaveAttribute('src', '/products/48.webp');
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  // The fallback is checked while the search still holds: this is the one card known to carry a
  // photograph, and on the unfiltered page most cards render the placeholder with no img at all.
  // A picture that fails to load is replaced by the same "No image" placeholder an empty gallery
  // uses, so the card keeps its height either way; there is no second fallback file to point at.
  await image.evaluate((img: HTMLImageElement) => { img.src = '/products/missing.webp'; });
  await expect(card.getByRole('img', { name: 'No image for Bamboo Spatula' })).toBeVisible();
  await expect(card.locator('.product-card__image')).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Search products' }).fill('');
  await expect(page.locator('.product-card')).toHaveCount(8);
  for (const theme of ['light', 'dark']) {
    await page.getByRole('button', { name: `${theme === 'light' ? 'Light' : 'Dark'} theme` }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.locator('.product-card__image').evaluateAll((images) => {
      images.forEach((image) => { (image as HTMLImageElement).loading = 'eager'; });
    });
    await expect.poll(() => page.locator('.product-card__image').evaluateAll((images) =>
      images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)
    )).toBe(true);
    // Let the browser finish the theme repaint before capturing composited images.
    await page.waitForTimeout(300);
    await page.screenshot({ path: `artifacts/catalogue-${theme}.png`, fullPage: true });
  }
});
