import { test, expect } from '@playwright/test';
import { seedPassword, seedPasswordMissing } from './seed-password';

test('public home uses local photography and a direct collection entry', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#scene')).toBeVisible();
  const photograph = page.locator('.showcase__hero-photo img');
  await expect(photograph).toHaveAttribute('src', '/assets/photo-01.jpg');
  await expect.poll(() => photograph.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(page.getByRole('link', { name: /explore the collection/i })).toBeVisible();
  const tabs = await page.locator('.navbar__link').evaluateAll(links => links.map(el => {
    const s = getComputedStyle(el);
    return { current: el.hasAttribute('aria-current'), gradient: s.backgroundImage, ink: s.color };
  }));
  const currentTab = tabs.find(tab => tab.current);
  expect(currentTab, 'no tab was marked current').toBeTruthy();
  expect(currentTab!.gradient, 'the current tab carries no selected fill').toMatch(/gradient/);
  for (const tab of tabs.filter(tab => !tab.current)) {
    expect(tab.gradient, 'a tab that is not current is filled as if it were').toBe('none');
  }
  await page.screenshot({ path: 'artifacts/home-desktop-hero.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(photograph).toBeVisible();
  await page.screenshot({ path: 'artifacts/home-mobile-hero.png' });
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const promos = page.getByRole('complementary', { name: 'Featured collections' });
    await expect(promos.getByRole('link')).toHaveCount(2);
    await expect(promos.getByText('Offer preview')).toBeVisible();
    await expect(promos.getByText('New edit')).toBeVisible();
    await expect.poll(() => promos.locator('img').evaluateAll(images => images.every(img => (img as HTMLImageElement).naturalWidth > 0))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const cta = await page.getByRole('link', { name: /explore the collection/i }).boundingBox();
    const promoBounds = await promos.boundingBox();
    expect(promoBounds!.y).toBeGreaterThan(cta!.y + cta!.height);
    await page.screenshot({ path: `artifacts/home-promotions-${width}.png` });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  const staticPromos = page.locator('.hero-promo');
  await expect(staticPromos).toHaveCount(2);
  expect(await staticPromos.first().evaluate(el => getComputedStyle(el).animationName)).toBe('none');
});

for (const role of ['customer', 'staff', 'inventory', 'admin']) {
  test(`${role} login and home visits stay inside the workspace`, async ({ page }) => {
    test.skip(!seedPassword, seedPasswordMissing);
    const sceneRequests: string[] = [];
    page.on('request', request => {
      if (/HelixCanvas|helixScene|\/three\.js/.test(request.url())) sceneRequests.push(request.url());
    });
    await page.goto('/login');
    await page.getByRole('textbox', { name: 'Email' }).fill(`${role}@ninecube.demo`);
    await page.getByRole('textbox', { name: 'Password' }).fill(seedPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/products$/);
    await expect(page.getByRole('heading', { name: 'Catalogue' })).toBeVisible();
    await expect(page.locator('#scene')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Showcase', exact: true })).toHaveCount(0);
    await page.goto('/');
    await expect(page).toHaveURL(/\/products$/);
    await expect(page.locator('body')).not.toHaveClass(/showcase-active/);
    await expect(page.locator('#scene')).toHaveCount(0);
    await page.locator('.navbar__brand').click();
    await expect(page).toHaveURL(/\/products$/);
    expect(sceneRequests).toEqual([]);
  });
}
