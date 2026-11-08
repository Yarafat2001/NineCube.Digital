import { chromium } from '@playwright/test';

/**
 * Round 37 look-see: the home page as a visitor sees it, with the API stubbed so the sections
 * render real shapes without a running backend. Full-page shots at a laptop and a phone width,
 * in both themes.
 */
const PRODUCT = {
  id: 12, sku: 'BD-ACER-ASPI-3', name: 'Acer Aspire 3 A325-42-V2', price: 57000, compareAtPrice: 64000,
  currency: 'BDT', stockQuantity: 10, isActive: true, rowVersion: 'AA', brandId: 3, brandName: 'Acer',
  brandSlug: 'acer', imageUrl: '/products/48.webp', images: [],
  categories: [{ id: 1, name: 'Laptops', slug: 'laptops', isPrimary: true }], tags: []
};
const campaigns = [
  { id: 1, code: 'SAVE10', discountType: 'Percentage', discountValue: 10, minOrderAmount: 0, maxDiscountCap: 1500, targetType: 'Order', expiresAt: null, usageLimit: null, usageCount: 0, isActive: true, isAutomatic: false, isBannerPromoted: true, campaignTitle: 'Welcome Deal: 10% OFF Storewide with code SAVE10' },
  { id: 7, code: 'DURAMO25', discountType: 'Percentage', discountValue: 25, minOrderAmount: 0, maxDiscountCap: 3000, targetType: 'Product', targetId: 1, expiresAt: null, usageLimit: null, usageCount: 0, isActive: true, isAutomatic: false, isBannerPromoted: true, campaignTitle: 'Duramo Special: 25% OFF Duramo SL Shoes with code DURAMO25' }
];

const run = async () => {
  const browser = await chromium.launch();
  for (const [width, height, tag] of [[1440, 900, 'laptop'], [390, 844, 'phone']]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    await page.route((url) => url.pathname.startsWith('/api/'), route => {
      const path = new URL(route.request().url()).pathname;
      const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      if (path === '/api/products') {
        return json({
          items: Array.from({ length: 12 }, (_, i) => ({ ...PRODUCT, id: 20 + i, name: `${PRODUCT.name} ${i}` })),
          page: 1, pageSize: 48, totalCount: 12, totalPages: 1, hasNext: false, hasPrevious: false
        });
      }
      if (path.startsWith('/api/products/')) return json(PRODUCT);
      if (path === '/api/categories') {
        return json(['Laptops', 'Kitchen', 'Footwear', 'Home'].map((name, i) =>
          ({ id: i + 1, name, slug: name.toLowerCase(), productCount: 12 - i * 2, isActive: true })));
      }
      if (path === '/api/brands') {
        return json([{ id: 3, name: 'Acer', slug: 'acer', productCount: 9 },
          { id: 4, name: 'Apex', slug: 'apex', productCount: 6 },
          { id: 5, name: 'Duramo', slug: 'duramo', productCount: 3 }]);
      }
      if (path === '/api/coupons/campaigns') return json(campaigns);
      return json([]);
    });

    page.on('console', (msg) => { if (msg.type() === 'error') console.log('console:', msg.text().slice(0, 200)); });
    page.on('pageerror', (err) => console.log('pageerror:', String(err).slice(0, 300)));
    await page.goto('http://127.0.0.1:5173/#/', { waitUntil: 'commit', timeout: 120000 });
    await page.waitForSelector('.showcase--static', { timeout: 120000 });
    await page.waitForTimeout(2500);
    // Walk the page so the reveal observer fires before the full-page capture.
    await page.evaluate(async () => {
      const step = window.innerHeight * 0.8;
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 220));
      }
      window.scrollTo(0, 0);
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.setAttribute('data-theme', value);
        localStorage.setItem('ninecube.theme', value);
      }, theme);
      await page.waitForTimeout(700);
      await page.screenshot({ path: `../scratch/round37-home-${tag}-${theme}.png`, fullPage: true });
    }

    // What the page is made of, top to bottom.
    const inventory = await page.evaluate(() => {
      const root = document.querySelector('.showcase--static');
      if (!root) return [];
      const sections = Array.from(root.children).map((child) => {
        const el = child;
        const label = el.getAttribute('aria-label')
          ?? el.querySelector('[aria-label]')?.getAttribute('aria-label')
          ?? el.querySelector('h2')?.textContent
          ?? el.className;
        return { tag: el.tagName.toLowerCase(), cls: el.className, label, height: Math.round(el.getBoundingClientRect().height) };
      });
      return { sections, pageHeight: document.body.scrollHeight };
    });
    console.log(tag, JSON.stringify(inventory, null, 1));
    await context.close();
  }
  await browser.close();
};

run();
