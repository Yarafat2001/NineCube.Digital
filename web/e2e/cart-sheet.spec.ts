import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { seedPassword, seedPasswordMissing } from './seed-password';
import { COLOUR_PROBE } from './colour-probe';

/**
 * The cart is the navbar "Your cart" sheet - there is no /cart route in this app. What the owner
 * asked for was a basket that shows what it holds, so this asks the live DOM four things: does the
 * line list have a height and rows (it measured 0px on a 1440x900 laptop before that round), does
 * the total stay reachable while the sheet scrolls, does anything in the page paint over the
 * dismiss control on a phone, and - since the owner sent a screenshot of the sheet and said the
 * design did not look good - does the body of the sheet actually read as one plate of matched wells
 * rather than three different styles of box with emoji standing in for its icons.
 *
 *   E2E_API_BASE=http://127.0.0.1:5099 E2E_BASE_URL=http://127.0.0.1:5199 npm run e2e cart-sheet
 */
const API = process.env.E2E_API_BASE ?? 'http://127.0.0.1:5080';
const LOADED = { timeout: 90_000 };

async function openCart(page: Page, request: APIRequestContext, theme: 'light' | 'dark') {
  const response = await request.post(`${API}/api/auth/login`, {
    data: { email: 'customer@ninecube.demo', password: seedPassword }
  });
  expect(response.ok(), `customer sign-in failed: ${await response.text()}`).toBe(true);
  const session = await response.json() as { accessToken: string };

  await page.addInitScript(({ session, theme }) => {
    sessionStorage.setItem('ninecube.auth.session', JSON.stringify(session));
    localStorage.setItem('ninecube-theme', theme);
  }, { session, theme });

  await addOneItemAndOpen(page);
}

/** The sheet is opened the same way a person opens it: put something in, then press the cart. */
async function addOneItemAndOpen(page: Page) {
  await page.goto('/#/products');
  await expect(page.getByRole('heading', { name: /catalogue/i })).toBeVisible(LOADED);
  const card = page.locator('.product-card').filter({ hasText: /Add to cart/i }).first();
  await expect(card, 'the catalogue never filled').toBeVisible(LOADED);
  await card.getByRole('button', { name: /add to cart/i }).click();
  await page.getByRole('button', { name: /^Cart, / }).click();
  await expect(page.locator('.cart-panel')).toBeVisible(LOADED);
}

/** A guest has a basket too - the cart lives in this browser, not in the session. */
async function openCartAsGuest(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript(({ theme }) => localStorage.setItem('ninecube-theme', theme), { theme });
  await addOneItemAndOpen(page);
}

/**
 * Geometry, computed paint and the glyphs in the sheet's own text - what the browser resolved, not
 * what the stylesheet intended. Every colour is blended over what is actually painted behind it.
 */
const SHEET_PROBE = () => {
  const parse = (colour: string) => (colour.match(/[\d.]+/g) ?? [0, 0, 0, 0]).slice(0, 4).map(Number);
  const alphaOf = (colour: string) => { const p = parse(colour); return p.length > 3 ? p[3] : 1; };
  const over = (fg: number[], bg: number[], a: number) => fg.slice(0, 3).map((v, i) => Math.round(v * a + bg[i] * (1 - a)));
  const lum = (c: number[]) => {
    const s = c.map(v => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * s[0]! + 0.7152 * s[1]! + 0.0722 * s[2]!;
  };
  const rect = (el: Element | null) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) };
  };
  const backdrop = (el: Element) => {
    const chain: [number[], number][] = [];
    let node = el.parentElement;
    while (node) {
      const colour = getComputedStyle(node).backgroundColor;
      const a = alphaOf(colour);
      if (a > 0) { chain.push([parse(colour), a]); if (a > 0.99) break; }
      node = node.parentElement;
    }
    let out = [255, 255, 255];
    for (let i = chain.length - 1; i >= 0; i--) out = over(chain[i]![0], out, chain[i]![1]);
    return out;
  };
  /** How far an element's own fill sits from the surface it rests on, in 0-255 luminance steps. */
  const steps = (el: Element | null) => {
    if (!el) return -1;
    const cs = getComputedStyle(el);
    const a = alphaOf(cs.backgroundColor);
    const bg = backdrop(el);
    const own = a > 0 ? over(parse(cs.backgroundColor), bg, a) : bg;
    return Math.round(Math.abs(lum(own) - lum(bg)) * 255);
  };
  const panel = document.querySelector('.cart-panel');
  // A pictograph can still arrive from what the shop typed - a campaign title, a product name - and
  // that is data, not chrome. This counts the sheet's own labels only.
  const DATA = '.cart-line__name, .cart-upsell__name, .cart-coupon-title, .cart-note';
  let emoji = 0;
  if (panel) {
    const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const parent = (walker.currentNode as Text).parentElement;
      if (!parent || parent.closest(DATA)) continue;
      for (const ch of (walker.currentNode as Text).nodeValue ?? '') {
        const c = ch.codePointAt(0)!;
        if (c >= 0x1f000 && c <= 0x1faff) emoji++;
      }
    }
  }

  const wells: Record<string, string | null> = {};
  for (const selector of ['.cart-lines', '.cart-ship', '.cart-upsell', '.cart-checkout-extras']) {
    const el = document.querySelector(selector);
    wells[selector] = el ? getComputedStyle(el).borderRadius : null;
  }

  const rows = [...document.querySelectorAll('.cart-upsell__item')].map(row => {
    const info = rect(row.querySelector('.cart-upsell__info'));
    const add = rect(row.querySelector('.cart-upsell__btn'));
    const name = row.querySelector('.cart-upsell__name');
    return {
      h: Math.round((row as HTMLElement).getBoundingClientRect().height),
      namePx: name ? Math.round(parseFloat(getComputedStyle(name).fontSize) * 10) / 10 : 0,
      // Stacked means the Add control starts a new line under the price instead of beside it.
      stacked: !!(info && add && add.y >= info.bottom - 1),
      onTrailingEdge: !!(info && add && add.x >= info.right - 1)
    };
  });

  const title = document.querySelector('.cart-upsell__title');
  const addBtn = document.querySelector('.cart-upsell__btn');
  const fieldset = document.querySelector('.cart-checkout-extras fieldset');
  const legend = document.querySelector('.cart-checkout-extras legend');
  const columns = fieldset
    ? new Set([...fieldset.querySelectorAll(':scope > .field')].map(f => Math.round((f as HTMLElement).getBoundingClientRect().x))).size
    : 0;

  return {
    wells,
    trackSteps: steps(document.querySelector('.cart-ship__track')),
    rows,
    titlePx: title ? Math.round(parseFloat(getComputedStyle(title).fontSize) * 10) / 10 : 0,
    titleCase: title ? getComputedStyle(title).textTransform : '',
    icons: document.querySelectorAll('.cart-panel svg').length,
    emoji,
    addPaint: addBtn
      ? { bg: getComputedStyle(addBtn).backgroundColor, shadow: getComputedStyle(addBtn).boxShadow, edge: getComputedStyle(addBtn).borderTopWidth }
      : null,
    guest: fieldset
      ? {
        columns,
        height: Math.round(fieldset.getBoundingClientRect().height),
        radius: getComputedStyle(fieldset).borderRadius,
        legendPx: legend ? Math.round(parseFloat(getComputedStyle(legend).fontSize) * 10) / 10 : 0
      }
      : null
  };
};

test.describe('the cart sheet', () => {
  test.skip(!seedPassword, seedPasswordMissing);

  test('shows its lines, keeps its total pinned and stays dismissible', async ({ page }) => {
    for (const [width, height] of [[1440, 900], [390, 844]] as const) {
      for (const theme of ['light', 'dark'] as const) {
        await page.setViewportSize({ width, height });
        await openCart(page, page.request, theme);
        await expect(page.locator('.cart-line').first()).toBeVisible(LOADED);
        await page.evaluate(COLOUR_PROBE);

        const sheet = await page.evaluate(() => {
          const box = (el: Element | null) => {
            const node = el as HTMLElement | null;
            if (!node) return null;
            const rect = node.getBoundingClientRect();
            return { h: Math.round(rect.height), top: Math.round(rect.top), bottom: Math.round(rect.bottom) };
          };
          const lines = document.querySelector('.cart-lines');
          const close = document.querySelector('.cart-sheet__close');
          const dock = document.querySelector('.cart-sticky-dock');
          const closeRect = close?.getBoundingClientRect();
          // Whatever the topmost pixel of the dismiss control actually meets: if a strip painted over
          // the sheet, this returns the strip and not the button.
          const hit = closeRect
            ? document.elementFromPoint(closeRect.left + closeRect.width / 2, closeRect.top + closeRect.height / 2)
            : null;
          return {
            lines: box(lines),
            rows: [...document.querySelectorAll('.cart-line')].map(row => Math.round(row.getBoundingClientRect().height)),
            close: box(close),
            closePaints: !!hit && !!close?.contains(hit),
            dock: box(dock),
            dockPosition: dock ? getComputedStyle(dock).position : 'missing',
            total: document.querySelector('.cart-sticky-dock__total')?.textContent?.trim() ?? '',
            viewport: { w: window.innerWidth, h: window.innerHeight }
          };
        });

        expect(sheet.lines, `${width}/${theme}: the line tray is gone`).not.toBeNull();
        expect(sheet.rows.length, `${width}/${theme}: the tray holds no rows`).toBeGreaterThan(0);
        expect(sheet.lines!.h, `${width}/${theme}: the tray paints ${sheet.lines!.h}px tall`).toBeGreaterThanOrEqual(60);
        for (const row of sheet.rows) {
          expect(row, `${width}/${theme}: a line row collapsed to ${row}px`).toBeGreaterThanOrEqual(40);
        }

        expect(sheet.closePaints, `${width}/${theme}: something paints over the Close control`).toBe(true);
        expect(sheet.close!.top, `${width}/${theme}: the Close control is off the top of the screen`).toBeGreaterThanOrEqual(0);

        expect(sheet.dockPosition, `${width}/${theme}: the total is not pinned`).toBe('sticky');
        expect(sheet.dock!.h, `${width}/${theme}: the dock is ${sheet.dock!.h}px tall`).toBeGreaterThanOrEqual(60);
        expect(sheet.dock!.bottom, `${width}/${theme}: the dock hangs below the viewport`).toBeLessThanOrEqual(sheet.viewport.h + 2);
        expect(sheet.total, `${width}/${theme}: the pinned total states nothing`).toMatch(/\d/);

        // A control that resolves to its own paint is the whole point of the option tokens.
        const stepper = await page.evaluate(() => window.__edge('.cart-line .stepper'));
        expect(stepper, `${width}/${theme}: no quantity stepper`).not.toBeNull();
        expect(stepper!.width).toBeGreaterThanOrEqual(1);
        expect(Math.max(stepper!.vsOwn, stepper!.vsParent),
          `${width}/${theme}: the stepper edge ${stepper!.edge} is invisible on ${stepper!.own}`).toBeGreaterThanOrEqual(3);

        await page.screenshot({ path: `artifacts/cart-${width}-${theme}.png` });
      }
    }
  });

  test('the sheet scrolls to the last row without hiding it behind the dock', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openCart(page, page.request, 'light');

    await page.locator('.cart-sticky-dock').scrollIntoViewIfNeeded();
    await expect(page.locator('.cart-summary-box')).toBeVisible(LOADED);
    const last = await page.evaluate(() => {
      const box = document.querySelector('.cart-summary-box')!.getBoundingClientRect();
      const dock = document.querySelector('.cart-sticky-dock')!.getBoundingClientRect();
      return { boxBottom: Math.round(box.bottom), dockTop: Math.round(dock.top) };
    });
    expect(last.boxBottom, `the summary ends at ${last.boxBottom} but the dock starts at ${last.dockTop}`)
      .toBeLessThanOrEqual(last.dockTop + 2);
  });

  test('reads as one plate of matched wells, with one row per recommendation', async ({ page }) => {
    for (const [width, height] of [[1440, 900], [390, 844]] as const) {
      for (const theme of ['light', 'dark'] as const) {
        const tag = `${width}px/${theme}`;
        await page.setViewportSize({ width, height });
        await openCart(page, page.request, theme);

        const sheet = await page.evaluate(SHEET_PROBE);

        // The three trays above the checkout plate are the same object, so they get the same corner.
        const radii = ['.cart-lines', '.cart-ship', '.cart-upsell'].map(key => sheet.wells[key]);
        expect(radii, `${tag}: a cart tray lost its well edge`).toEqual(['14px', '14px', '14px']);

        // The empty rail used to be painted in the very colour of its own tray: 7 steps in light and
        // 0 in dark. A person cannot see progress they cannot see.
        expect(sheet.trackSteps, `${tag}: the delivery rail is ${sheet.trackSteps} steps from its tray`).toBeGreaterThanOrEqual(25);

        // Every .cart-upsell class used to ship without a rule, so the list was bare 16px copy with
        // a solid button stacked under each price.
        expect(sheet.rows.length, `${tag}: no recommendations rendered`).toBeGreaterThan(0);
        for (const row of sheet.rows) {
          expect(row.stacked, `${tag}: a recommendation still stacks its Add button under the price`).toBe(false);
          expect(row.onTrailingEdge, `${tag}: the Add control is not on the trailing edge`).toBe(true);
          expect(row.namePx, `${tag}: the name is body copy at ${row.namePx}px`).toBeLessThanOrEqual(15);
          // On a laptop a name fits its column, so the row is one line of text (55-60px, where the
          // unstyled block measured 82-94px with the button on its own line). On a phone a long
          // product name legitimately wraps, so only the two checks above say anything there.
          if (width > 640) expect(row.h, `${tag}: row is ${row.h}px, so the columns are not sharing a line`).toBeLessThanOrEqual(72);
        }
        expect(sheet.titlePx, `${tag}: the block heading is ${sheet.titlePx}px`).toBe(13);
        expect(sheet.titleCase).toBe('uppercase');

        // The sheet drew its whole icon set as colour emoji, which sit a step below the copy and
        // belong to no theme at all.
        expect(sheet.icons, `${tag}: the sheet holds ${sheet.icons} line icons`).toBeGreaterThanOrEqual(8);
        expect(sheet.emoji, `${tag}: ${sheet.emoji} colour emoji still painted in the sheet's text`).toBe(0);

        // The outline tier is the step below the primary action, so it must carry no raised fill.
        expect(sheet.addPaint, `${tag}: no Add control to measure`).not.toBeNull();
        expect(sheet.addPaint!.bg, `${tag}: the Add control is still a solid default button`).toBe('rgba(0, 0, 0, 0)');
        expect(sheet.addPaint!.shadow, `${tag}: the Add control still has a raised face`).toBe('none');
        expect(parseFloat(sheet.addPaint!.edge), `${tag}: the Add control has no edge`).toBeGreaterThanOrEqual(1);

        await page.screenshot({ path: `artifacts/cart-plate-${width}-${theme}.png` });
      }
    }
  });

  test('guest checkout is a section of the plate, not a second box in it', async ({ page }) => {
    for (const [width, height] of [[1440, 900], [390, 844]] as const) {
      const tag = `${width}px`;
      await page.setViewportSize({ width, height });
      await openCartAsGuest(page, 'light');

      const sheet = await page.evaluate(SHEET_PROBE);
      expect(sheet.guest, `${tag}: a guest saw no checkout form`).not.toBeNull();

      // The native fieldset stacked seven full-width fields down the sheet, which measured 761px of
      // form at 1440 and kept the bottom of it under the sticky total; paired two-up it is 373px.
      // A phone is the width of the sheet, so there the fields go back to one per line (628px).
      expect(sheet.guest!.columns, `${tag}: expected ${width <= 640 ? 'one field per line' : 'two fields per line'}`)
        .toBe(width <= 640 ? 1 : 2);
      expect(sheet.guest!.height, `${tag}: the guest form is ${sheet.guest!.height}px tall`)
        .toBeLessThanOrEqual(width <= 640 ? 700 : 500);
      expect(sheet.guest!.radius, `${tag}: the guest form breaks the well radius`).toBe('14px');
      expect(sheet.guest!.legendPx, `${tag}: the legend is body copy at ${sheet.guest!.legendPx}px`).toBe(13);

      await page.screenshot({ path: `artifacts/cart-guest-${width}.png` });
    }
  });
});
