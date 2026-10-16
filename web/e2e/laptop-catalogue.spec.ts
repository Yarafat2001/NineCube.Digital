import { test, expect } from '@playwright/test';
import type { PagedResult, Product } from '../src/api/types';
import { seedPassword, seedPasswordMissing } from './seed-password';

test('sourced laptops have compact identities, brand filters and working galleries', async ({ page, request }) => {
  test.skip(!seedPassword, seedPasswordMissing);
  const login = await request.post('http://127.0.0.1:5080/api/auth/login', {
    data: { email: 'customer@ninecube.demo', password: seedPassword }
  });
  await expect(login).toBeOK();
  const session = await login.json();
  const response = await request.get('http://127.0.0.1:5080/api/products?categorySlug=laptops&pageSize=100', {
    headers: { Authorization: `Bearer ${session.accessToken}` }
  });
  await expect(response).toBeOK();
  const data: PagedResult<Product> = await response.json();
  const laptops = data.items.filter(product => product.sourceName === 'Star Tech Bangladesh');
  expect(laptops.length).toBeGreaterThanOrEqual(12);
  expect(new Set(laptops.map(product => product.brandName)).size).toBeGreaterThanOrEqual(8);
  expect(new Set(laptops.map(product => product.sku)).size).toBe(laptops.length);
  for (const laptop of laptops) {
    expect(laptop.sku.length).toBeLessThanOrEqual(24);
    expect(laptop.name.length).toBeLessThanOrEqual(55);
    expect(laptop.categories?.some(category => category.slug === 'laptops' && category.isPrimary)).toBe(true);
    expect(laptop.images?.length).toBeGreaterThanOrEqual(2);
    expect(laptop.images?.filter(image => image.isPrimary)).toHaveLength(1);
    expect(laptop.description).toMatch(/(?:8|16|32)GB RAM/);
  }
  await page.addInitScript(session => {
    sessionStorage.setItem('ninecube.auth.session', JSON.stringify(session));
    localStorage.setItem('ninecube-theme', 'dark');
  }, session);
  await page.goto('/products?category=laptops&brand=apple');
  await expect(page.getByText('MacBook Air M5 13', { exact: false }).first()).toBeVisible();
  await expect(page.locator('.product-card__image').first()).toHaveJSProperty('complete', true);
  expect(await page.locator('[data-testid="image-placeholder"]').count()).toBe(0);

  const laptop = laptops.find(product => product.brandName === 'Dell')!;
  await page.goto(`/products/${laptop.id}`);
  const mainImage = page.locator('.product-detail__media img');
  await expect(mainImage).toBeVisible();
  const firstSource = await mainImage.getAttribute('src');
  await page.locator('.product-detail__thumbs button').nth(1).click();
  await expect(mainImage).not.toHaveAttribute('src', firstSource!);
  await expect(mainImage).toHaveJSProperty('complete', true);
  expect(await mainImage.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
