import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { seedPassword, seedPasswordMissing } from './seed-password';

const LOADED = { timeout: 90_000 };

/** The measured paint is written out as well as asserted, so the report can quote real numbers. */
function record(path: string, values: Record<string, unknown>) {
  const existing = (() => {
    try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return {}; }
  })();
  writeFileSync(path, JSON.stringify(Object.assign(existing, values), null, 2));
}

/**
 * Defects that only a browser can see, because all of them are about resolved geometry and paint
 * rather than markup: a card chip painted with --surface-sunken, which read as a black hole punched in
 * the glass card; an actions column the greedy SKU column squeezed until its three controls stacked one
 * per line; a modal whose 60-character SKU title was an unshrinkable flex item, so it pushed the
 * dialog past its own width and wrapped the close button under the title; and a current navbar tab
 * filled with the saturated accent, which made it the brightest thing in an otherwise glass header.
 */
async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(seedPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Account' }), 'sign-in established no session')
    .toBeVisible(LOADED);
}

async function useTheme(page: Page, theme: 'light' | 'dark') {
  await page.getByRole('button', { name: `${theme === 'light' ? 'Light' : 'Dark'} theme` }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await page.waitForTimeout(300);
}

const rgb = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
const luminance = (c: number[]) => c.map(v => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}).reduce((sum, channel, i) => sum + channel * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
// How far apart two rendered colours actually are. Luminance alone calls a warm pink field on a
// cool grey row a match; a destructive button is told apart by its hue, so distance has to see it.
const apart = (a: number[], b: number[]) => Math.round(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));

/**
 * The rendered colour of spots inside an element, averaged from a real screenshot. Every surface
 * here is translucent glass over a moving page, so getComputedStyle cannot say what a control is
 * actually fighting - only the composited pixels can.
 */
async function swatches(page: Page, target: Locator, spots: Record<string, { x: number; y: number }>) {
  const shot = (await target.screenshot()).toString('base64');
  return page.evaluate(async ({ shot, spots }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${shot}`;
    await image.decode();
    const canvas = Object.assign(document.createElement('canvas'), { width: image.width, height: image.height });
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    const out: Record<string, number[]> = {};
    for (const [name, spot] of Object.entries(spots)) {
      const data = ctx.getImageData(Math.round(spot.x), Math.round(spot.y), 4, 4).data;
      const total = [0, 0, 0];
      for (let i = 0; i < data.length; i += 4) {
        total[0] += data[i]; total[1] += data[i + 1]; total[2] += data[i + 2];
      }
      out[name] = total.map(v => v / (data.length / 4));
    }
    return out;
  }, { shot, spots });
}

/** A spot in an element's padding, relative to the top-left of a container element. */
function spot(page: Page, container: string, target: string, insetX = 6) {
  return page.evaluate(({ container, target, insetX }) => {
    const box = document.querySelector(container)!.getBoundingClientRect();
    const inner = document.querySelector(target)!.getBoundingClientRect();
    return { x: inner.x - box.x + insetX, y: inner.y - box.y + inner.height / 2 - 2 };
  }, { container, target, insetX });
}

/**
 * The strongest pixel inside a thin strip, as measured against a reference colour. A control's edge is
 * one device pixel wide, so averaging a block over it would dilute exactly the cue being measured.
 */
async function strongest(page: Page, target: Locator, reference: number[], strips: Record<string, { x: number; y: number }>) {
  const shot = (await target.screenshot()).toString('base64');
  return page.evaluate(async ({ shot, reference, strips }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${shot}`;
    await image.decode();
    const canvas = Object.assign(document.createElement('canvas'), { width: image.width, height: image.height });
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    const distance = (r: number, g: number, b: number) => Math.hypot(r - reference[0], g - reference[1], b - reference[2]);
    const out: Record<string, { pixel: number[]; apart: number }> = {};
    for (const [name, strip] of Object.entries(strips)) {
      const data = ctx.getImageData(Math.round(strip.x), Math.round(strip.y), 6, 4).data;
      let best = { pixel: [0, 0, 0], apart: -1 };
      for (let i = 0; i < data.length; i += 4) {
        const d = distance(data[i], data[i + 1], data[i + 2]);
        if (d > best.apart) best = { pixel: [data[i], data[i + 1], data[i + 2]], apart: d };
      }
      out[name] = { pixel: best.pixel, apart: Math.round(best.apart) };
    }
    return out;
  }, { shot, reference, strips });
}

test.describe('actionable chips, one-line actions and self-contained dialogs', () => {
  test.skip(!seedPassword, seedPasswordMissing);

  test('a card chip is painted as the filter it applies, and applies it', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, 'customer@ninecube.demo');
    await page.goto('/products');
    await expect(page.locator('.product-card').first(), 'the catalogue never filled').toBeVisible(LOADED);

    for (const theme of ['dark', 'light'] as const) {
      await useTheme(page, theme);
      const painted = await page.locator('.product-card a.filter-chip').first().evaluate(el => {
        const style = getComputedStyle(el);
        const card = getComputedStyle(el.closest('.product-card') as Element);
        return {
          background: `${style.backgroundColor} | ${style.backgroundImage}`,
          cardBackground: `${card.backgroundColor} | ${card.backgroundImage}`,
          weight: style.fontWeight, cursor: style.cursor, border: style.borderColor
        };
      });
      expect(painted.weight, `${theme}: a chip should not read as a label`).toBe('650');
      expect(painted.cursor, `${theme}: a chip is a link`).toBe('pointer');
      expect(painted.background, `${theme}: the chip has no paint at all`).not.toBe('rgba(0, 0, 0, 0) | none');
      expect(painted.background, `${theme}: the chip is invisible against its own card`).not.toBe(painted.cardBackground);
      // The shared card edge is a translucent white; an actionable chip carries a solid accent edge.
      expect(painted.border, `${theme}: the chip has no edge of its own`).toMatch(/^rgb\(/);
    }

    // Hover fills the pill, so the pointer says what the colour already promised.
    await useTheme(page, 'dark');
    const chip = page.locator('.product-card a.filter-chip').first();
    const still = await chip.evaluate(el => getComputedStyle(el).backgroundImage);
    await chip.hover();
    const filled = await chip.evaluate(el => {
      const style = getComputedStyle(el);
      return { image: style.backgroundImage, color: style.color };
    });
    expect(filled.image, 'hover does not fill the chip').toContain('gradient');
    expect(filled.image !== still, 'hover leaves the chip untouched').toBe(true);
    expect(filled.color, 'hover leaves the ink unreadable on the fill').toBe('rgb(26, 17, 0)');

    // And it is a working shortcut rather than a decoration: the URL moves and the filter bar notices.
    await chip.click();
    await expect(page).toHaveURL(/[?&](category|tag)=/);
    await expect(page.getByRole('button', { name: /^Remove .+ filter$/ }).first(), 'the chip applied no filter')
      .toBeVisible(LOADED);
    // Wait for the filtered grid, or the screenshot captures the skeletons that replace it.
    await expect(page.locator('.product-card').first(), 'the filtered grid never filled').toBeVisible(LOADED);
    await page.screenshot({ path: 'artifacts/card-chips.png' });
  });

  test('the inventory actions stay on one line and the dialogs stay inside themselves', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, 'admin@ninecube.demo');
    await useTheme(page, 'dark');
    await page.goto('/inventory');
    await expect(page.locator('.table-surface tbody tr').first(), 'the product list never filled')
      .toBeVisible(LOADED);

    // The toolbar button acts on the search box, so it has to sit on that box rather than float up at
    // the height of the label above it.
    const toolbar = await page.evaluate(() => {
      const field = document.querySelector('#inventory-search')!.getBoundingClientRect();
      const button = document.querySelector('.row:has(> .field) > .btn')!;
      const box = button.getBoundingClientRect();
      return {
        label: button.textContent?.trim(),
        bottomGap: Math.round(field.bottom - box.bottom),
        sameLine: box.bottom > field.top && box.top < field.bottom
      };
    });
    expect(toolbar.label, 'which button is this check for?').toBe('New product');
    expect(toolbar.sameLine, 'the button is not beside the search box').toBe(true);
    expect(Math.abs(toolbar.bottomGap), `the button sits ${toolbar.bottomGap}px off the search box`).toBeLessThanOrEqual(2);

    const strip = await page.locator('.table-surface tbody tr td.actions').first().evaluate(el => {
      const centres = [...el.querySelectorAll('button, a')].map(node => {
        const rect = node.getBoundingClientRect();
        return rect.y + rect.height / 2;
      });
      return { controls: centres.length, stacked: Math.max(...centres) - Math.min(...centres) > 12 };
    });
    expect(strip.controls, 'the row lost an action').toBe(3);
    expect(strip.stacked, 'the actions wrapped into a stack again').toBe(false);
    // The column is wider now, so the page itself must still not scroll sideways with the table.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
      'the wider actions column pushed the page sideways').toBeLessThanOrEqual(0);
    await page.screenshot({ path: 'artifacts/inventory-actions.png' });

    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    const dialog = await page.locator('.modal').evaluate(el => {
      const box = el.getBoundingClientRect();
      const close = el.querySelector('.row-between > .btn')!.getBoundingClientRect();
      const upload = getComputedStyle(el.querySelector('input[type=file]')!);
      return {
        overflow: el.scrollWidth - el.clientWidth,
        closeInside: close.right <= box.right - parseFloat(getComputedStyle(el).paddingRight) + 1,
        closeBesideTitle: close.y - box.top < 60,
        // The generic field padding is 12px; the upload field narrows it so its own button fits.
        uploadPadding: upload.paddingInlineStart
      };
    });
    expect(dialog.overflow, 'the SKU title pushed the dialog past its own width').toBe(0);
    expect(dialog.closeInside, 'the close button is not at the right edge').toBe(true);
    expect(dialog.closeBesideTitle, 'the close button wrapped under the title').toBe(true);
    expect(dialog.uploadPadding, 'the upload field kept the generic field padding').toBe('4px');
    await page.screenshot({ path: 'artifacts/edit-dialog.png' });
    await page.keyboard.press('Escape');
  });

  test('the current navbar tab is filled as the selected one, and stays readable inside it', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page, 'admin@ninecube.demo');
    await page.goto('/products');
    await expect(page.locator('.navbar__link[aria-current="page"]'), 'no tab was marked current')
      .toBeVisible(LOADED);

    for (const theme of ['light', 'dark'] as const) {
      await useTheme(page, theme);
      const paint = await page.evaluate(() => {
        const style = (el: Element) => {
          const s = getComputedStyle(el);
          return { fill: s.backgroundColor, gradient: s.backgroundImage, edge: s.borderTopColor, ink: s.color };
        };
        const links = Array.from(document.querySelectorAll<HTMLElement>('.navbar__link'));
        const account = document.querySelector<HTMLElement>('.navbar__actions .nav-pop__trigger')!;
        return {
          tabs: links.length,
          current: style(links.find(l => l.hasAttribute('aria-current'))!),
          sibling: style(links.find(l => !l.hasAttribute('aria-current'))!),
          accountResting: style(account)
        };
      });
      expect(paint.tabs, 'the tray needs a neighbour to compare the current tab with').toBeGreaterThan(1);
      // The current tab carries the header's selected material and its neighbours do not.
      expect(paint.current.gradient, `${theme}: the current tab has no selected fill`).toMatch(/gradient/);
      expect(paint.sibling.gradient, `${theme}: an unselected tab is filled as if it were current`).toBe('none');
      expect(paint.current.ink, `${theme}: the selected ink did not come with the selected fill`)
        .not.toBe(paint.sibling.ink);

      // Measured on the composited pixels, because the whole header is translucent glass: the tab
      // has to read apart from the tray behind it, and its own text has to read on top of that.
      const tabSpot = await spot(page, '.navbar', '.navbar__link[aria-current="page"]', 30);
      const traySpot = await spot(page, '.navbar', '.navbar__link:not([aria-current])');
      const level = await swatches(page, page.locator('.navbar'), { pill: tabSpot, tray: traySpot });
      const apartBy = apart(level.pill, level.tray);
      const ratio = contrast(rgb(paint.current.ink), level.pill);
      record('artifacts/navbar-tab-level.json', {
        [theme]: {
          pill: level.pill.map(Math.round), tray: level.tray.map(Math.round), apartBy,
          ink: paint.current.ink, onPill: +ratio.toFixed(2)
        }
      });
      expect(apartBy, `${theme}: the selected tab is ${apartBy} away from the glass around it`).toBeGreaterThanOrEqual(40);
      expect(ratio, `${theme}: ${paint.current.ink} on the tab's own rgb(${level.pill.map(Math.round)}) is ${ratio.toFixed(2)}:1`)
        .toBeGreaterThanOrEqual(4.5);
    }

    await useTheme(page, 'dark');
    await page.locator('.navbar').screenshot({ path: 'artifacts/navbar-tab-level.png' });
  });

  test('every row action reads as a control on its own table', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, 'admin@ninecube.demo');

    for (const route of ['/inventory', '/admin'] as const) {
      await page.goto(route);
      await expect(page.locator('.table-surface tbody tr').first(), `${route} never filled`)
        .toBeVisible(LOADED);

      for (const theme of ['light', 'dark'] as const) {
        await useTheme(page, theme);
        const row = page.locator('.table-surface tbody tr').first();
        const geometry = await row.evaluate(el => {
          const box = el.getBoundingClientRect();
          const at = (node: Element, dx: number) => {
            const b = node.getBoundingClientRect();
            return { x: b.x - box.x + dx, y: b.y - box.y + b.height / 2 - 2 };
          };
          const controls = [...el.querySelectorAll<HTMLElement>('td.actions .btn, td.actions .link-button')];
          const spots: Record<string, { x: number; y: number }> = { surface: { x: box.width - 6, y: box.height / 2 - 2 } };
          const edges: Record<string, { x: number; y: number }> = {};
          controls.forEach((node, index) => {
            spots[`c${index}`] = at(node, 4);
            edges[`c${index}`] = at(node, -2);
          });
          return {
            spots,
            edges,
            controls: controls.map(node => {
              const style = getComputedStyle(node);
              return {
                label: node.textContent!.trim(),
                isButton: node.classList.contains('btn'),
                border: style.borderTopColor,
                ink: style.color
              };
            })
          };
        });
        expect(geometry.controls.length, `${route} ${theme}: the row lost an action`).toBeGreaterThan(0);
        const paint = await swatches(page, row, geometry.spots);
        const surface = paint.surface;
        const outline = await strongest(page, row, surface, geometry.edges);
        const plainInk = await row.evaluate(el => getComputedStyle(el.querySelector('td:nth-child(2)')!).color);
        const measured: Record<string, unknown> = {};

        geometry.controls.forEach((control, index) => {
          const behind = control.isButton ? paint[`c${index}`] : surface;
          const key = `${route} ${theme} ${control.label}`;
          if (control.isButton) {
            // A control has to be separable from the surface it sits on, and its ink from its own
            // field. The fill used to be the table's own glass, which is why these read as text.
            // Separation may come from either half of the control: a primary or destructive action
            // carries a field of its own, a neutral secondary one is drawn by its outline. What is not
            // allowed is a control that is neither - that is the bug this test was written for.
            const fillApart = apart(behind, surface);
            const edge = outline[`c${index}`];
            measured[key] = {
              fill: behind.map(Math.round), surface: surface.map(Math.round), fillApart,
              edge: edge.pixel.map(Math.round), edgeApart: edge.apart, ink: control.ink
            };
            expect(Math.max(fillApart, edge.apart),
              `${key}: neither its rgb(${behind.map(Math.round)}) field (=${fillApart}) nor its rgb(${edge.pixel.map(Math.round)}) edge (=${edge.apart}) separates it from the row's rgb(${surface.map(Math.round)})`)
              .toBeGreaterThanOrEqual(25);
          } else {
            measured[key] = { ink: control.ink, plainInk };
            // A bare row link is an action, so it must not wear the row's own text colour.
            expect(control.ink, `${key}: the action is inked exactly like the row's plain text`)
              .not.toBe(plainInk);
          }
          const legible = contrast(rgb(control.ink), behind);
          expect(legible, `${key}: ${control.ink} on rgb(${behind.map(Math.round)}) is ${legible.toFixed(2)}:1`)
            .toBeGreaterThanOrEqual(4.5);
        });
        record('artifacts/row-actions-level.json', measured);
      }
    }

    await useTheme(page, 'dark');
    await page.goto('/inventory');
    await expect(page.locator('.table-surface tbody tr').first()).toBeVisible(LOADED);
    await page.screenshot({ path: 'artifacts/row-actions.png' });
    await page.goto('/admin');
    await expect(page.locator('.table-surface tbody tr').first()).toBeVisible(LOADED);
    await page.screenshot({ path: 'artifacts/row-actions-admin.png' });
  });

  test('History opens the same dialog on the ledger, not on the empty form', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, 'admin@ninecube.demo');
    await useTheme(page, 'dark');
    await page.goto('/inventory');
    await expect(page.locator('.table-surface tbody tr').first(), 'the product list never filled')
      .toBeVisible(LOADED);

    await page.getByRole('button', { name: 'Adjust stock' }).first().click();
    await expect(page.locator('#movement-history')).toBeVisible(LOADED);
    expect(await page.evaluate(() => document.activeElement?.id ?? ''),
      'Adjust stock jumped to the ledger').not.toBe('movement-history');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'History' }).first().click();
    await expect(page.locator('#movement-history')).toBeVisible(LOADED);
    expect(await page.evaluate(() => document.activeElement?.id ?? ''),
      'History landed on the adjustment form instead of the ledger').toBe('movement-history');
    expect(await page.locator('.modal').evaluate(el => el.scrollWidth - el.clientWidth),
      'the ledger title overflowed the dialog').toBe(0);
    await page.screenshot({ path: 'artifacts/history-dialog.png' });
  });
});
