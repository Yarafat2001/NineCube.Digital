import { expect, test, type Page } from '@playwright/test';

/**
 * Account security, measured from what the browser resolved. The complaint was that the page was not
 * friendly, and the numbers behind it were: three translucent cards each painted with an inline
 * padding, a session list that read "Nov 4, 2026, 12:12 PM — Nov 11, 2026, 12:12 PM" with no hint
 * which end was which, and buttons stretched to 1,342px because the page column stretches its
 * children. Then the 880px plate that fixed those left a 496px blank band down the right of the
 * column, and 65 sign-in rows on a real account still stretched the page to 5,891px. This asks the
 * live DOM whether the two halves now sit side by side, whether the log scrolls inside its own panel,
 * and whether a phone still fits.
 *
 * The API is stubbed, so this needs no demo password - only a running SPA:
 *
 *   npm run dev -- --port 5173
 *   E2E_BASE_URL=http://127.0.0.1:5173 npm run e2e security-page
 */
const USER = { id: 502, email: 'security-page@example.test', role: 'Customer', customerId: 502 };

/** The same contract AccountSecurityEndpoints.cs answers: { verified, mfaEnabled, sessions }. */
function securityFixture(verified: boolean, mfaEnabled: boolean, sessions: number) {
  const hours = (before: number) => new Date(Date.now() - before * 3_600_000).toISOString();
  const started = Array.from({ length: sessions }, (_, index) => hours(index * 2.5 + 0.4));
  return {
    verified, mfaEnabled,
    sessions: started.map((createdAtUtc, index) => ({
      id: index + 1, createdAtUtc,
      expiresAtUtc: new Date(new Date(createdAtUtc).getTime() + 14 * 86_400_000).toISOString()
    }))
  };
}

async function seedSecurityPage(page: Page, state: ReturnType<typeof securityFixture>) {
  await page.addInitScript(session => sessionStorage.setItem('ninecube.auth.session', JSON.stringify(session)), {
    user: USER, accessToken: 'security-page-only', expiresAtUtc: '2099-01-01T00:00:00Z'
  });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/api/')) return route.continue();
    if (path === '/api/auth/me') return route.fulfill({ json: USER });
    if (path === '/api/me/security') return route.fulfill({ json: state });
    if (path === '/api/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    return route.fulfill({ json: [] });
  });
  await page.goto('./#/account/security');
  await expect(page.locator('.security-page__grid')).toBeVisible();
}

type Box = { width: number; height: number; top: number; left: number; right: number; bottom: number };

const boxOf = (page: Page, selector: string): Promise<Box> => page.evaluate(item => {
  const r = document.querySelector(item[0])!.getBoundingClientRect();
  return { width: r.width, height: r.height, top: r.top, left: r.left, right: r.right, bottom: r.bottom };
}, [selector]);

const columns = (page: Page, selector: string) => page.evaluate(item =>
  [...document.querySelectorAll(item[0])].map(row => getComputedStyle(row).gridTemplateColumns.split(' ').filter(Boolean).length),
[selector]);

for (const theme of ['light', 'dark'] as const) {
  test(`a verified account reads its state, its steps and its devices (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(value => localStorage.setItem('ninecube-theme', value), theme);
    await seedSecurityPage(page, securityFixture(true, false, 3));
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

    const grid = page.locator('.security-page__grid');
    // Two plates, three blocks, nothing painted by hand.
    await expect(grid.locator('.settings-block')).toHaveCount(3);
    expect(await grid.locator('.settings-block').evaluateAll(blocks =>
      blocks.every(block => block.querySelector('.policy-card__head') !== null && block.querySelector('.policy-card__lead') !== null)),
      'every block states its heading and what the choice means').toBe(true);
    expect(await grid.locator('.settings-block').evaluateAll(blocks =>
      blocks.map(block => block.querySelector<HTMLElement>('.policy-card__head .badge')?.textContent?.trim())),
      'each block carries its state in words').toEqual(['Verified', 'Off', '3 live']);
    expect(await grid.evaluate(el => el.querySelectorAll('[style]').length), 'the page paints nothing inline').toBe(0);

    // The two halves sit side by side and together fill the column the page gives them.
    const work = await boxOf(page, '.security-work');
    const status = await boxOf(page, '.security-page__status');
    const container = await boxOf(page, '.security-page');
    expect(Math.abs(status.top - work.top), 'the status panel starts on the same line as the decisions').toBeLessThanOrEqual(1);
    expect(status.left, 'the status panel is to the right of the decisions').toBeGreaterThan(work.right);
    expect(Math.round(container.right - status.right), `the column ends ${Math.round(container.right - status.right)}px past the panel`).toBeLessThanOrEqual(1);
    expect(Math.round(work.width), 'the decisions keep a reading measure').toBeLessThanOrEqual(940);
    expect(Math.round(status.width), 'the log has room for two timestamps on a line').toBeGreaterThanOrEqual(360);

    // Turning two-step on is three ordered steps, and the browser really does lay them out as three
    // columns - number, name, control - rather than wrapping the control under the name.
    const steps = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.security-page .security-step')].map(row => {
      const control = row.querySelector<HTMLElement>('.setting-row__control');
      const r = row.getBoundingClientRect();
      return {
        columns: getComputedStyle(row).gridTemplateColumns.split(' ').filter(Boolean).length,
        width: r.width, controlWidth: control ? control.getBoundingClientRect().width : 0, height: r.height
      };
    }));
    expect(steps).toHaveLength(3);
    expect(steps.map(row => row.columns), `step columns ${steps.map(row => row.columns).join(',')}`).toEqual([3, 3, 3]);
    const numbers = await page.locator('.security-step__number').evaluateAll(nodes =>
      nodes.map(node => ({ text: node.textContent, fill: getComputedStyle(node).backgroundColor })));
    expect(numbers.map(number => number.text)).toEqual(['1', '2', '3']);
    for (const number of numbers) expect(number.fill, 'the step chip is the app well material, not a bare digit').not.toBe('rgba(0, 0, 0, 0)');
    expect(steps.every(row => row.controlWidth < row.width / 2), 'the control column is a column, not the whole row').toBe(true);

    // A session is a row with two timestamps that each say what they are.
    const sessions = page.locator('.security-sessions li');
    await expect(sessions).toHaveCount(3);
    const first = await sessions.first().evaluate(row => ({
      recent: row.querySelector('.badge')?.textContent?.trim(),
      ago: row.querySelector('strong')?.textContent?.trim(),
      times: [...row.querySelectorAll('time')].map(time => ({ label: time.parentElement?.textContent?.replace(time.textContent ?? '', '').trim(), dateTime: time.getAttribute('dateTime') }))
    }));
    expect(first.recent).toBe('Most recent');
    expect(first.ago, `the row leads with relative time, got "${first.ago}"`).toMatch(/ago$/);
    expect(first.times.map(time => time.label)).toEqual(['Started', 'Runs out']);
    for (const time of first.times) expect(time.dateTime, 'each timestamp stays machine-readable').toMatch(/T.*Z$/);

    // The revoke row belongs to the log it acts on, and inside a 452px panel it keeps its sentence
    // readable rather than being squeezed into the leftover of a 280px control column.
    const danger = await page.evaluate(() => {
      const row = document.querySelector('.security-page__status .security-danger')!;
      const hint = row.querySelector('.hint')!.getBoundingClientRect();
      const button = row.querySelector('button')!.getBoundingClientRect();
      return { hintWidth: Math.round(hint.width), buttonWidth: Math.round(button.width), lines: Math.round(hint.height / parseFloat(getComputedStyle(row.querySelector('.hint')!).lineHeight)) };
    });
    expect(danger.hintWidth, `the warning resolved ${danger.hintWidth}px wide`).toBeGreaterThanOrEqual(180);
    expect(danger.lines, `the warning wrapped onto ${danger.lines} lines`).toBeLessThanOrEqual(3);

    // A phone gets one column per row, the log under the decisions, and no sideways scroll.
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1),
      'the security page does not scroll sideways on a phone').toBe(false);
    expect(await columns(page, '.security-page .security-step'), 'a phone keeps the number and drops the control under the name').toEqual([2, 2, 2]);
    const stacked = await Promise.all([boxOf(page, '.security-work'), boxOf(page, '.security-page__status')]);
    expect(Math.round(stacked[0].left), 'a phone puts the log under the decisions, not beside them').toBe(Math.round(stacked[1].left));
    expect(stacked[1].top, 'the log clears the decisions').toBeGreaterThan(stacked[0].bottom);
  });

  test(`an unverified account is told what to do first (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(value => localStorage.setItem('ninecube-theme', value), theme);
    await seedSecurityPage(page, securityFixture(false, false, 0));

    const grid = page.locator('.security-page__grid');
    await expect(grid.getByText('Not verified')).toBeVisible();
    await expect(grid.getByText('Verify your email above before changing this.')).toBeVisible();
    // Two steps to verify the email, three to change two-step, and every control named.
    expect(await columns(page, '.security-page .security-step')).toEqual([3, 3, 3, 3, 3]);
    expect(await grid.locator('.security-step__number').count()).toBe(5);
    await expect(grid.getByRole('button', { name: 'Send verification token', exact: true })).toBeVisible();
    await expect(grid.getByRole('button', { name: 'Verify email', exact: true })).toBeVisible();
    // The locked flow says so by being disabled, and the row that explains it is above the controls.
    await expect(grid.getByLabel(/current password/i)).toBeDisabled();
    await expect(grid.getByRole('button', { name: 'Enable two-step sign-in', exact: true })).toBeDisabled();

    // An empty device list is an answer, not a blank gap.
    await expect(grid.getByText('No device is signed in right now.')).toBeVisible();

    // The warning state has to be readable in both themes: the badge carries ink of its own.
    const badge = await grid.locator('.badge--warn').evaluate(el => ({ fill: getComputedStyle(el).backgroundColor, ink: getComputedStyle(el).color }));
    expect(badge.fill, `warn badge fill ${badge.fill}`).not.toBe('rgba(0, 0, 0, 0)');
    expect(badge.ink, `warn badge ink ${badge.ink}`).not.toBe(badge.fill);

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1),
      'the verification steps do not spill on a phone').toBe(false);
  });
}

test('a long sign-in log scrolls inside its own panel instead of stretching the page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(value => localStorage.setItem('ninecube-theme', value), 'light');
  await seedSecurityPage(page, securityFixture(true, false, 65));

  const measured = await page.evaluate(() => {
    const log = document.querySelector<HTMLElement>('.security-status__log')!;
    return {
      rows: document.querySelectorAll('.security-sessions li').length,
      client: log.clientHeight,
      scroll: log.scrollHeight,
      overflow: getComputedStyle(log).overflowY,
      pageHeight: document.documentElement.scrollHeight,
      panelBottom: Math.round(document.querySelector('.security-page__status')!.getBoundingClientRect().bottom),
      viewport: window.innerHeight,
      sticky: getComputedStyle(document.querySelector('.security-page__status')!).position
    };
  });
  expect(measured.rows, 'every sign-in the API returns is still in the DOM').toBe(65);
  expect(measured.overflow, 'the log is the part that scrolls').toBe('auto');
  expect(measured.scroll, `the log holds ${measured.scroll}px of rows`).toBeGreaterThan(measured.client);
  expect(measured.pageHeight, `the page resolved ${measured.pageHeight}px tall with 65 devices`).toBeLessThan(1600);
  expect(measured.panelBottom, 'the panel, revoke row included, is on screen before any scrolling').toBeLessThanOrEqual(measured.viewport);
  expect(measured.sticky, 'the panel stays with the reader while the decisions scroll past').toBe('sticky');
});
