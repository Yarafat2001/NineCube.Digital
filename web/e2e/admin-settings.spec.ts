import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { seedPassword, seedPasswordMissing } from './seed-password';

/**
 * The Settings tab of the administration screen over the real stack: the stock threshold and the
 * discount policy are two blocks of dials an operator reads every day, so what matters is what the
 * grid resolved to on screen - how wide the plate is, how many columns each row put its dial in, and
 * whether a fourth limit can strand on its own line. The CSS contract lives in
 * `src/test/admin-settings-panel.test.tsx`; this spec is the picture.
 *
 *   E2E_BASE_URL=http://127.0.0.1:5173 NINECUBE_SEED_PASSWORD='<demo password>' npm run e2e admin-settings
 */
const API = process.env.E2E_API_BASE ?? 'http://127.0.0.1:5080';
const LOADED = { timeout: 90_000 };

async function openSettings(page: Page, request: APIRequestContext, theme: 'light' | 'dark') {
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
  await page.getByRole('tab', { name: /settings/i }).click();
  const plate = page.locator('.settings-plate');
  await expect(plate).toBeVisible(LOADED);
  // The policy form only mounts once the shop's own numbers have arrived.
  await expect(plate.locator('.policy-card')).toBeVisible(LOADED);
  return plate;
}

/** Every box the browser resolved, so a rule that lost the cascade cannot pass unnoticed. */
function geometry(el: Element) {
  const cs = getComputedStyle(el as HTMLElement);
  const box = el.getBoundingClientRect();
  return {
    width: Math.round(box.width),
    height: Math.round(box.height),
    left: Math.round(box.left),
    top: Math.round(box.top),
    right: Math.round(box.right),
    bottom: Math.round(box.bottom),
    columns: cs.gridTemplateColumns,
    background: cs.backgroundColor,
    classes: el.className
  };
}

test.describe('admin settings on one plate', () => {
  test.skip(!seedPassword, seedPasswordMissing);
  mkdirSync('artifacts/scope', { recursive: true });

  for (const width of [1440, 390]) {
    for (const theme of ['light', 'dark'] as const) {
      test(`${width} ${theme}: both dials share the plate and no field strands`, async ({ page, request }) => {
        const plate = await openSettings(page, request, theme);
        await page.setViewportSize({ width, height: 1000 });
        await plate.evaluate(el => el.scrollIntoView({ block: 'start' }));

        // One solid registry plate, full width of the column, holding both forms.
        const shell = await plate.evaluate(geometry);
        const column = await plate.evaluate(el => geometry(el.parentElement!));
        expect(shell.width, 'the plate does not fill the content column it was given')
          .toBeGreaterThanOrEqual(column.width - 4);
        expect(shell.background, 'the plate is translucent, so the page behind it shows through')
          .not.toMatch(/rgba\(/);

        const blocks = plate.locator('.settings-block');
        expect(await blocks.count(), 'the two dials are not on the one plate').toBe(2);
        for (const block of await blocks.all()) {
          const box = await block.evaluate(geometry);
          expect(box.width, `a settings block shrank itself to ${box.width}px inside a ${shell.width}px plate`)
            .toBeGreaterThanOrEqual(shell.width - 4);
          expect(box.classes, 'a glass card was left inside the plate').not.toContain('card-glass');
        }

        // Each dial is a row: the name on one side, the control on the other while there is room,
        // and the control under the name on a phone. Either way the pair must never be split.
        const rows = plate.locator('.setting-row');
        const count = await rows.count();
        expect(count).toBeGreaterThanOrEqual(5);
        const columns = await rows.first().evaluate(el => getComputedStyle(el).gridTemplateColumns);
        const tracks = columns.split(' ').filter(Boolean).length;
        expect(tracks, `${width}px resolved the dial row to ${tracks} columns: "${columns}"`)
          .toBe(width <= 768 ? 1 : 2);

        for (const row of await rows.all()) {
          const [box, label, control, wrapper] = await Promise.all([
            row.evaluate(el => el.getBoundingClientRect()),
            row.locator('.field label').evaluate(el => el.getBoundingClientRect()),
            row.locator('input').evaluate(el => el.getBoundingClientRect()),
            row.evaluate(el => el.lastElementChild!.getBoundingClientRect())
          ]);
          const sameLine = control.top < label.bottom && label.top < control.bottom;
          if (width <= 768) {
            expect(sameLine, 'on a phone the dial should drop below its name, not sit beside it').toBe(false);
            expect(Math.round(control.width), 'the dial stayed at its laptop width on a phone')
              .toBeGreaterThanOrEqual(150);
          } else {
            expect(sameLine, 'a dial was pushed onto a line of its own over empty space').toBe(true);
            expect(control.left, 'the dial is not beside its name').toBeGreaterThanOrEqual(Math.round(label.right));
            // The control column reaches the end of the row; the old auto-fit grid left 482px of hole.
            expect(Math.round(box.right) - Math.round(wrapper.right), 'the dial column is not flush with its row')
              .toBeLessThan(4);
          }
        }

        // The state chip speaks the same vocabulary as the registries above it.
        const chip = plate.locator('.policy-card__head .badge');
        const glyph = await chip.locator('.badge__glyph').innerText();
        expect(['✓', '⊘'], `the policy chip invented "${glyph}" instead of the house states`).toContain(glyph);
        expect(await chip.getAttribute('class'), 'the chip is not on a house tone')
          .toMatch(/badge--(ok|neutral)/);
        const chipInk = await chip.evaluate(el => {
          const cs = getComputedStyle(el);
          return { border: cs.borderTopWidth, radius: cs.borderRadius };
        });
        expect(Number(chipInk.border.replace('px', '')), 'the chip has no edge').toBeGreaterThan(0);
        expect(chipInk.radius).not.toBe('0px');

        await page.screenshot({ path: `artifacts/scope/settings-${width}-${theme}-plate.png`, fullPage: true });
      });
    }
  }
});
