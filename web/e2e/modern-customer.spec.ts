import { expect, test } from '@playwright/test';
import { seedPassword, seedPasswordMissing } from './seed-password';
import { mkdirSync, writeFileSync } from 'node:fs';

test.describe('modern customer pages', () => {
  test.skip(!seedPassword, seedPasswordMissing);
  for (const width of [390, 768, 1440]) {
    for (const theme of ['light', 'dark']) {
      test(`${width}px ${theme}: surfaces, account menu, pages and motion`, async ({ page, request }) => {
        await page.setViewportSize({ width, height: 1000 });
        const login = await request.post('http://127.0.0.1:5080/api/auth/login', { data: { email: 'customer@ninecube.demo', password: seedPassword } });
        expect(login.ok()).toBeTruthy();
        const session = await login.json();
        await page.addInitScript(({ session, theme }) => {
          sessionStorage.setItem('ninecube.auth.session', JSON.stringify(session));
          localStorage.setItem('ninecube-theme', theme);
        }, { session, theme });
        mkdirSync('artifacts/modern', { recursive: true });
        const contrast: Record<string, number> = {};
        for (const [route, label] of [['/products', 'products'], ['/account', 'dashboard'], ['/account/profile', 'profile'], ['/notifications', 'notifications']]) {
          await page.goto(route);
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
          await expect(page.locator('[role=status][aria-busy=true]')).toHaveCount(0);
          if (route === '/products') await expect(page.locator('.product-card').first()).toBeVisible();
          if (route === '/account') await expect(page.getByTestId('dashboard-stats')).toBeVisible();
          if (route === '/account/profile') await expect(page.getByRole('combobox', { name: 'Division' })).toBeVisible();
          if (route === '/notifications' && await page.locator('.notif-item__body').count()) {
            const body = page.locator('.notif-item__body').first();
            expect((await body.boundingBox())!.width).toBeGreaterThan(width <= 768 ? 160 : 400);
            expect((await page.locator('.notif-item--row').first().boundingBox())!.height).toBeLessThan(360);
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
          await page.screenshot({ path: `artifacts/modern/${label}-${width}-${theme}.png`, fullPage: true });
        }
        await page.getByRole('button', { name: 'Account', exact: true }).click();
        const menu = page.getByRole('menu', { name: 'Account', exact: true });
        await expect(menu).toBeVisible();
        expect(await menu.evaluate(el => el.parentElement === document.body)).toBeTruthy();
        expect(await menu.evaluate(el => getComputedStyle(el).backdropFilter)).toContain('blur');
        await page.keyboard.press('End'); await expect(menu.getByRole('menuitem', { name: 'Log out' })).toBeFocused();
        await page.keyboard.press('Home'); await expect(menu.getByRole('menuitem', { name: 'Dashboard' })).toBeFocused();
        await page.screenshot({ path: `artifacts/modern/menu-${width}-${theme}.png`, fullPage: true });
        await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Account', exact: true })).toBeFocused();
        expect(await page.getByRole('button', { name: 'Account', exact: true }).evaluate(el => parseFloat(getComputedStyle(el).outlineWidth))).toBeGreaterThanOrEqual(2);
        Object.assign(contrast, await page.evaluate(() => {
          const cs = getComputedStyle(document.documentElement);
          const rgb = (value: string) => {
            const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d')!;
            ctx.fillStyle = cs.getPropertyValue('--surface').trim(); ctx.fillRect(0, 0, 1, 1);
            ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1);
            return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
          };
          const lum = (name: string) => rgb(cs.getPropertyValue(name).trim()).map(v => { const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }).reduce((v, c, i) => v + c * [.2126, .7152, .0722][i], 0);
          const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
          return { text: ratio('--text', '--surface'), muted: ratio('--text-muted', '--surface'), accentText: ratio('--accent-text', '--surface'), inputBorder: ratio('--border-strong', '--surface-sunken'), buttonText: ratio('--on-accent', '--accent'), ok: ratio('--ok-text', '--ok-bg'), warn: ratio('--warn-text', '--warn-bg'), bad: ratio('--bad-text', '--bad-bg'), info: ratio('--info', '--info-tint'), neutral: ratio('--neutral', '--neutral-tint') };
        }));
        for (const key of ['text', 'muted', 'accentText', 'buttonText', 'ok', 'warn', 'bad', 'info', 'neutral']) expect(contrast[key]).toBeGreaterThanOrEqual(4.5);
        expect(contrast.inputBorder).toBeGreaterThanOrEqual(3);
        writeFileSync(`artifacts/modern/contrast-${width}-${theme}.json`, JSON.stringify(contrast, null, 2));
        await page.goto('/products'); await expect(page.locator('.product-card').first()).toBeVisible();
        const card = page.locator('.product-card').first();
        const bounds = await card.boundingBox(); expect(bounds).not.toBeNull();
        await card.hover({ position: { x: 20, y: 20 } });
        await expect.poll(() => card.evaluate(el => el.style.getPropertyValue('--rx'))).not.toBe('');
        const after = await card.boundingBox(); expect(Math.abs(after!.width - bounds!.width)).toBeLessThan(70);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.mouse.move(0, 0); await card.hover({ position: { x: 25, y: 25 } });
        await expect.poll(() => card.evaluate(el => el.style.getPropertyValue('--rx'))).toBe('0deg');
      });
    }
  }

  test('touch cards and long Bengali names stay within the viewport without tilt', async ({ browser, request }) => {
    const response = await request.post('http://127.0.0.1:5080/api/auth/login', { data: { email: 'customer@ninecube.demo', password: seedPassword } });
    expect(response.ok()).toBeTruthy();
    const session = await response.json();
    const context = await browser.newContext({ viewport: { width: 390, height: 1000 }, hasTouch: true, isMobile: true });
    try {
      await context.addInitScript(session => {
        sessionStorage.setItem('ninecube.auth.session', JSON.stringify(session));
        localStorage.setItem('ninecube-theme', 'light');
      }, session);
      const page = await context.newPage();
      await page.route('**/api/products?*', route => route.fulfill({ json: {
        items: [{ id: 999999, sku: 'TEST-' + 'X'.repeat(59), name: 'বাংলা পণ্যের দীর্ঘ নাম Long product description with a very long model name for small screens',
          price: 1999, currency: 'BDT', stockQuantity: 5, isActive: true, rowVersion: null, imageUrl: null,
          categories: [{ id: 1, name: 'Uncategorized', slug: 'uncategorized', isPrimary: true }], tags: ['Budget', 'Local Brand', 'Featured', 'Test Only'] }],
        page: 1, pageSize: 8, totalCount: 1, totalPages: 1, hasNext: false
      } }));
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto('/products');
        const card = page.locator('.product-card').first(); await expect(card).toBeVisible();
        await expect(card.getByTestId('image-placeholder')).toBeVisible();
        await card.dispatchEvent('pointermove', { pointerType: 'touch', clientX: 100, clientY: 100 });
        expect(await card.evaluate(el => el.style.getPropertyValue('--rx'))).toBe('0deg');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
        expect(await card.evaluate(el => el.scrollWidth <= el.clientWidth + 2)).toBeTruthy();
        await page.screenshot({ path: `artifacts/modern/touch-long-name-${width}.png`, fullPage: true });
      }
    } finally { await context.close(); }
  });
});
