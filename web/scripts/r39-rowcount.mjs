import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, '..', '..', 'scratch', 'r38-products.json'), 'utf8'));
const browser = await chromium.launch();
for (const [w, h, tag] of [[1440, 900, 'desktop'], [1280, 800, 'laptop'], [390, 844, 'phone']]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.route((u) => u.pathname.startsWith('/api/'), (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ status: 401, body: '{}' });
    if (/^\/api\/products\b/.test(path)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto('http://127.0.0.1:5173/#/products', { waitUntil: 'commit' });
  await page.waitForSelector('.product-card', { timeout: 15000 });
  await page.waitForTimeout(1500);
  const rows = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.product-card')];
    const tops = new Set(cards.map(c => Math.round(c.getBoundingClientRect().top)));
    const grid = document.querySelector('.grid-products').getBoundingClientRect();
    const firstRow = cards.filter(c => Math.abs(c.getBoundingClientRect().top - Math.min(...tops)) < 2).length;
    return { total: cards.length, rows: tops.size, firstRow, gridW: Math.round(grid.width) };
  });
  console.log(tag, JSON.stringify(rows));
  await page.close();
}
await browser.close();
