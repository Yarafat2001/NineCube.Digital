import { expect, test, type Page } from '@playwright/test';
import { seedPassword, seedPasswordMissing } from './seed-password';

const LOADED = { timeout: 90_000 };

/**
 * Layout guards for the catalogue sidebar. The bugs these catch were all invisible in unit tests:
 * a grid child whose default min-width:auto let one long category name push the page sideways, a
 * sticky card whose magic offset was measured against a header that had since grown, and controls
 * whose native popups were cut off by the panel's own scroll container. Only a browser can answer
 * "does anything overflow", so that is what this file asks.
 */
async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill('customer@ninecube.demo');
  await page.getByRole('textbox', { name: 'Password' }).fill(seedPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Account' }), 'sign-in established no session')
    .toBeVisible(LOADED);
}

/** Every element inside the panel that can scroll sideways, with the text that makes it too wide. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.category-filter-panel') as HTMLElement | null;
    const navbar = document.querySelector('.navbar') as HTMLElement | null;
    const bodyScroll = panel?.querySelector('.filter-panel__body');
    return {
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      panelClientWidth: panel?.clientWidth ?? 0,
      panelOverflow: panel ? panel.scrollWidth - panel.clientWidth : 0,
      panelPosition: panel ? getComputedStyle(panel).position : 'none',
      panelTop: panel ? Math.round(panel.getBoundingClientRect().top) : -1,
      panelBottom: panel ? Math.round(panel.getBoundingClientRect().bottom) : -1,
      navbarBottom: navbar ? Math.round(navbar.getBoundingClientRect().bottom) : 0,
      panelScrollAreas: [...(panel?.querySelectorAll<HTMLElement>('*') ?? [])]
        .filter(el => getComputedStyle(el).overflowX !== 'hidden' && el.scrollWidth > el.clientWidth + 1)
        .map(el => String(el.className)),
      selectsInsidePanel: panel ? panel.querySelectorAll('select').length : 0,
      bodyIsScroller: Boolean(bodyScroll && getComputedStyle(bodyScroll).overflowY === 'auto'),
      navbarHeight: navbar ? Math.round(navbar.getBoundingClientRect().height) : 0,
      // The variable the sticky offset is built from, as the browser actually resolved it.
      headerVar: Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height'))),
      innerHeight: window.innerHeight
    };
  });
}

test.describe('catalogue sidebar layout', () => {
  test.skip(!seedPassword, seedPasswordMissing);
  test.setTimeout(300_000);

  // A browser zoom of 125% / 150% leaves the same window fewer CSS pixels, which is the case that
  // used to break: the grid still had three columns worth of content in a two column width.
  const viewports = [
    { width: 1024, height: 768, zoom: 1 },
    { width: 1280, height: 800, zoom: 1 },
    { width: 1440, height: 900, zoom: 1 },
    { width: 1920, height: 1080, zoom: 1 },
    { width: 1280, height: 800, zoom: 1.25 },
    { width: 1280, height: 800, zoom: 1.5 },
    { width: 1440, height: 900, zoom: 1.5 },
    { width: 1920, height: 1080, zoom: 1.5 }
  ];

  for (const viewport of viewports) {
    const width = Math.round(viewport.width / viewport.zoom);
    const height = Math.round(viewport.height / viewport.zoom);
    const label = viewport.zoom === 1 ? `${width}px` : `${viewport.width}px at ${Math.round(viewport.zoom * 100)}% zoom`;

    test(`holds the line at ${label}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await signIn(page);
      // A deep, long-named category: the row that used to widen its column past the viewport.
      await page.goto('/products?category=home-appliances&inStock=true');
      // Every case here is at least 853 CSS px wide, so the desktop panel is the only form the
      // sidebar takes; the mobile "Filters" trigger must stay display:none rather than doubling up.
      await expect(page.locator('.category-filter-panel')).toBeVisible(LOADED);
      await expect(page.locator('.category-filter-trigger')).toBeHidden();

      const metrics = await measure(page);
      if (width === 1280 || width === 1440) console.log(`WIDTH ${label}`, JSON.stringify(metrics));
      expect(metrics.documentOverflow, `page scrolls sideways: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(1);
      expect(metrics.panelOverflow).toBeLessThanOrEqual(1);
      expect(metrics.panelScrollAreas, `horizontal scrollers inside the panel: ${metrics.panelScrollAreas.join(', ')}`).toEqual([]);
    });
  }

  test('sticks the whole card below the header and scrolls only its body', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto('/products?category=home-appliances');
    await expect(page.locator('.category-filter-panel')).toBeVisible(LOADED);

    // A sticky element can only stay pinned while its own column has room left to travel through, so
    // first find that window: it opens once the card reaches its offset and closes when its bottom
    // reaches the bottom of the column.
    const room = await page.evaluate(() => {
      const panel = document.querySelector('.category-filter-panel') as HTMLElement;
      const layout = document.querySelector('.catalogue-layout') as HTMLElement;
      const offset = parseFloat(getComputedStyle(panel).top);
      const box = panel.getBoundingClientRect();
      return {
        offset,
        panelHeight: Math.round(box.height),
        stuckFrom: Math.round(box.top + window.scrollY - offset),
        stuckUntil: Math.round(layout.getBoundingClientRect().bottom + window.scrollY - box.height - offset)
      };
    });
    // A closed window is a real defect: the card would then be taller than the space it scrolls in,
    // so it could never be both pinned and fully readable.
    expect(room.stuckUntil, `no sticky travel: ${JSON.stringify(room)}`).toBeGreaterThan(room.stuckFrom);

    await page.evaluate(y => window.scrollTo(0, y), Math.round((room.stuckFrom + room.stuckUntil) / 2));
    await page.waitForTimeout(300);

    const metrics = await measure(page);
    console.log('STUCK ', JSON.stringify(metrics), JSON.stringify(room));
    expect(metrics.panelPosition).toBe('sticky');
    // The offset must follow the header that is really rendered, not a hand-tuned guess.
    expect(metrics.headerVar, `--header-height ${metrics.headerVar}px vs a ${metrics.navbarHeight}px bar`)
      .toBeCloseTo(metrics.navbarHeight, 0);
    expect(metrics.panelTop).toBeGreaterThanOrEqual(metrics.navbarBottom);
    expect(metrics.panelBottom).toBeLessThanOrEqual(metrics.innerHeight + 1);
    expect(metrics.bodyIsScroller).toBe(true);
    expect(metrics.selectsInsidePanel).toBe(0);

    // One scroll area: the groups scroll, the card header with "Browse & filter" and "Reset all" stays put.
    const headerBefore = await page.locator('.filter-panel__header').boundingBox();
    await page.evaluate(() => { (document.querySelector('.filter-panel__body') as HTMLElement).scrollTop = 400; });
    await page.waitForTimeout(200);
    const headerAfter = await page.locator('.filter-panel__header').boundingBox();
    const bodyScroll = await page.evaluate(() => (document.querySelector('.filter-panel__body') as HTMLElement).scrollTop);
    console.log('INSIDE', JSON.stringify({ headerBefore, headerAfter, bodyScroll }));
    expect(bodyScroll, 'the panel body did not scroll').toBeGreaterThan(0);
    expect(headerAfter?.y, 'the card header moved').toBeCloseTo(headerBefore?.y ?? -1, 0);
    await expect(page.getByRole('heading', { name: /browse & filter/i })).toBeInViewport();
  });

  test('keeps the header popovers inside the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page);
    await page.goto('/products');

    await page.getByRole('button', { name: 'Account' }).click();
    const menu = page.getByRole('menu', { name: 'Account' });
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(1280 + 1);

    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /notifications/i }).first().click();
    const panel = page.getByRole('dialog', { name: 'Notifications' });
    await expect(panel).toBeVisible();
    const panelBox = await panel.boundingBox();
    expect(panelBox).not.toBeNull();
    expect(panelBox!.y).toBeGreaterThanOrEqual(0);
    expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(800 + 1);
  });

  test('photographs the fixed sidebar at 1280 and 1440', async ({ page }) => {
    // One session for both widths: `/login` redirects away once signed in, so signing in twice in a
    // row would look for a form that is no longer there.
    await signIn(page);
    for (const width of [1280, 1440]) {
      await page.setViewportSize({ width, height: width === 1280 ? 800 : 900 });
      await page.goto('/products?category=home-appliances&inStock=true');
      await expect(page.locator('.category-filter-panel')).toBeVisible(LOADED);
      await expect(page.getByText(/products? found/i).first()).toBeVisible(LOADED);
      await page.waitForTimeout(1200);

      await page.locator('.category-filter-panel').screenshot({ path: `artifacts/sidebar-after-${width}.png` });
      await page.screenshot({ path: `artifacts/sidebar-after-page-${width}.png` });
    }
  });
});
