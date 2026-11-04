import { expect, test, type Page } from '@playwright/test';
import type { Address, Profile } from '../src/api/types';

/**
 * The saved address book on the customer profile, measured from what the browser resolved rather
 * than what the stylesheet intended. The complaint was that the form made the page huge and the
 * saved addresses gave no sign of being usable, so this asks the live DOM four things: is the editor
 * absent until it is asked for, does a saved address resolve to the app's well material, does the
 * tile answer the pointer and the keyboard, and how many columns does the editor really lay out at
 * a laptop and a phone width.
 *
 * The API is stubbed, so this needs no demo password - only a running SPA:
 *
 *   npm run dev -- --port 5173
 *   E2E_BASE_URL=http://127.0.0.1:5173 npm run e2e address-book
 */
const USER = { id: 501, email: 'address-book@example.test', role: 'Customer', customerId: 501 };
const ADDRESS = (over: Partial<Address>): Address => ({
  id: 1, label: 'Home', recipientName: 'Rihan Ahmed', phone: '+8801575179191', countryCode: 'BD',
  division: 'Chattagram', district: 'Noakhali', upazila: 'Chatkhil', addressLine: 'Sompara, Chatkhail',
  addressLine2: '', company: '', landmark: '', postalCode: '3882', deliveryInstructions: '',
  isDefault: true, ...over
} as Address);

async function seedBook(page: Page, addresses: Address[]) {
  const profile: Profile = { ...USER, role: 'Customer', name: 'Rihan Ahmed', phone: '+8801575179191',
    createdAt: '2026-01-01T00:00:00Z', addresses };
  await page.addInitScript(session => sessionStorage.setItem('ninecube.auth.session', JSON.stringify(session)), {
    user: USER, accessToken: 'address-book-only', expiresAtUtc: '2099-01-01T00:00:00Z'
  });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/api/')) return route.continue();
    if (path === '/api/auth/me') return route.fulfill({ json: USER });
    if (path === '/api/me') return route.fulfill({ json: profile });
    if (path === '/api/me/addresses') return route.fulfill({ json: addresses });
    if (path === '/api/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    return route.fulfill({ json: [] });
  });
  await page.goto('./#/account/profile');
  await expect(page.locator('.delivery-address-book')).toBeVisible();
}

/** A design token as the browser would paint it: #E8EDF5 -> rgb(232, 237, 245). */
async function paint(page: Page, token: string): Promise<string> {
  return page.evaluate(value => {
    const probe = document.createElement('span');
    probe.style.color = value;
    document.body.append(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved;
  }, token);
}

async function token(page: Page, name: string): Promise<string> {
  return page.evaluate(value => getComputedStyle(document.documentElement).getPropertyValue(value).trim(), name);
}

type Tile = { label: string; default: boolean; border: string; fill: string; radius: string;
  transform: string; button: string; flagged: boolean; inline: string | null };

/** One saved address as the browser paints it, plus whether the pointer or the keyboard is on it. */
const readTile = (index: number) => (page: Page): Promise<Tile> => page.evaluate(tileIndex => {
  const card = document.querySelectorAll<HTMLElement>('.address-card')[tileIndex];
  const style = getComputedStyle(card);
  const button = card.querySelector<HTMLButtonElement>('button')!;
  return {
    label: card.querySelector('strong')!.textContent!.trim().slice(0, 5),
    default: card.dataset.default === 'true',
    border: style.borderTopColor,
    fill: style.backgroundColor,
    radius: style.borderRadius,
    transform: style.transform,
    button: getComputedStyle(button).backgroundColor,
    flagged: card.matches(':hover') || card.matches(':focus-within'),
    inline: card.getAttribute('style')
  };
}, index);

const quiet = 'rgba(0, 0, 0, 0)';

type Field = { caption: string; captionTop: number; controlTop: number; controlHeight: number; gap: number };
type AddressType = Field & { options: number[]; slack: number };

/**
 * The three fields the editor opens with, as the browser placed them. The address type shares this
 * row with a select and a text input, so it has to carry the same caption in the same place and
 * resolve to the same control height - without it the track sat 28px above its neighbours and read
 * as a stray text box. `slack` is what the track still has left over once its own padding, border
 * and gaps are paid for, so it measures the empty well rather than the width the control happens to
 * have been given.
 */
const rowOne = (page: Page): Promise<{ country: Field; addressType: AddressType; label: Field }> =>
  page.evaluate(() => {
    const fields = [...document.querySelectorAll<HTMLElement>('.delivery-address-fields > .field')];
    const read = (field: HTMLElement): Field => {
      const caption = field.querySelector<HTMLElement>('.field label, .field .field__label-row')!;
      const control = field.querySelector<HTMLElement>('select, input, .segmented')!;
      const cap = caption.getBoundingClientRect();
      const ctl = control.getBoundingClientRect();
      // The gap is read unrounded: the row lands on a quarter pixel, and rounding each edge on its
      // own would report a 1px difference where the browser laid the two fields out identically.
      return {
        caption: caption.textContent?.trim() ?? '',
        captionTop: Math.round(cap.top),
        controlTop: Math.round(ctl.top),
        controlHeight: Math.round(ctl.height),
        gap: Math.round((ctl.top - cap.bottom) * 100) / 100
      };
    };
    const type = read(fields[1]);
    const track = fields[1].querySelector<HTMLElement>('.segmented')!;
    const style = getComputedStyle(track);
    const options = [...track.querySelectorAll<HTMLElement>('.segmented__option')].map(option => option.getBoundingClientRect().width);
    const inner = track.getBoundingClientRect().width
      - Number.parseFloat(style.borderLeftWidth) - Number.parseFloat(style.borderRightWidth)
      - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
    const gap = Number.parseFloat(style.columnGap) || 0;
    return {
      country: read(fields[0]),
      label: read(fields[2]),
      addressType: { ...type, options: options.map(width => Math.round(width)), slack: Math.round(inner - options.reduce((sum, width) => sum + width, 0) - gap * (options.length - 1)) }
    };
  });

for (const theme of ['light', 'dark'] as const) {
  test(`the saved address book reads as wells and opens on demand (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(value => localStorage.setItem('ninecube-theme', value), theme);
    await seedBook(page, [ADDRESS({}), ADDRESS({ id: 2, label: 'Work', isDefault: false })]);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

    const book = page.locator('.delivery-address-book');
    const well = await paint(page, await token(page, '--well-fill'));
    const edge = await paint(page, await token(page, '--edge-well'));
    const accent = await paint(page, await token(page, '--accent'));
    const radius = await token(page, '--radius-md');

    // Resting state: a list of addresses, not a list plus a fifteen-control form.
    await expect(book.locator('form')).toHaveCount(0);
    await expect(book.locator('.address-card')).toHaveCount(2);
    const addAddress = book.getByRole('button', { name: 'Add an address', exact: true });
    await expect(addAddress).toBeVisible();
    const resting = await book.evaluate(el => Math.round(el.getBoundingClientRect().height));
    expect(resting, `the resting book measured ${resting}px tall`).toBeLessThan(700);

    // Every saved address is cut out of the plate in the app's well material; the default keeps the
    // accent edge app.css gives it, and nothing here is painted by hand.
    for (const index of [0, 1]) {
      const tile = await readTile(index)(page);
      expect(tile.inline, `${tile.label} carries an inline style`).toBeNull();
      expect(tile.fill, `${tile.label} fill`).toBe(well);
      expect(tile.radius, `${tile.label} radius`).toBe(radius);
      expect(tile.border, `${tile.label} edge`).toBe(tile.default ? accent : edge);
      expect(tile.transform, `${tile.label} rests flat`).toBe('none');
      expect(tile.button, `${tile.label} operations start quiet`).toBe(quiet);
    }

    // The tile answers the pointer, and the keyboard gets to the same state. The edge and the lift
    // are transitioned, so the reading waits for them to settle instead of catching a frame in the
    // middle of the move.
    const work = page.locator('.address-card').nth(1);
    await work.evaluate(el => el.scrollIntoView({ block: 'center' }));
    const box = await work.boundingBox();
    const answered = async () => { const tile = await readTile(1)(page);
      return tile.flagged && tile.border === accent && tile.transform.includes('-2') && tile.button !== quiet; };
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height - 14);
    await expect.poll(answered, 'the tile, its edge and its operations all answer the pointer').toBe(true);
    const hovered = await readTile(1)(page);
    expect(hovered.border, `hovered edge ${hovered.border}`).toBe(accent);
    expect(hovered.transform, `hovered lift ${hovered.transform}`).toContain('-2');
    expect(hovered.button, 'its operations come forward with the tile').not.toBe(quiet);

    await work.locator('button').first().focus();
    await page.mouse.move(4, 4);
    await expect.poll(answered, 'the keyboard reaches the same state').toBe(true);
    const focused = await readTile(1)(page);
    expect(focused.border, `focused edge ${focused.border}`).toBe(accent);
    expect(focused.button, 'focused operations come forward too').not.toBe(quiet);

    // Opening the editor is the only thing that puts fields on the page.
    await addAddress.click();
    const form = book.locator('form');
    await expect(form).toHaveCount(1);
    await expect(form.getByLabel('Address line', { exact: true })).toBeVisible();
    await expect(form.getByLabel('Label', { exact: true })).toBeVisible();

    expect(await form.locator('.delivery-address-fields').evaluate(el =>
      getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length),
      'a laptop lays the fields out in three columns').toBe(3);

    // Row 1: a caption over every control, and all three controls on the same line at the same height.
    const laptop = await rowOne(page);
    expect(laptop.addressType.caption, 'the address type is named the way the fields beside it are').toBe('Address type');
    expect(laptop.addressType.captionTop, 'its caption sits where the other captions sit').toBe(laptop.country.captionTop);
    expect(Math.abs(laptop.addressType.controlTop - laptop.country.controlTop),
      `the track resolved at top ${laptop.addressType.controlTop}, the select at ${laptop.country.controlTop}`).toBeLessThanOrEqual(1);
    expect(Math.abs(laptop.addressType.controlTop - laptop.label.controlTop),
      'and the third field on the row is on the same line').toBeLessThanOrEqual(1);
    expect(laptop.addressType.controlHeight, 'the track is as tall as the input beside it').toBe(laptop.country.controlHeight);
    expect(laptop.addressType.gap, 'the caption clears the control by the same margin').toBe(laptop.country.gap);
    // Three options that fill the well instead of hugging its left edge.
    expect(laptop.addressType.options).toHaveLength(3);
    expect(Math.max(...laptop.addressType.options) - Math.min(...laptop.addressType.options),
      `options of ${laptop.addressType.options.join('/')}px are the same width`).toBeLessThanOrEqual(1);
    expect(Math.abs(laptop.addressType.slack),
      `the track leaves ${laptop.addressType.slack}px of empty well beside its options`).toBeLessThanOrEqual(1);

    // The address type is the app's segmented control, not a row of loose chips. A new address has
    // no type yet, so choosing one is what lights the option up.
    await form.locator('.segmented.address-type').getByRole('button', { name: 'Home', exact: true }).click();
    const segmented = await form.locator('.segmented.address-type').evaluate(el => ({
      options: el.querySelectorAll('.segmented__option').length,
      pressed: [...el.querySelectorAll('.segmented__option')].map(option => option.getAttribute('aria-pressed')),
      radius: getComputedStyle(el.querySelector('.segmented__option--active')!).borderRadius
    }));
    expect(segmented.options).toBe(3);
    expect(segmented.pressed.filter(value => value === 'true')).toHaveLength(1);
    expect(segmented.radius, 'the active option is the house pill').toBe(await token(page, '--radius-pill'));
    await expect(form.getByLabel('Label', { exact: true })).toHaveValue('Home');

    // The live preview stands beside the fields instead of adding another block under them.
    await form.getByLabel('Address line', { exact: true }).fill('Kamal Tower, Road 2');
    const preview = form.locator('.delivery-address-preview');
    await expect(preview).toBeVisible();
    const rail = await preview.evaluate(el => {
      const style = getComputedStyle(el);
      const fields = document.querySelector('.delivery-address-fields')!.getBoundingClientRect();
      return { beside: el.getBoundingClientRect().left >= fields.right - 1, radius: style.borderRadius, fill: style.backgroundColor };
    });
    expect(rail.beside, 'the preview rail sits beside the fields at 1440').toBe(true);
    expect(rail.radius, 'the preview uses the house radius').toBe(radius);
    expect(rail.fill, 'the preview is the same well material as the tiles').toBe(well);

    // A phone keeps the material and does not spill sideways.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(book).toBeVisible();
    const phone = await page.evaluate(() => ({
      columns: getComputedStyle(document.querySelector('.delivery-address-fields')!).gridTemplateColumns.split(' ').filter(Boolean).length,
      spills: document.documentElement.scrollWidth > window.innerWidth + 1
    }));
    expect(phone.columns, 'a phone gets two columns of fields').toBe(2);
    expect(phone.spills, 'the book does not scroll sideways on a phone').toBe(false);

    // The same row-1 contract on a phone. Every wide field takes the whole line here, so the check is
    // that the control sits the same way under its own caption, at the same height as the input.
    const phoneRow = await rowOne(page);
    expect(phoneRow.addressType.caption).toBe('Address type');
    expect(phoneRow.addressType.gap,
      `at 390 the caption cleared the track by ${phoneRow.addressType.gap}px, the select by ${phoneRow.country.gap}px`)
      .toBe(phoneRow.country.gap);
    expect(phoneRow.addressType.controlHeight, 'and still matches the select height').toBe(phoneRow.country.controlHeight);
    expect(Math.abs(phoneRow.addressType.slack),
      `the phone track leaves ${phoneRow.addressType.slack}px of empty well`).toBeLessThanOrEqual(1);
  });

  test(`an empty book opens the editor straight away (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(value => localStorage.setItem('ninecube-theme', value), theme);
    await seedBook(page, []);
    const book = page.locator('.delivery-address-book');
    await expect(book.getByText(/no addresses saved yet/i)).toBeVisible();
    await expect(book.locator('form')).toHaveCount(1);
    await expect(book.getByRole('button', { name: 'Add an address', exact: true })).toHaveCount(0);
    await expect(book.getByLabel('Address line', { exact: true })).toBeVisible();
  });
}
