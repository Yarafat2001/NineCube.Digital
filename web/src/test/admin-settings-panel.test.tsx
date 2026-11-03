import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, screen, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { API, adminUser, resetCommerceFixtures, seedDiscountPolicy, setDemoSessionEmail } from './handlers';
import { server } from './server';
import { renderApp, seedSession } from './utils';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(root, 'src', 'styles', file), 'utf8');
const app = read('app.css');
const responsive = read('responsive.css');

function block(css: string, selector: string): string {
  const lines = css.split('\n');
  const at = lines.findIndex(line => line.startsWith(`${selector} {`));
  if (at < 0) throw new Error(`no rule for "${selector}"`);
  const from = lines.slice(at).join('\n');
  let depth = 0;
  for (let index = from.indexOf('{'); index < from.length; index++) {
    if (from[index] === '{') depth++;
    if (from[index] === '}' && --depth === 0) return from.slice(from.indexOf('{'), index + 1);
  }
  throw new Error(`unbalanced braces in "${selector}"`);
}

async function openSettings() {
  const user = seedSession('Administrator', { email: adminUser.email });
  server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(user)));
  setDemoSessionEmail(adminUser.email);
  renderApp('/admin');
  await screen.findByRole('heading', { name: /administration/i });
  fireEvent.click(await screen.findByRole('tab', { name: /settings/i }));
  return screen.findByText('Discount policy');
}

beforeEach(() => resetCommerceFixtures());

describe('Admin settings sit on one plate', () => {
  it('puts both dials on the solid registry plate instead of two glass cards of different widths', async () => {
    await openSettings();

    const plate = await screen.findByRole('tabpanel', { name: /settings/i });
    const surface = plate.querySelector('.table-surface.settings-plate');
    expect(surface).not.toBeNull();

    const forms = [...plate.querySelectorAll('form')];
    expect(forms).toHaveLength(2);
    forms.forEach(form => {
      expect(form.closest('.table-surface')).toBe(surface);
      // The 480px and 760px inline caps are what left 928px of page beside the threshold card.
      expect(form.getAttribute('style')).toBeNull();
      expect(form.className).not.toContain('card-glass');
    });
  });

  it('lays every dial out as one row, so a fourth limit cannot strand alone', () => {
    const row = block(app, '.setting-row');
    expect(row).toContain('grid-template-columns: minmax(0, 1fr) minmax(190px, 250px)');
    // auto-fit put four limits into three columns and left a hole under the fourth.
    expect(app).not.toContain('.policy-grid');
    expect(app).not.toContain('.policy-card { max-width');

    const stacked = responsive.split('\n').find(line => line.includes('.setting-row { grid-template-columns: minmax(0, 1fr); }'));
    expect(stacked).toBeDefined();
  });

  it('divides the two blocks with the house row line', () => {
    expect(block(app, '.settings-block + .settings-block')).toContain('border-top: 1px solid var(--row-line)');
    expect(block(app, '.policy-rows .setting-row')).toContain('border-bottom: 1px solid var(--row-line)');
  });

  it('shows an unset dial as empty with a state, not as a wall of zeros', async () => {
    await openSettings();

    const rate = await screen.findByLabelText(/highest discount rate/i);
    // A dial the shop never set reads as an empty field with a placeholder, not as a literal 0.
    expect((rate as HTMLInputElement).value).toBe('');
    expect(rate).toHaveAttribute('placeholder', 'None');

    // The row keeps the name and what it refuses beside each other, not stacked under a 229px field.
    const row = rate.closest('.setting-row') as HTMLElement;
    expect(within(row).getByRole('spinbutton')).toBe(rate);
    expect(row.querySelector('.field .hint')).not.toBeNull();
  });

  it('speaks the registries’ state vocabulary on the policy chip', async () => {
    await openSettings();

    const chip = await screen.findByText('No limits yet');
    // The panels use ⊘ for "off" and ✓ for "on"; the em dash was its own invention.
    expect(chip.querySelector('.badge__glyph')?.textContent).toBe('⊘');
    expect(chip.className).toContain('badge--neutral');
  });

  it('switches the chip to the on state once the shop has written a limit', async () => {
    seedDiscountPolicy({ maxPercentageOff: 30 });
    await openSettings();

    const on = await screen.findByText('Limits on');
    expect(on.querySelector('.badge__glyph')?.textContent).toBe('✓');
    expect(on.className).toContain('badge--ok');
    expect(screen.getByLabelText(/highest discount rate/i)).toHaveValue(30);
  });
});
