import { expect, test, type Page } from '@playwright/test';

/**
 * Round 25, ask five: a discount was applied to the basket by the server and nowhere on the screen
 * said what it saved. The complaint was that the saving "appears as a widget in several positions",
 * so this measures the four positions one component now fills - the product detail price line, the
 * phone purchase dock, the Quick View price line and the cart total - and asks the live DOM whether
 * each one states the amount without costing the surface its layout.
 *
 * What the fix had to survive: on a phone the detail page price line is 340px wide, its selling
 * price takes 173px and the struck-price group 197px, so the full "You save BDT 7,000" sentence
 * measured 146px and pushed that line from two rows to three (62px to 96px). The widget therefore
 * loses its words on the two lines that cannot fit them and keeps the number. Measured here: the
 * line stays at two rows and 63px at 390, the purchase dock keeps the saving beside the price on
 * one line, and the cart dock does not grow at all (109px at 390, 116px at 1440, pill inside the
 * total row).
 *
 * The API is stubbed, so this needs no demo password - only a running SPA:
 *
 *   npm run dev -- --port 5173
 *   E2E_BASE_URL=http://127.0.0.1:5173 npm run e2e savings-widget
 */
const PRICE = 57000;
const LIST_PRICE = 64000;
const CART_DISCOUNT = 4500;
const USER = { id: 7, email: 'customer@ninecube.demo', fullName: 'Nadia Rahman', role: 'Customer' };

function product(compareAtPrice: number | null) {
  return {
    id: 1, sku: 'BD-ACER-ASPI-3-A3-11D61', name: 'Acer Aspire 3 A325-42-V2 (8GB/256GB)',
    price: PRICE, compareAtPrice, currency: 'BDT', stockQuantity: 10, isActive: true, rowVersion: 'AA',
    brandId: 3, brandName: 'Acer', brandSlug: 'acer',
    description: 'Ryzen 3 5300U processor; 8GB RAM; 256GB SSD; 15.6-inch FHD IPS display.',
    imageUrl: '/products/48.webp', images: [],
    categories: [{ id: 12, name: 'Laptops', slug: 'laptops', isPrimary: true }], tags: ['laptop']
  };
}

/** A basket the server has already discounted, answered in the shape CheckoutQuote and the promo endpoint use. */
function stubApi(page: Page, options: { compareAtPrice: number | null; discountAmount: number }) {
  const item = product(options.compareAtPrice);
  const automatic = {
    isValid: options.discountAmount > 0, reason: null, discountAmount: options.discountAmount,
    code: 'WINTER10', campaignTitle: 'Winter device offer', scopeSummary: 'Laptops'
  };
  return page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/api/')) return route.continue();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/products') {
      return json({ items: [item], page: 1, pageSize: 24, totalCount: 1, totalPages: 1, hasNext: false, hasPrevious: false });
    }
    if (path.startsWith('/api/products/')) return json(item);
    if (path === '/api/auth/me') return json(USER);
    if (path === '/api/me') {
      return json({
        ...USER, phone: '01700000000',
        addresses: [{ id: 4, label: 'Home', name: 'Nadia Rahman', phone: '01700000000', division: 'Dhaka', district: 'Dhaka', area: 'Gulshan', addressLine: 'House 12, Road 5', countryCode: 'BD', isDefault: true }],
        preferences: {}
      });
    }
    if (path.startsWith('/api/reviews/products/')) return json({ averageRating: 4.5, totalReviews: 1, recentReviews: [] });
    if (path === '/api/coupons/available') return json([]);
    if (path === '/api/coupons/evaluate-cart') {
      return json({
        automaticDiscount: automatic, manualDiscount: null, effectiveDiscount: automatic,
        totalDiscountAmount: options.discountAmount, activeCampaignHeadline: 'Winter device offer',
        freeShippingThreshold: 5000, qualifiesForFreeShipping: true, amountNeededForFreeShipping: 0
      });
    }
    if (path === '/api/checkout/quote') {
      return json({
        minDeliveryDays: 1, maxDeliveryDays: 3, subTotal: PRICE, discountAmount: options.discountAmount,
        shippingAmount: 0, giftCardAmount: 0, totalAmount: PRICE - options.discountAmount,
        currency: 'BDT', freeShippingThreshold: 5000, couponCode: options.discountAmount > 0 ? 'WINTER10' : null
      });
    }
    if (path === '/api/checkout/options') return json({ onlinePaymentsEnabled: true });
    if (path.startsWith('/api/wishlist')) return json([]);
    if (path.endsWith('/restock-subscriptions')) return json([]);
    if (path.endsWith('/low-stock-threshold')) return json({ threshold: 5 });
    if (path === '/api/categories' || path === '/api/categories/tree') return json([]);
    return json([]);
  });
}

/** Theme, a cleared basket and a signed-in customer, written before the app boots. */
function seed(page: Page, theme: 'light' | 'dark') {
  return page.addInitScript(({ theme, user }) => {
    localStorage.setItem('ninecube-theme', theme);
    localStorage.removeItem('ninecube:cart');
    sessionStorage.setItem('ninecube.auth.session', JSON.stringify({
      accessToken: 'stub.customer.jwt', user, expiresAtUtc: new Date(Date.now() + 3_600_000).toISOString()
    }));
  }, { theme, user: USER });
}

type Host = { selector: string; present: boolean; h: number; hWithoutWidget: number; lines: number; overflowX: number };
type Measurement = { count: number; hosts: Host[]; note: { text: string; wordsVisible: boolean; inPage: boolean } | null; spill: number };
type Probe = { scope: string | null; selectors: string[] };

/**
 * Height of each host with the widget hidden and then shown, its row count, the widget's own text,
 * whether its words survived, and whether anything spills out of the page - the DOM answering, not
 * the stylesheet. `scope` matters because the cart sheet and Quick View open on top of a page that
 * has its own price line, and both of those pages are still in the document.
 */
const MEASURE = (probe: Probe): Measurement => {
  const rect = (el: Element | null) => (el ? el.getBoundingClientRect() : null);
  const scope = probe.scope ? document.querySelector(probe.scope) ?? document : document;
  const rowsOf = (host: Element) => {
    const rows: Array<{ top: number; bottom: number }> = [];
    for (const child of [...host.children]) {
      const r = child.getBoundingClientRect();
      const row = rows.find(x => r.top < x.bottom - 2 && r.bottom > x.top + 2);
      if (row) { row.top = Math.min(row.top, r.top); row.bottom = Math.max(row.bottom, r.bottom); }
      else rows.push({ top: r.top, bottom: r.bottom });
    }
    return rows.length;
  };

  const notes = [...scope.querySelectorAll<HTMLElement>('.savings-note')];
  for (const note of notes) note.style.display = 'none';
  const without = probe.selectors.map(selector => Math.round(rect(document.querySelector(selector))?.height ?? 0));
  for (const note of notes) note.style.display = '';

  const first = notes[0] ?? null;
  const label = first?.querySelector<HTMLElement>('.savings-note__label') ?? null;
  return {
    count: notes.length,
    hosts: probe.selectors.map((selector, index) => {
      const host = document.querySelector(selector);
      return {
        selector,
        present: !!host,
        h: Math.round(rect(host)?.height ?? 0),
        hWithoutWidget: without[index]!,
        lines: host ? rowsOf(host) : 0,
        overflowX: host ? host.scrollWidth - host.clientWidth : 0
      };
    }),
    note: first ? {
      text: (first.textContent ?? '').replace(/\s+/g, ' ').trim(),
      wordsVisible: !!label && label.getBoundingClientRect().width > 8,
      inPage: Math.round(first.getBoundingClientRect().right) <= window.innerWidth
    } : null,
    spill: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
};

const DOCK = () => {
  const bar = document.querySelector('.pdp-sticky-bar');
  if (!bar) return null;
  const note = bar.querySelector('.savings-note')?.getBoundingClientRect();
  const price = bar.querySelector('.pdp-sticky-bar__price')?.getBoundingClientRect();
  const cta = bar.querySelector('.pdp-sticky-bar__action .btn')?.getBoundingClientRect();
  return {
    h: Math.round(bar.getBoundingClientRect().height),
    opacity: Number(getComputedStyle(bar).opacity),
    ctaBottom: cta ? Math.round(cta.bottom) : null,
    ctaRight: cta ? Math.round(cta.right) : null,
    vh: window.innerHeight,
    vw: window.innerWidth,
    sameLineAsPrice: !!(note && price && Math.abs(note.top - price.top) <= 8)
  };
};

for (const theme of ['light', 'dark'] as const) {
  test(`a discounted product states its saving on every surface it touches, without breaking any of them (${theme})`, async ({ page }) => {
    test.setTimeout(180_000);
    await stubApi(page, { compareAtPrice: LIST_PRICE, discountAmount: CART_DISCOUNT });
    await seed(page, theme);

    for (const [width, height] of [[1440, 900], [390, 844]] as const) {
      const phone = width <= 768;
      await page.setViewportSize({ width, height });

      // 1. The detail page price line: the number always arrives, the words only where they fit.
      await page.goto('./#/products/1', { waitUntil: 'networkidle' });
      await expect(page.locator('.product-detail__summary')).toBeVisible();
      await expect(page.locator('.product-detail__price-row [data-testid="savings-note"]')).toBeVisible();
      const pdp = await page.evaluate(MEASURE, { scope: '.product-detail__summary', selectors: ['.product-detail__price-row'] });
      expect(pdp.count, `one widget on the price line (${width})`).toBe(1);
      expect(pdp.note!.text, `the saving is the gap between the two server prices (${width})`).toContain('You save BDT 7,000');
      expect(pdp.note!.inPage).toBe(true);
      expect(pdp.note!.wordsVisible, `the words stay where they fit (${width})`).toBe(!phone);
      if (phone) {
        expect(pdp.hosts[0]!.lines, 'the phone price line keeps its two rows').toBe(2);
        expect(pdp.hosts[0]!.h - pdp.hosts[0]!.hWithoutWidget, 'and gains a pixel, not a row').toBeLessThanOrEqual(8);
      } else {
        expect(pdp.hosts[0]!.lines, 'the laptop line takes at most one more row').toBeLessThanOrEqual(3);
        expect(pdp.hosts[0]!.h - pdp.hosts[0]!.hWithoutWidget).toBeLessThanOrEqual(40);
      }
      expect(pdp.hosts[0]!.overflowX, 'the row does not scroll inside its own box').toBe(0);
      expect(pdp.spill, `nothing pushes the page sideways (${width})`).toBe(0);

      // 2. The purchase dock is the phone's own surface; it appears once the buy block is behind you.
      if (phone) {
        // The dock's own rule is "buy block's bottom above 60px", so scroll exactly that far rather
        // than guessing at a landmark - the reviews section under the buy block is a different depth
        // depending on how many reviews the API returns.
        await page.evaluate(() => {
          const buy = document.querySelector('.product-detail__purchase');
          if (buy) window.scrollTo(0, window.scrollY + buy.getBoundingClientRect().bottom - 30);
        });
        await expect.poll(() => page.evaluate(() => {
          const bar = document.querySelector('.pdp-sticky-bar');
          return bar ? Number(getComputedStyle(bar).opacity) : 0;
        }), 'the purchase dock is on screen').toBeGreaterThan(0.9);
        const dock = await page.evaluate(DOCK);
        expect(dock!.sameLineAsPrice, 'the saving sits beside the price it explains').toBe(true);
        expect(dock!.h, 'the dock does not grow a second row of chrome').toBeLessThanOrEqual(70);
        expect(dock!.ctaBottom!, 'the checkout button stays inside the dock').toBeLessThanOrEqual(dock!.vh);
        expect(dock!.ctaRight!, 'and inside the screen').toBeLessThanOrEqual(dock!.vw);
        await page.evaluate(() => scrollTo(0, 0));
      }

      // 3. The cart total: the amount the server put on the basket, not the list price gap.
      await page.locator('.product-detail__purchase .btn--primary').first().click();
      await page.getByRole('button', { name: /^Cart, / }).click();
      await expect(page.locator('.cart-sticky-dock')).toBeVisible();
      await expect(page.locator('[data-testid="cart-total"]')).toBeVisible();
      await expect(page.locator('.cart-sticky-dock [data-testid="savings-note"]')).toBeVisible();
      const cart = await page.evaluate(MEASURE, { scope: '.cart-sticky-dock', selectors: ['.cart-sticky-dock__totalgroup', '.cart-sticky-dock'] });
      expect(cart.count, `one widget in the cart dock (${width})`).toBe(1);
      expect(cart.note!.text).toContain('You save BDT 4,500');
      expect(cart.note!.wordsVisible, 'the cart has room for the words at every width').toBe(true);
      expect(cart.hosts[1]!.h - cart.hosts[1]!.hWithoutWidget, 'the cart dock does not grow for the widget').toBeLessThanOrEqual(2);
      expect(cart.spill).toBe(0);
      await page.keyboard.press('Escape');
      await expect(page.locator('.cart-sticky-dock')).toBeHidden();

      // 4. Quick View, opened from the catalogue card.
      await page.goto('./#/products', { waitUntil: 'networkidle' });
      await expect(page.locator('.product-card').first()).toBeVisible();
      await page.locator('.product-card__quick-view-btn').first().click();
      await expect(page.locator('.quickview-modal__price-row')).toBeVisible();
      const quick = await page.evaluate(MEASURE, { scope: '.quickview-modal', selectors: ['.quickview-modal__price-row', '.quickview-modal__info'] });
      expect(quick.count, `one widget in the sheet (${width})`).toBe(1);
      expect(quick.note!.text).toContain('You save BDT 7,000');
      expect(quick.note!.wordsVisible, 'Quick View keeps its words at every width').toBe(true);
      expect(quick.hosts[1]!.overflowX, 'the sheet body does not scroll sideways').toBe(0);
      expect(quick.spill).toBe(0);
      const sheet = await page.evaluate(() => {
        const panel = document.querySelector('.quickview-modal')?.getBoundingClientRect();
        const footer = document.querySelector('.quickview-modal__footer')?.getBoundingClientRect();
        return {
          bottom: panel ? Math.round(panel.bottom) : 0,
          top: panel ? Math.round(panel.top) : 0,
          footerBottom: footer ? Math.round(footer.bottom) : null,
          vh: window.innerHeight
        };
      });
      expect(sheet.top, `the sheet starts inside the viewport (${width})`).toBeGreaterThanOrEqual(0);
      expect(sheet.bottom, `and ends inside it (${width})`).toBeLessThanOrEqual(sheet.vh + 1);
      expect(sheet.footerBottom!, `the buy row is reachable (${width})`).toBeLessThanOrEqual(sheet.vh);
      await page.keyboard.press('Escape');
      await expect(page.locator('.quickview-modal__price-row')).toBeHidden();
    }
  });

  test(`a product at its full price and an undiscounted basket state nothing at all (${theme})`, async ({ page }) => {
    test.setTimeout(120_000);
    await stubApi(page, { compareAtPrice: null, discountAmount: 0 });
    await seed(page, theme);

    for (const [width, height] of [[1440, 900], [390, 844]] as const) {
      await page.setViewportSize({ width, height });
      await page.goto('./#/products/1', { waitUntil: 'networkidle' });
      await expect(page.locator('.product-detail__price')).toBeVisible();
      expect(await page.locator('[data-testid="savings-note"]').count(), 'no list price, no widget').toBe(0);
      expect(await page.locator('.pdp-price-meta').count(), 'and no struck price either').toBe(0);
      const pdp = await page.evaluate(MEASURE, { scope: '.product-detail__summary', selectors: ['.product-detail__price-row'] });
      expect(pdp.spill).toBe(0);

      await page.locator('.product-detail__purchase .btn--primary').first().click();
      await page.getByRole('button', { name: /^Cart, / }).click();
      await expect(page.locator('[data-testid="cart-total"]')).toBeVisible();
      const cart = await page.evaluate(MEASURE, { scope: '.cart-sticky-dock', selectors: ['.cart-sticky-dock'] });
      expect(cart.count, 'a basket with no discount shows no saving').toBe(0);
      expect(cart.hosts[0]!.present, 'the dock is still there without it').toBe(true);
      await page.keyboard.press('Escape');

      await page.goto('./#/products', { waitUntil: 'networkidle' });
      await page.locator('.product-card__quick-view-btn').first().click();
      await expect(page.locator('.quickview-modal__price-row')).toBeVisible();
      expect(await page.locator('[data-testid="savings-note"]').count(), 'Quick View too').toBe(0);
      await page.keyboard.press('Escape');
    }
  });
}
