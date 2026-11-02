import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { seedPassword, seedPasswordMissing } from './seed-password';

/**
 * The coupon workflow length and the light-theme edges, asked of the live DOM rather than read out of
 * a stylesheet: how tall a folded step really paints, whether the registry controls are still under the
 * cursor after a long scroll, and what contrast a border resolves to once its own translucent fill is
 * blended over the card behind it.
 *
 *   E2E_API_BASE=http://127.0.0.1:5099 E2E_BASE_URL=http://127.0.0.1:5199 npm run e2e coupon-workflow
 */
const API = process.env.E2E_API_BASE ?? 'http://127.0.0.1:5080';
const LOADED = { timeout: 90_000 };

type Edge = { width: number; edge: string; own: string; vsOwn: number; vsParent: number };

declare global {
  interface Window {
    __edge: (selector: string) => Edge | null;
  }
}

async function openCoupons(page: Page, request: APIRequestContext, theme: 'light' | 'dark') {
  const response = await request.post(`${API}/api/auth/login`, {
    data: { email: 'admin@ninecube.demo', password: seedPassword }
  });
  expect(response.ok(), `admin sign-in failed: ${await response.text()}`).toBe(true);
  const session = await response.json() as { accessToken: string };

  await page.addInitScript(({ session, theme }) => {
    sessionStorage.setItem('ninecube.auth.session', JSON.stringify(session));
    localStorage.setItem('ninecube-theme', theme);
  }, { session, theme });

  await page.goto('/#/admin');
  await expect(page.getByRole('heading', { name: /administration/i })).toBeVisible(LOADED);
  await page.getByRole('tab', { name: /coupons/i }).click();
  await expect(page.getByTestId('discount-step-1')).toBeVisible(LOADED);
}

/** Blend a translucent colour down to the opaque pixels it paints, then take the WCAG ratio. */
const COLOUR_PROBE = `
  const lum = (c) => { const [r,g,b] = c.map(v => { const s = v/255; return s <= 0.03928 ? s/12.92 : Math.pow((s+0.055)/1.055, 2.4); }); return 0.2126*r + 0.7152*g + 0.0722*b; };
  const parse = (c) => (c.match(/[\\d.]+/g) || [0,0,0,0]).slice(0,4).map(Number);
  const alpha = (c) => { const p = parse(c); return p.length > 3 ? p[3] : 1; };
  const over = (fg, bg, a) => fg.slice(0,3).map((v, i) => Math.round(v*a + bg[i]*(1-a)));
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return Math.round(((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05))*100)/100; };
  window.__edge = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const cs = getComputedStyle(el);
    let node = el.parentElement; let parent = [255,255,255];
    while (node) {
      const pc = getComputedStyle(node); const a = alpha(pc.backgroundColor);
      if (a > 0) { parent = over(parse(pc.backgroundColor), parent, a); if (a > 0.99) break; }
      node = node.parentElement;
    }
    const ownAlpha = alpha(cs.backgroundColor);
    const own = ownAlpha > 0 ? over(parse(cs.backgroundColor), parent, ownAlpha) : parent;
    const edge = over(parse(cs.borderTopColor), own, alpha(cs.borderTopColor));
    return { width: parseFloat(cs.borderTopWidth), edge: 'rgb(' + edge.join(',') + ')', own: 'rgb(' + own.join(',') + ')', vsOwn: ratio(edge, own), vsParent: ratio(edge, parent) };
  };
`;

test.describe('coupon workflow length and light edges', () => {
  test.skip(!seedPassword, seedPasswordMissing);

  test('a folded step is one row that still states its value', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openCoupons(page, page.request, 'light');

    const folded = await page.evaluate(() => [...document.querySelectorAll('.discount-config-card')]
      .map(card => ({
        testId: card.getAttribute('data-testid'),
        open: card.classList.contains('discount-config-card--open'),
        height: Math.round(card.getBoundingClientRect().height),
        summary: card.querySelector('.discount-card-summary')?.textContent?.trim() ?? ''
      })));

    const closed = folded.filter(row => !row.open);
    expect(closed.length, `nothing is folded: ${JSON.stringify(folded)}`).toBeGreaterThan(0);
    for (const row of closed) {
      expect(row.height, `${row.testId} is ${row.height}px tall, not a row`).toBeLessThanOrEqual(90);
      expect(row.summary.length, `${row.testId} folds without stating anything`).toBeGreaterThan(0);
    }
    // The three steps that decide the money stay open, so nobody has to click to check them.
    for (const step of ['discount-step-1', 'discount-step-2', 'discount-step-3']) {
      expect(folded.find(row => row.testId === step)?.open, `${step} starts folded`).toBe(true);
    }

    const target = closed[0]!;
    const before = await page.getByTestId(target.testId!).boundingBox();
    await page.getByTestId(target.testId!).locator('.discount-card-toggle').click();
    await expect(page.getByTestId(target.testId!).locator('.discount-card-body')).toBeVisible();
    const after = await page.getByTestId(target.testId!).boundingBox();
    expect(after!.height, 'expanding the row changed nothing').toBeGreaterThan(before!.height + 100);
    await page.screenshot({ path: 'artifacts/coupon-workflow-folded.png', fullPage: true });
  });

  test('the presets ride one row and the page keeps its width', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openCoupons(page, page.request, 'light');
    await expect(page.locator('.coupon-template').first()).toBeVisible(LOADED);

    const rail = await page.evaluate(() => {
      const track = document.querySelector('.coupon-templates__rail');
      if (!track) return null;
      const tops = new Set([...track.querySelectorAll('.coupon-template')]
        .map(card => Math.round(card.getBoundingClientRect().top)));
      const style = getComputedStyle(track);
      return {
        rows: tops.size,
        cards: track.querySelectorAll('.coupon-template').length,
        scrolls: track.scrollWidth > track.clientWidth,
        overflowX: style.overflowX,
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    expect(rail, 'the preset rail is gone').not.toBeNull();
    expect(rail!.rows, `the presets wrapped onto ${rail!.rows} rows`).toBe(1);
    expect(rail!.scrolls, 'with this many presets the rail should scroll').toBe(true);
    expect(rail!.overflowX, 'the rail does not scroll').toBe('auto');
    expect(rail!.pageOverflow, 'the page itself scrolled sideways').toBe(0);
  });

  test('the registry controls stay pinned while the list scrolls', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openCoupons(page, page.request, 'light');
    const bar = page.locator('.registry-bar').first();
    await expect(bar.locator('.registry-filterbar input')).toBeVisible(LOADED);

    const pinned = await bar.evaluate(el => {
      const cs = getComputedStyle(el);
      const nav = document.querySelector('.navbar');
      return {
        position: cs.position,
        topPx: Math.round(parseFloat(cs.top)),
        zIndex: cs.zIndex,
        navBottom: nav ? Math.round(nav.getBoundingClientRect().bottom) : 0,
        navZ: nav ? getComputedStyle(nav).zIndex : ''
      };
    });
    expect(pinned.position).toBe('sticky');
    // It clears the navbar and floats just under it, and it never rises above the header.
    expect(pinned.topPx, `pinned at ${pinned.topPx}, navbar ends at ${pinned.navBottom}`)
      .toBeGreaterThanOrEqual(pinned.navBottom);
    expect(pinned.topPx - pinned.navBottom, `a ${pinned.topPx - pinned.navBottom}px gap is a hole, not a clearance`)
      .toBeLessThanOrEqual(24);
    expect(Number(pinned.zIndex)).toBeLessThan(Number(pinned.navZ));

    await bar.scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 600);
    // Stuck means the row stopped travelling: its viewport top sits on the pinned offset, and its own
    // paint is what the cursor meets in the middle of it rather than the rows sliding behind.
    await expect.poll(() => bar.evaluate(el => {
      const rect = el.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return { top: Math.round(rect.top), paints: !!hit && el.contains(hit) };
    }), { timeout: 10_000 }).toEqual({ top: pinned.topPx, paints: true });
    await page.screenshot({ path: 'artifacts/coupon-registry-sticky.png' });
  });

  test('light glass edges resolve to a visible line, and dark keeps its own', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openCoupons(page, page.request, 'light');
    await expect(page.locator('.table-surface')).toBeVisible(LOADED);
    await page.evaluate(COLOUR_PROBE);

    for (const selector of ['.navbar', '.coupon-templates', '.discount-config-card', '.registry-bar', '.table-surface']) {
      const edge = await page.evaluate(sel => window.__edge(sel), selector);
      expect(edge, `${selector} is missing`).not.toBeNull();
      expect(edge!.width, `${selector} has no border to see`).toBeGreaterThanOrEqual(1);
      expect(Math.max(edge!.vsOwn, edge!.vsParent),
        `${selector} edge ${edge!.edge} is invisible on ${edge!.own} (${edge!.vsOwn}/${edge!.vsParent})`)
        .toBeGreaterThanOrEqual(3);
    }
    await page.screenshot({ path: 'artifacts/coupons-light-edges.png', fullPage: true });

    await page.evaluate(() => localStorage.setItem('ninecube-theme', 'dark'));
    await page.reload();
    await expect(page.getByRole('heading', { name: /administration/i })).toBeVisible(LOADED);
    await page.getByRole('tab', { name: /coupons/i }).click();
    await expect(page.locator('.table-surface')).toBeVisible(LOADED);
    await page.evaluate(COLOUR_PROBE);
    const dark = await page.evaluate(() => window.__edge('.table-surface'));
    // The raise is a light-token change only; dark keeps its own translucent edge and its own paint.
    expect(dark!.edge, 'the light edge leaked into dark').not.toBe('rgb(119,133,154)');
    await page.screenshot({ path: 'artifacts/coupons-dark-edges.png', fullPage: true });
  });

  test('the builder fits a phone without sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openCoupons(page, page.request, 'light');
    await expect(page.locator('.table-surface')).toBeVisible(LOADED);

    const width = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      sticky: getComputedStyle(document.querySelector('.registry-bar')!).position
    }));
    expect(width.page, 'the coupons tab scrolls sideways on a phone').toBe(0);
    // A pinned bar would eat most of a short viewport before the list appeared.
    expect(width.sticky).toBe('static');

    await page.getByRole('tab', { name: /gift cards/i }).click();
    await expect(page.getByTestId('giftcard-step-1')).toBeVisible(LOADED);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
      'the gift card tab scrolls sideways on a phone').toBe(0);
    await page.screenshot({ path: 'artifacts/coupons-light-phone.png', fullPage: true });
  });
});
