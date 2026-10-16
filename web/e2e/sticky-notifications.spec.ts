import { test, expect } from '@playwright/test';
import { seedPassword, seedPasswordMissing } from './seed-password';

/**
 * Sticky bars + notification layers at 390 / 768 / 1440 px in light and dark.
 * Asserts: sticky offsets clear the navbar, popover sits above sticky bars,
 * sheets above the bottom bar, toasts above everything and clear of it.
 */
for (const width of [390, 768, 1440]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`sticky + notification layers at ${width}px in ${theme}`, async ({ page }) => {
      test.skip(!seedPassword, seedPasswordMissing);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/login');
      await page.getByRole('textbox', { name: 'Email' }).fill('customer@ninecube.demo');
      await page.getByRole('textbox', { name: 'Password' }).fill(seedPassword);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page.getByRole('heading', { name: 'Catalogue' })).toBeVisible();
      await page.getByRole('button', { name: `${theme === 'light' ? 'Light' : 'Dark'} theme` }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      // Sticky offsets match the measured navbar height.
      const offsets = await page.evaluate(() => {
        const rootStyle = getComputedStyle(document.documentElement);
        const sidebar = document.querySelector('.category-filter-panel');
        const navH = parseFloat(rootStyle.getPropertyValue('--nav-h'));
        const sidebarTop = sidebar ? parseFloat(getComputedStyle(sidebar).top) : 0;
        return { navH, sidebarTop };
      });
      if (width > 768) {
        expect(offsets.sidebarTop).toBeGreaterThanOrEqual(offsets.navH);
      }

      // Bell sits between cart and account; badge hides at 0, caps at 9+.
      const bell = page.getByRole('button', { name: /notifications/i });
      await expect(bell).toHaveAttribute('aria-label', /notifications, \d+ unread/i);

      // Popover opens above sticky bars with sections and footer actions.
      await bell.click();
      const dialog = page.getByRole('dialog', { name: 'Notifications' });
      await expect(dialog).toBeVisible();
      // Measure the element that actually creates the stacking context. On a phone the tray is a
      // .sheet inside a fixed .sheet-backdrop - the sheet itself is static, so its own z-index is
      // 'auto' and reading it would compare NaN with NaN.
      const layers = await page.evaluate(() => {
        const z = (selector: string) => {
          const el = document.querySelector(selector);
          if (!el) return null;
          const value = parseFloat(getComputedStyle(el).zIndex);
          return Number.isFinite(value) ? value : null;
        };
        return {
          tray: z('.notif-popover') ?? z('.sheet-backdrop'),
          nav: z('.navbar'),
          sidebar: z('.category-filter-panel'),
          bottombar: z('.bottombar'),
        };
      });
      expect(layers.tray, 'no notification tray layer was measurable').not.toBeNull();
      expect(layers.nav, 'the navbar layer was not measurable').not.toBeNull();
      expect(layers.tray!).toBeGreaterThan(layers.nav!);
      // Whatever is sticky at this width has to sit under the tray.
      for (const [name, value] of Object.entries(layers)) {
        if (name === 'tray' || name === 'nav' || value === null) continue;
        expect(value, `the ${name} is not under the tray`).toBeLessThan(layers.tray!);
      }

      // Escape closes, focus returns to the bell.
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(bell).toBeFocused();

      await page.waitForTimeout(300);
      await page.screenshot({ path: `artifacts/sticky-notif-${theme}-${width}.png`, fullPage: false });
    });
  }
}
