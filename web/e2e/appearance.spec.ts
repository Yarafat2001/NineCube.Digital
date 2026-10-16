import { test, expect } from '@playwright/test';

for (const width of [390, 768, 1024, 1440]) {
  test(`auth appearance and footer stay aligned at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/login', '/register']) {
      await page.goto(path);
      for (const theme of ['Light', 'Dark']) {
        await page.getByRole('button', { name: `${theme} theme` }).click();
        await expect(page.locator('.brand--auth')).toBeVisible();
        await expect(page.getByRole('group', { name: 'Colour theme' })).toBeVisible();
        await expect(page.locator('.site-footer')).toBeVisible();
        const layout = await page.evaluate(() => {
          const footer = document.querySelector('.site-footer')!.getBoundingClientRect();
          const main = document.querySelector('main')!.getBoundingClientRect();
          return { overflow: document.documentElement.scrollWidth - innerWidth,
            bottom: footer.bottom + scrollY, height: document.documentElement.scrollHeight,
            footerTop: footer.top, mainBottom: main.bottom };
        });
        expect(layout.overflow).toBeLessThanOrEqual(1);
        expect(Math.abs(layout.bottom - layout.height)).toBeLessThanOrEqual(2);
        expect(layout.footerTop).toBeGreaterThanOrEqual(layout.mainBottom - 1);
        await page.screenshot({ path: `artifacts/${path.slice(1)}-${theme.toLowerCase()}-${width}.png`, fullPage: true });
      }
    }
  });
}
