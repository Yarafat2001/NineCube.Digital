import { expect, test, type Page } from '@playwright/test';

/**
 * The catalogue Quick View dialog, measured from what the browser resolved. The complaint was that
 * it did not look part of the shop, and the numbers behind it were: the dialog wrapped the shared
 * card media in its own 1:1 sunken box, so the white studio tile painted inside a black plate and
 * left a 74px empty band under the photo at 1440 - and at 390 the same box caps at 160px, which cut
 * 97px off the bottom of the picture. Below that, the buy row had no desktop rule at all: a block
 * div holding a 34px stepper, a 41px button with a shopping-trolley emoji in its label and a 40px
 * heart sitting 2px above it, five inline styles, and a bare amber link as the footer.
 *
 * This asks the live DOM whether there is now one media frame, whether the three controls share a
 * line and a height, whether the phone grabber stays off the laptop dialog, and whether anything
 * spills.
 *
 * The API is stubbed, so this needs no demo password - only a running SPA:
 *
 *   npm run dev -- --port 5173
 *   E2E_BASE_URL=http://127.0.0.1:5173 npm run e2e quick-view-modal
 */
const product = (id: number, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  sku: `BD-ACER-ASPI-3-A3-11D6${id}`,
  name,
  price: 57000,
  compareAtPrice: 64000,
  currency: 'BDT',
  stockQuantity: 10,
  isActive: true,
  rowVersion: 'AA',
  brandId: 3,
  brandName: 'Acer',
  brandSlug: 'acer',
  description: 'Ryzen 3 5300U processor; 8GB RAM; 256GB SSD; 15.6-inch FHD IPS display. Dual storage ready with a 1-year official warranty from the brand distributor in Dhaka.',
  imageUrl: '/products/48.webp',
  images: [],
  categories: [{ id: 12, name: 'Laptops', slug: 'laptops', isPrimary: true }],
  tags: ['laptop'],
  ...extra
});

async function stubCatalogue(page: Page) {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/api/')) return route.continue();
    const json = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/products') {
      return json({
        items: [product(1, 'Acer Aspire 3 A325-42-V2 (8GB/256GB)'), product(2, 'Acer Aspire 5 A515-44 (8GB/512GB)', { stockQuantity: 0 })],
        page: 1, pageSize: 24, totalCount: 2, totalPages: 1, hasNext: false, hasPrevious: false
      });
    }
    if (path.startsWith('/api/products/')) return json(product(1, 'Acer Aspire 3 A325-42-V2 (8GB/256GB)'));
    if (path === '/api/auth/me') return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
    if (path.endsWith('/low-stock-threshold')) return json({ threshold: 5 });
    if (path === '/api/categories/tree' || path === '/api/categories') return json([]);
    return json([]);
  });
}

async function openQuickView(page: Page, card = 0) {
  await page.goto('./#/products');
  const quickView = page.locator('.product-card').nth(card).locator('.product-card__quick-view-btn');
  await expect(quickView).toBeVisible();
  await quickView.click();
  await expect(page.locator('.quickview-modal')).toBeVisible();
  // The webp ships with the bundle; the frame is only honest once the picture has arrived.
  await page.locator('.quickview-modal__media img').first().waitFor({ state: 'attached' }).catch(() => {});
  await page.waitForTimeout(300);
}

type Rect = { x: number; y: number; w: number; h: number; top: number; bottom: number; left: number; right: number };

function dialogFacts(): Record<string, any> {
  // page.evaluate only ships this function, so anything it needs has to live inside it.
  const emojiRange = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F3FB}-\u{1F3FF}]/u;
  const rect = (el: Element | null | undefined): Rect | null => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  };
  const dialog = document.querySelector('.quickview-modal')!;
  const media = dialog.querySelector('.quickview-modal__media');
  const tile = media?.querySelector('.product-card__media, .product-detail__media');
  const img = media?.querySelector('img');
  const cta = dialog.querySelector('.quickview-modal__cta-row');
  return {
    viewport: { w: innerWidth, h: innerHeight },
    inlineStyles: [...dialog.querySelectorAll('[style]')].map(el => el.getAttribute('style')),
    emoji: [...dialog.querySelectorAll('button')].map(b => b.textContent ?? '').filter(text => emojiRange.test(text)),
    handle: rect(dialog.querySelector('.quickview-modal__handle')),
    dialog: { ...rect(dialog), scrollH: dialog.scrollHeight, clientH: dialog.clientHeight },
    media: rect(media),
    mediaBackground: media ? getComputedStyle(media).backgroundColor : null,
    tile: tile ? { cls: tile.className, ...rect(tile), fill: getComputedStyle(tile).backgroundColor } : null,
    img: rect(img),
    infoGap: getComputedStyle(dialog.querySelector('.quickview-modal__info')!).gap,
    cta: cta ? { display: getComputedStyle(cta).display, gap: getComputedStyle(cta).gap, kids: [...cta.children].map(el => ({ cls: el.className.split(' ')[0], ...rect(el) })) } : null,
    footerBorder: getComputedStyle(dialog.querySelector('.quickview-modal__footer')!).borderTopWidth,
    spill: Math.round(document.documentElement.scrollWidth - document.documentElement.clientWidth)
  };
}

for (const theme of ['light', 'dark'] as const) {
  test(`a laptop shopper gets one photo frame and one aligned buy row (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(value => localStorage.setItem('ninecube-theme', value), theme);
    await stubCatalogue(page);
    await openQuickView(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

    const facts = await page.evaluate(dialogFacts);
    expect(facts.inlineStyles, `painted by hand: ${facts.inlineStyles.join(' | ')}`).toEqual([]);
    expect(facts.emoji, `emoji in a button label: ${facts.emoji.join(' | ')}`).toEqual([]);

    // One frame: the shared card media now fills the box, so there is no band of plate left showing.
    expect(facts.media.w, 'the media box is square').toBe(facts.media.h);
    expect(Math.abs(facts.media.bottom - facts.tile.bottom), `dead band under the photo: ${facts.media.bottom - facts.tile.bottom}px`).toBeLessThanOrEqual(1);
    expect(Math.abs(facts.media.w - facts.tile.w), `side band beside the photo: ${(facts.media.w - facts.tile.w) / 2}px`).toBeLessThanOrEqual(2);
    expect(facts.img.bottom, 'the picture is not cropped by its frame').toBeLessThanOrEqual(facts.media.bottom + 1);
    expect(facts.img.right, 'the picture is not cropped by its frame').toBeLessThanOrEqual(facts.media.right + 1);
    // The approved studio canvas stays a studio canvas: solid white tile, no plate showing through.
    expect(facts.tile.fill, 'the product tile keeps the white canvas in both themes').toBe('rgb(255, 255, 255)');

    // Three controls, one line, one height.
    expect(facts.cta.display).toBe('flex');
    expect(facts.cta.kids.map((kid: any) => kid.cls)).toEqual(['stepper', 'btn', 'btn']);
    const heights = facts.cta.kids.map((kid: any) => kid.h);
    expect(Math.min(...heights), `shortest control on the row: ${Math.min(...heights)}px`).toBeGreaterThanOrEqual(34);
    for (const button of facts.cta.kids.slice(1)) expect(button.h, `${button.cls} resolved ${button.h}px tall`).toBe(44);
    const tops = facts.cta.kids.map((kid: any) => kid.top);
    expect(Math.max(...tops) - Math.min(...tops), `the row controls differ in top by ${Math.max(...tops) - Math.min(...tops)}px`).toBeLessThanOrEqual(6);

    expect(facts.footerBorder, 'the footer is divided from the buy row').toBe('1px');
    expect(facts.cta.gap).toBe('8px');
    expect(facts.infoGap, 'the info column uses the house stack rhythm').toBe('12px');

    // The sheet grabber belongs to a phone sheet, not to a centred dialog.
    expect(facts.handle.w * facts.handle.h, `the grabber resolved ${facts.handle.w}x${facts.handle.h}`).toBe(0);

    // Everything the dialog promises is on screen without scrolling inside it.
    expect(facts.dialog.scrollH, `the dialog body needed ${facts.dialog.scrollH}px of scroll`).toBeLessThanOrEqual(facts.dialog.clientH + 2);
    expect(facts.dialog.bottom, 'the dialog sits inside the viewport').toBeLessThanOrEqual(facts.viewport.h + 1);
    expect(facts.spill, 'the page does not scroll sideways').toBe(0);

    // A sold-out product swaps the row for a plain statement, and nothing else moves.
    await page.keyboard.press('Escape');
    await expect(page.locator('.quickview-modal')).toHaveCount(0);
    await openQuickView(page, 1);
    const locked = await page.evaluate(dialogFacts);
    // No stepper and no buy button, but the statement and the one control left share the same row.
    expect(locked.cta.kids.map((kid: any) => kid.cls), 'the locked row keeps its note and its control').toEqual(['muted', 'btn']);
    expect(locked.cta.kids[1].h, 'the locked control is still a 44px target').toBe(44);
    expect(await page.locator('.quickview-modal .stepper').count()).toBe(0);
    await expect(page.locator('.quickview-modal').getByText('Not currently orderable.')).toBeVisible();
    await expect(page.locator('.quickview-modal').getByRole('button', { name: /add to wishlist/i })).toBeVisible();
    expect(locked.inlineStyles).toEqual([]);
    expect(locked.emoji).toEqual([]);
  });

  test(`a phone shopper gets the sheet, the whole photo and a thumb-sized target (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(value => localStorage.setItem('ninecube-theme', value), theme);
    await stubCatalogue(page);
    await openQuickView(page);

    const facts = await page.evaluate(dialogFacts);
    expect(facts.inlineStyles, `painted by hand: ${facts.inlineStyles.join(' | ')}`).toEqual([]);
    expect(facts.emoji).toEqual([]);

    // At 390 the sheet caps this box, which is what used to crop the picture. Now the tile is the box.
    expect(Math.abs(facts.media.w - facts.tile.w), `tile ${facts.tile.w} inside a ${facts.media.w} box`).toBeLessThanOrEqual(2);
    expect(facts.img.bottom, `the picture ran ${facts.img.bottom - facts.media.bottom}px past the frame`).toBeLessThanOrEqual(facts.media.bottom + 1);
    expect(facts.img.top, 'the picture is not cropped at the top either').toBeGreaterThanOrEqual(facts.media.top - 1);

    // The buy row wraps rather than squeezing, and the buttons keep a 44px touch target.
    for (const button of facts.cta.kids.slice(1)) {
      expect(button.h, `${button.cls} resolved ${button.h}px tall on a phone`).toBe(44);
      expect(button.w, `${button.cls} is at least a thumb wide`).toBeGreaterThanOrEqual(44);
    }
    expect(facts.handle.w, 'the phone sheet keeps its grabber').toBeGreaterThanOrEqual(40);
    expect(facts.spill, 'the sheet does not scroll sideways').toBe(0);
    expect(facts.dialog.bottom, 'the sheet ends inside the screen').toBeLessThanOrEqual(facts.viewport.h + 1);
  });
}

test('the dialog stays a dialog between a laptop and a phone width', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.addInitScript(value => localStorage.setItem('ninecube-theme', value), 'dark');
  await stubCatalogue(page);
  await openQuickView(page);

  const facts = await page.evaluate(dialogFacts);
  expect(facts.media.w, 'the media box is square at every width').toBe(facts.media.h);
  expect(Math.abs(facts.media.bottom - facts.tile.bottom), 'the photo fills its frame at 1024').toBeLessThanOrEqual(1);
  expect(facts.cta.kids.map((kid: any) => kid.h)).toEqual([34, 44, 44]);
  expect(facts.handle.w * facts.handle.h, '1024 is still a laptop: no grabber').toBe(0);
  expect(facts.spill).toBe(0);

  // Nothing hides behind the dialog: the catalogue scroll is restored when it closes.
  await page.keyboard.press('Escape');
  await expect(page.locator('.quickview-modal')).toHaveCount(0);
  await expect(page.locator('.product-card').first()).toBeVisible();
});
