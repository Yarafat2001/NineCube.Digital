import { expect, test, type Page } from '@playwright/test';
import { seedPassword, seedPasswordMissing } from './seed-password';

const LOADED = { timeout: 90_000 };

/**
 * The summary surfaces are styled by rules a unit test can only match as text, so this asks the
 * browser what it actually resolved: does the accent edge exist, do the sales tiles and charts share
 * it with the dashboard, and do table rows animate only for visitors who allow motion.
 */
async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(seedPassword);
  await page.getByRole('button', { name: 'LOGIN', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Account' }), 'sign-in established no session')
    .toBeVisible(LOADED);
}

/** The resolved top edge of a surface: height and paint, from the ::before the treatment is built from. */
function edge(page: Page, selector: string) {
  return page.evaluate(target => {
    const el = document.querySelector(target);
    if (!el) return null;
    const before = getComputedStyle(el, '::before');
    return {
      height: parseFloat(before.height),
      painted: before.backgroundImage.includes('gradient') || before.content !== 'none',
      position: getComputedStyle(el).position
    };
  }, selector);
}

test.describe('shared surface depth', () => {
  test.skip(!seedPassword, seedPasswordMissing);

  test('sales tiles, charts and every table carry the accent edge', async ({ page }) => {
    await signIn(page, 'staff@ninecube.demo');
    await page.goto('/staff/sales');
    await expect(page.locator('.sales-stats .stat-tile').first(), 'the summary never arrived')
      .toBeVisible(LOADED);

    for (const selector of ['.sales-stats .stat-tile', '.sales-chart']) {
      const found = await edge(page, selector);
      expect(found, `${selector} is missing`).not.toBeNull();
      expect(found!.height, `${selector} has no accent edge`).toBeCloseTo(3, 0);
      expect(found!.painted, `${selector} has no accent paint`).toBe(true);
      expect(found!.position, `${selector} cannot pin its own edge`).toBe('relative');
    }

    // The two chart cards sit side by side and keep their own width - the flex column the dashboard
    // tile uses would shrink them to their content.
    const charts = await page.$$eval('.sales-chart', nodes => nodes.map(node => {
      const rect = (node as HTMLElement).getBoundingClientRect();
      return { top: Math.round(rect.top), width: Math.round(rect.width) };
    }));
    expect(charts).toHaveLength(2);
    expect(new Set(charts.map(chart => chart.top)).size, 'the charts are not in one row').toBe(1);
    expect(charts[0]!.width).toBeGreaterThan(300);
    await page.screenshot({ path: 'artifacts/sales-surfaces.png', fullPage: true });

    await page.goto('/staff');
    await expect(page.locator('.table-surface tbody tr').first(), 'no order rows').toBeVisible(LOADED);
    const table = await edge(page, '.table-surface');
    expect(table!.height, 'the table lost its accent edge').toBeCloseTo(3, 0);
    expect(table!.painted, 'the table has no accent paint').toBe(true);
    await page.screenshot({ path: 'artifacts/staff-table-surface.png', fullPage: true });
  });

  test('rows fade in with motion allowed and stand still without it', async ({ page }) => {
    await signIn(page, 'inventory@ninecube.demo');
    // The inventory list asks for 50 rows per page and its data is seeded, so the stagger has a
    // fixed number of rows to spread over. The staff queue would not: it holds only the orders that
    // happen to still be Pending, and earlier runs confirm them away.
    await page.goto('/inventory');
    await expect(page.locator('.table-surface tbody tr').first(), 'no product rows').toBeVisible(LOADED);

    const animated = await page.evaluate(() => {
      const row = document.querySelector('.table-surface tbody tr') as HTMLElement;
      const style = getComputedStyle(row);
      return { name: style.animationName, duration: style.animationDuration, fill: style.animationFillMode };
    });
    expect(animated.name, 'the rows do not animate in').toBe('row-in');
    expect(animated.fill, 'rows would flash at full opacity before their delay').toBe('both');

    // The stagger has to end: row eight and every row after it arrive together.
    const delays = await page.evaluate(() => [...document.querySelectorAll('.table-surface tbody tr')]
      .slice(0, 12)
      .map(row => Math.round(parseFloat(getComputedStyle(row).animationDelay) * 1000)));
    expect(delays.length, `${delays.length} rows were measured`).toBeGreaterThanOrEqual(8);
    expect(new Set(delays).size, `the rows all share one delay: ${delays}`).toBeGreaterThan(1);
    expect(new Set(delays.slice(7)).size, `the delay keeps growing past row 8: ${delays}`).toBe(1);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await expect(page.locator('.table-surface tbody tr').first(), 'no product rows').toBeVisible(LOADED);
    const still = await page.evaluate(() => {
      const row = document.querySelector('.table-surface tbody tr') as HTMLElement;
      return { name: getComputedStyle(row).animationName, opacity: getComputedStyle(row).opacity };
    });
    expect(still.name, 'rows still animate under reduced motion').toBe('none');
    expect(Number(still.opacity), 'a row is left faded out').toBe(1);
  });
});
