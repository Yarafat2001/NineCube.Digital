import { chromium, expect } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const password = (process.env.NINECUBE_SEED_PASSWORD ?? env.match(/^NINECUBE_SEED_PASSWORD\s*=\s*(.*)$/m)?.[1] ?? '').trim().replace(/^(['"])(.*)\1$/, '$2');
if (!password) throw new Error('Set NINECUBE_SEED_PASSWORD');
const audit = JSON.parse(readFileSync(new URL('../seed/clean/image-backfill-verification.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const response = await page.request.post('http://127.0.0.1:5080/api/auth/login', { data: { email: 'customer@ninecube.demo', password } });
  if (!response.ok()) throw new Error(`Sign in failed: ${response.status()}`);
  const session = await response.json();
  await page.addInitScript(session => { sessionStorage.setItem('ninecube.auth.session', JSON.stringify(session)); localStorage.setItem('ninecube-theme', 'dark'); }, session);
  await page.goto('http://127.0.0.1:5173/products?q=Walton');
  await expect(page.locator('.product-card__image').first()).toBeVisible({ timeout: 90000 });
  const failures = await page.evaluate(async products => {
    const checks = products.map(product => new Promise(resolve => {
      const img = new Image();
      const timer = setTimeout(() => resolve(product.id), 20000);
      img.onload = () => { clearTimeout(timer); resolve(img.naturalWidth > 0 ? null : product.id); };
      img.onerror = () => { clearTimeout(timer); resolve(product.id); };
      img.src = product.url.startsWith('/uploads/') ? 'http://127.0.0.1:5080' + product.url : product.url;
    }));
    return (await Promise.all(checks)).filter(id => id !== null);
  }, audit.products);
  expect(failures).toEqual([]);
  expect(await page.locator('[data-testid="image-placeholder"]').count()).toBe(0);
  mkdirSync('artifacts/modern', { recursive: true });
  await page.screenshot({ path: 'artifacts/modern/sourced-product-images-dark.png', fullPage: true });
  await page.goto('http://127.0.0.1:5173/products/135');
  await expect(page.locator('.product-detail__media img')).toBeVisible({ timeout: 90000 });
  await expect(page.getByText('Representative image', { exact: true })).toBeVisible();
  await expect(page.locator('.product-detail__media img')).toHaveJSProperty('complete', true);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/modern/sourced-product-detail-mobile.png', fullPage: true });
  console.log(`Browser verified ${audit.total} product images; catalogue and responsive detail render without placeholders.`);
} finally { await browser.close(); }
