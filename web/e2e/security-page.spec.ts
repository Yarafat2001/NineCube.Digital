import { expect, test, type Page } from '@playwright/test';

/**
 * Account security, measured from what the browser resolved. The complaint was that the page was not
 * friendly, and the numbers behind it were: three translucent cards each painted with an inline
 * padding, a session list that read "Nov 4, 2026, 12:12 PM — Nov 11, 2026, 12:12 PM" with no hint
 * which end was which, and buttons stretched to 1,342px because the page column stretches its
 * children. This asks the live DOM whether the plate now reads at a measure, whether each decision
 * carries its state in words, whether the two flows are numbered, and whether a phone still fits.
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
  // AuthService issues a refresh token for fourteen days from sign-in, so every session listed here
  // is still inside its own lifetime, the way the real query filters them.
  const started = [7, 52, 190].slice(0, sessions).map(hours);
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
  await expect(page.locator('.security-page .settings-plate')).toBeVisible();
}

type Row = { columns: number; width: number; controlWidth: number; height: number; top: number; left: number };

const readRows = (page: Page, selector: string): Promise<Row[]> => page.evaluate(list => {
  return [...document.querySelectorAll<HTMLElement>(list[0])].map(row => {
    const control = row.querySelector<HTMLElement>('.setting-row__control');
    return {
      columns: getComputedStyle(row).gridTemplateColumns.split(' ').filter(Boolean).length,
      width: Math.round(row.getBoundingClientRect().width),
      controlWidth: control ? Math.round(control.getBoundingClientRect().width) : 0,
      height: Math.round(row.getBoundingClientRect().height),
      top: Math.round(row.getBoundingClientRect().top),
      left: Math.round(row.getBoundingClientRect().left)
    };
  });
}, [selector]);

for (const theme of ['light', 'dark'] as const) {
  test(`a verified account reads its state, its steps and its devices (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(value => localStorage.setItem('ninecube-theme', value), theme);
    await seedSecurityPage(page, securityFixture(true, false, 3));
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

    const plate = page.locator('.security-page .settings-plate');
    // One plate, three blocks, nothing painted by hand.
    expect(await plate.evaluate(el => el.getAttribute('style')), 'the plate carries an inline style').toBeNull();
    await expect(plate.locator('.settings-block')).toHaveCount(3);
    expect(await plate.locator('.settings-block').evaluateAll(blocks =>
      blocks.every(block => block.querySelector('.policy-card__head') !== null && block.querySelector('.policy-card__lead') !== null)),
      'every block states its heading and what the choice means').toBe(true);
    expect(await plate.locator('.settings-block').evaluateAll(blocks =>
      blocks.map(block => block.querySelector<HTMLElement>('.policy-card__head .badge')?.textContent?.trim())),
      'each block carries its state in words').toEqual(['Verified', 'Off', '3 live']);

    // The column the page sits in is 1,376px wide; the plate keeps a reading measure so a six-digit
    // code box is never set a thousand pixels from its own label.
    const plateWidth = await plate.evaluate(el => Math.round(el.getBoundingClientRect().width));
    expect(plateWidth, `the plate resolved ${plateWidth}px wide`).toBeLessThanOrEqual(880);

    // Turning two-step on is three ordered steps, and the browser really does lay them out as three
    // columns - number, name, control - rather than wrapping the control under the name.
    const steps = await readRows(page, '.security-page .security-step');
    expect(steps).toHaveLength(3);
    expect(steps.map(row => row.columns), `step columns ${steps.map(row => row.columns).join(',')}`).toEqual([3, 3, 3]);
    const numbers = await plate.locator('.security-step__number').evaluateAll(nodes =>
      nodes.map(node => ({ text: node.textContent, fill: getComputedStyle(node).backgroundColor, radius: getComputedStyle(node).borderRadius })));
    expect(numbers.map(number => number.text)).toEqual(['1', '2', '3']);
    for (const number of numbers) expect(number.fill, 'the step chip is the app well material, not a bare digit').not.toBe('rgba(0, 0, 0, 0)');
    expect(steps.every(row => row.controlWidth < row.width / 2), 'the control column is a column, not the whole row').toBe(true);

    // A session is a row with two timestamps that each say what they are.
    const sessions = plate.locator('.security-sessions li');
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

    // A phone gets one column per row and no sideways scroll.
    await page.setViewportSize({ width: 390, height: 844 });
    const phone = await page.evaluate(() => ({ spills: document.documentElement.scrollWidth > window.innerWidth + 1 }));
    expect(phone.spills, 'the security page does not scroll sideways on a phone').toBe(false);
    const phoneSteps = await readRows(page, '.security-page .security-step');
    expect(phoneSteps.map(row => row.columns).join(','), 'a phone keeps the number and drops the control under the name').toBe('2,2,2');
    expect(Math.max(...phoneSteps.map(row => row.height)), 'the step rows have room for their hints').toBeGreaterThan(90);
  });

  test(`an unverified account is told what to do first (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(value => localStorage.setItem('ninecube-theme', value), theme);
    await seedSecurityPage(page, securityFixture(false, false, 0));

    const plate = page.locator('.security-page .settings-plate');
    await expect(plate.getByText('Not verified')).toBeVisible();
    await expect(plate.getByText('Verify your email above before changing this.')).toBeVisible();
    // Two steps to verify the email, three to change two-step, and every control named.
    const steps = await readRows(page, '.security-page .security-step');
    expect(steps).toHaveLength(5);
    expect(steps.map(row => row.columns)).toEqual([3, 3, 3, 3, 3]);
    expect(plate.locator('.security-step__number')).toHaveCount(5);
    await expect(plate.getByRole('button', { name: 'Send verification token', exact: true })).toBeVisible();
    await expect(plate.getByRole('button', { name: 'Verify email', exact: true })).toBeVisible();
    // The locked flow says so by being disabled, and the row that explains it is above the controls.
    await expect(plate.getByLabel(/current password/i)).toBeDisabled();
    await expect(plate.getByRole('button', { name: 'Enable two-step sign-in', exact: true })).toBeDisabled();

    // An empty device list is an answer, not a blank gap.
    await expect(plate.getByText('No device is signed in right now.')).toBeVisible();

    // The warning state has to be readable in both themes: the badge carries ink of its own.
    const warn = plate.locator('.badge--warn');
    const badge = await warn.evaluate(el => ({ fill: getComputedStyle(el).backgroundColor, ink: getComputedStyle(el).color }));
    expect(badge.fill, `warn badge fill ${badge.fill}`).not.toBe('rgba(0, 0, 0, 0)');
    expect(badge.ink, `warn badge ink ${badge.ink}`).not.toBe(badge.fill);

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1),
      'the verification steps do not spill on a phone').toBe(false);
  });
}
