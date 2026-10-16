import { expect, test } from '@playwright/test';

for (const width of [390, 768, 1024, 1440]) {
  test(`home footer stays readable and aligned at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('#scene')).toBeVisible();
    const footer = page.locator('#outro');
    for (const theme of ['Light', 'Dark']) {
      await page.getByRole('button', { name: `${theme} theme` }).click();
      for (const visibleFraction of [.35, .6, 1]) {
        await footer.evaluate((el, fraction) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - innerHeight * (1 - fraction)), visibleFraction);
        await page.waitForTimeout(500);
        const contrast = await footer.evaluate(el => {
          const luminance = (color: string) => {
            const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
            return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
          };
          const a = luminance(getComputedStyle(el).color);
          const b = luminance(getComputedStyle(el).backgroundColor);
          return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        });
        expect(contrast).toBeGreaterThanOrEqual(4.5);
      }
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect(footer.getByRole('img', { name: 'NineCube.Digital' })).toBeVisible();
      const links = footer.getByRole('navigation', { name: 'Home footer' });
      await expect(links.getByRole('link', { name: 'Collection' })).toHaveAttribute('href', '/products');
      await expect(links.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/login');
      await expect(links.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/register');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `artifacts/home-footer-${theme.toLowerCase()}-${width}.png`, fullPage: false });
    }
  });
}

test('reduced-motion home uses the same complete footer', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const footer = page.locator('.showcase__outro');
  await footer.scrollIntoViewIfNeeded();
  await expect(footer.getByRole('navigation', { name: 'Home footer' })).toBeVisible();
  await expect(footer.getByRole('img', { name: 'NineCube.Digital' })).toBeVisible();
  await footer.getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});
