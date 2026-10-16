import { test, expect } from '@playwright/test';
import { seedPassword, seedPasswordMissing } from './seed-password';
import { mkdirSync } from 'node:fs';

test.describe('catalogue image stages and navigation glass', () => {
  test.skip(!seedPassword, seedPasswordMissing);
  for (const theme of ['dark', 'light']) test(`${theme}: shared glass and original image background`, async ({ page, request }) => {
    const response = await request.post('http://127.0.0.1:5080/api/auth/login', { data: { email: 'customer@ninecube.demo', password: seedPassword } });
    expect(response.ok()).toBeTruthy();
    const session = await response.json();
    await page.addInitScript(({session, theme}) => {
      sessionStorage.setItem('ninecube.auth.session', JSON.stringify(session));
      localStorage.setItem('ninecube-theme', theme);
    }, {session, theme});
    await page.setViewportSize({width: 1880, height: 1000});
    await page.goto('/products?category=electronics');
    await expect(page.locator('.product-card__media').first()).toBeVisible();
    await expect(page.locator('.filter-chips--active')).toHaveCSS('position', 'static');
    await expect(page.getByRole('button', {name: 'Remove Electronics filter'})).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 500));
    await expect.poll(async () => {
      return page.locator('.category-filter-panel').evaluate(el => {
        const panel = el.getBoundingClientRect();
        const layout = el.closest('.catalogue-layout')!.getBoundingClientRect();
        const target = Math.max(layout.top, Math.min(parseFloat(getComputedStyle(el).top), layout.bottom - panel.height));
        return getComputedStyle(el).position === 'sticky' && Math.abs(panel.top - target) < 3;
      });
    }).toBeTruthy();
    const body = page.locator('.category-filter-panel .filter-panel__body');
    await expect(body).toHaveCSS('overflow-y', 'auto');
    await page.evaluate(() => window.scrollTo(0, 0));
    const stage = await page.locator('.product-card__media').first().evaluate(el => getComputedStyle(el).backgroundImage);
    expect(stage).toBe('none');
    await expect(page.locator('.product-card__media').first()).toHaveCSS('background-color', theme === 'dark' ? 'rgb(244, 245, 247)' : 'rgba(0, 0, 0, 0)');
    if (await page.locator('.product-card__image').count()) {
      await expect(page.locator('.product-card__image').first()).toHaveCSS('filter', 'none');
      await expect(page.locator('.product-card__image').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    } else {
      await expect(page.getByTestId('image-placeholder').first()).toBeVisible();
    }
    const surfaces = await page.locator('.navbar__tray, .navbar__user.nav-control, .navbar .theme-controls, .navbar__actions .nav-pop__trigger').evaluateAll(elements => elements.map(el => {
      const style = getComputedStyle(el);
      return {background: style.backgroundImage, shadow: style.boxShadow, border: style.borderColor, blur: style.backdropFilter};
    }));
    expect(surfaces).toHaveLength(6);
    for (const surface of surfaces) expect(surface).toEqual(surfaces[0]);
    expect(surfaces[0].blur).toContain('blur');
    const cart = page.locator('.navbar__actions').getByRole('button', {name: /^Cart,/});
    await expect(page.getByRole('dialog', {name: 'Your cart'})).toHaveCount(0);
    await cart.hover();
    await expect(cart).toHaveCSS('cursor', 'pointer');
    await cart.click();
    await expect(page.getByRole('dialog', {name: 'Your cart'})).toBeVisible();
    await expect(cart).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('button', {name: 'Close cart'}).click();
    await expect(cart).toBeFocused();
    const orders = page.getByRole('link', {name: 'My Orders', exact: true});
    await orders.hover();
    const hover = await orders.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(await orders.evaluate(el => getComputedStyle(el).backgroundImage)).toBe('none');
    await expect(page.locator('.navbar__tray')).toHaveCSS('cursor', 'auto');
    await expect(orders).toHaveCSS('cursor', 'pointer');
    const bell = page.getByRole('button', {name: /Notifications, /});
    await bell.hover();
    await expect.poll(() => bell.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(hover);
    await bell.click();
    await expect(bell).toHaveAttribute('aria-expanded', 'true');
    await expect(bell).toHaveCSS('color', await page.locator('.theme-control[aria-pressed=true]').evaluate(el => getComputedStyle(el).color));
    await page.keyboard.press('Escape');
    const account = page.getByRole('button', {name: 'Account', exact: true});
    await account.click();
    const avatar = account.locator('.avatar');
    await expect(avatar).toHaveCSS('color', 'rgb(84, 41, 0)');
    await expect(avatar).toHaveCSS('background-color', 'rgb(255, 226, 174)');
    const dashboard = page.getByRole('menuitem', {name: 'Dashboard', exact: true});
    await dashboard.hover();
    await expect(dashboard).toHaveCSS('background-color', hover);
    const material = await page.locator('.navbar').evaluate(el => getComputedStyle(el).backgroundImage);
    await expect(page.locator('.product-card').first()).toHaveCSS('background-image', material);
    await page.keyboard.press('Escape');
    mkdirSync('artifacts/modern', {recursive: true});
    await page.mouse.move(0, 500);
    await page.screenshot({path: `artifacts/modern/catalogue-glass-${theme}.png`});
    await page.setViewportSize({width: 390, height: 844});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    for (const button of await page.locator('.navbar__actions .nav-pop__trigger').all()) await expect(button).toBeVisible();
  });
});
