// Run after npm run build: node --experimental-strip-types tools/audit-mobile.mjs
// Uses isolated fixtures; never authenticates to or writes into the production database.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from '../web/node_modules/playwright-core/index.mjs';
import { handlers, customerUser, staffUser, inventoryUser, adminUser } from '../web/src/test/handlers.ts';
const require = createRequire(new URL('../web/package.json', import.meta.url));
const { setupServer } = require('msw/node');
const { http: mockHttp, HttpResponse } = require('msw');
let user = customerUser;
const mocks = setupServer(
  mockHttp.get('http://localhost:5080/api/auth/me', () => HttpResponse.json(user)),
  mockHttp.get('http://localhost:5080/api/reports/sales', () => HttpResponse.json({
    currency: 'BDT', from: '2026-09-16', to: '2026-10-16', totalOrders: 2, totalRevenue: 150,
    byStatus: [{ status: 'Confirmed', orderCount: 2, revenue: 150, percentage: 100 }]
  })), ...handlers);
mocks.listen({ onUnhandledRequest: 'error' });
const root = path.resolve('web/dist'), prefix = '/NineCube.Digital/';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://local');
    const file = path.join(root, url.pathname.slice(prefix.length) || 'index.html');
    if (!file.startsWith(root + path.sep)) throw Error('Invalid path');
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}${prefix}`;
const browser = await chromium.launch({ headless: true });
const results = [], failures = [];
try {
  for (const width of [320, 390, 768]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: true, hasTouch: true });
    await context.route('http://localhost:5080/api/**', async route => {
      const response = await fetch(route.request().url());
      await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text(), headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    const page = await context.newPage();
    const runtimeErrors = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    for (const [account, routes] of [
      [customerUser, ['/products', '/products/1', '/orders', '/orders/500', '/account', '/account/profile', '/notifications']],
      [staffUser, ['/staff', '/staff/sales']], [inventoryUser, ['/inventory']], [adminUser, ['/admin']]
    ]) {
      user = account;
      await context.addInitScript(session => sessionStorage.setItem('ninecube.auth.session', JSON.stringify(session)), {
        accessToken: 'isolated-mobile-audit', expiresAtUtc: new Date(Date.now() + 3600000).toISOString(), user
      });
      for (const route of routes) {
        await page.goto(base + '#' + route, { waitUntil: 'networkidle' });
        await page.reload({ waitUntil: 'networkidle' });
        await page.getByRole('heading', { level: 1 }).first().waitFor();
        const result = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          offscreen: [...document.querySelectorAll('.navbar, .site-footer')].some(element => {
            const rect = element.getBoundingClientRect(); return rect.left < -1 || rect.right > innerWidth + 1;
          }), heading: document.querySelector('h1')?.textContent,
          overflowElements: [...document.querySelectorAll('main *')].filter(element => {
            const rect = element.getBoundingClientRect();
            return rect.right > innerWidth + 1 && !element.closest('.table-scroll, .navbar__tray');
          }).slice(0, 5).map(element => element.className)
        }));
        const entry = { width, role: user.role, route, ...result };
        results.push(entry); console.log(JSON.stringify(entry));
        if (result.overflow || result.offscreen) failures.push(entry);
        if (route === '/products') {
          const motion = await page.locator('.product-card').first().evaluate(element => ({ revealed: element.dataset.revealed, animation: getComputedStyle(element).animationName }));
          if (motion.revealed !== 'true' || motion.animation !== 'touch-card-reveal') throw Error(`Touch card motion missing: ${JSON.stringify(motion)}`);
          await page.getByRole('button', { name: /Notifications, \d+ unread/ }).click();
          await page.getByRole('dialog', { name: 'Notifications' }).getByRole('link', { name: 'View all' }).click();
          if (!page.url().endsWith('/notifications')) throw Error('Notification View all did not navigate');
        }
      }
    }
    if (runtimeErrors.length) failures.push({ width, runtimeErrors });
    await context.close();
  }
  await fs.mkdir('web/test-results', { recursive: true });
  await fs.writeFile('web/test-results/mobile-audit.json', JSON.stringify({ results, failures }, null, 2));
  console.log(JSON.stringify({ checked: results.length, failures }));
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close(); mocks.close(); await new Promise(resolve => server.close(resolve));
}
