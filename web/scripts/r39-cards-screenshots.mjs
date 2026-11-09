import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, '..', '..', 'scratch', 'r39-products-20.json'), 'utf8'));
const BASE = process.env.BASE || 'http://127.0.0.1:5173';
const outDir = join(here, '..', '..', 'scratch');
const browser = await chromium.launch();

for (const [w, h, tag] of [[1440, 900, 'desktop'], [390, 844, 'phone']]) {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.route((u) => u.pathname.startsWith('/api/'), (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/auth/me') return route.fulfill({ status: 401, body: '{}' });
      if (/^\/api\/products\b/.test(path)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    if (theme === 'dark') {
      await page.addInitScript(() => localStorage.setItem('ninecube-theme', 'dark'));
    }
    await page.goto(`${BASE}/#/products`, { waitUntil: 'commit' });
    await page.waitForSelector('.product-card', { timeout: 15000 });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: join(outDir, `r39-cards-${tag}-${theme}.png`) });
    await page.close();
  }
}
await browser.close();
console.log('done');
