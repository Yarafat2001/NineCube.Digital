import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { API } from './handlers';
import { server } from './server';
import { renderApp, seedSession, usersByRole } from './utils';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(root, 'src', 'styles', file), 'utf8');
const app = read('app.css');
const tokens = read('tokens.css');

/** The declarations a browser resolves into paint and geometry; the pixel result is e2e's job. */
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

async function openCouponsTab() {
  seedSession('Administrator');
  server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(usersByRole.Administrator)));
  renderApp('/admin');
  await screen.findByRole('heading', { name: /administration/i });
  fireEvent.click(await screen.findByRole('tab', { name: /coupons/i }));
}

describe('Condensed coupon workflow', () => {
  it('switches a folded step off, because the author flex rule outranks the browser default', () => {
    // .discount-card-body sets display:flex, which beats UA [hidden] { display:none }.
    expect(block(app, '.discount-card-body')).toContain('display: flex');
    expect(app).toContain('.discount-card-body[hidden] { display: none; }');
  });

  it('keeps a one-line step header from pushing the card open', () => {
    const toggle = block(app, '.discount-card-toggle');
    expect(toggle).toContain('flex: 1');
    expect(toggle).toContain('min-width: 0');
    for (const selector of ['.discount-card-name', '.discount-card-summary']) {
      const row = block(app, selector);
      expect(row).toContain('min-width: 0');
      expect(row).toContain('text-overflow: ellipsis');
      expect(row).toContain('white-space: nowrap');
    }
  });

  it('runs the presets along one scrolling row instead of a tier above the builder', () => {
    const rail = block(app, '.coupon-templates__rail');
    expect(rail).toContain('display: flex');
    expect(rail).toContain('overflow-x: auto');
    // A fixed card width is what stops the row from collapsing to text height.
    expect(block(app, '.coupon-template')).toContain('flex: 0 0 232px');
  });

  it('travels the registry controls down the list and lets go on a phone', () => {
    const bar = block(app, '.registry-bar');
    expect(bar).toContain('position: sticky');
    expect(bar).toContain('top: var(--sticky-top)');
    expect(bar).toContain('z-index: var(--z-sticky)');
    expect(tokens).toContain('--sticky-top: calc(var(--nav-h) + 16px)');
    expect(Number(tokens.match(/--z-sticky: (\d+)/)![1]), 'the bar would sit over the navbar')
      .toBeLessThan(Number(tokens.match(/--z-nav: (\d+)/)![1]));
    // A sticky bar eats most of a short viewport before the list appears.
    expect(app).toContain('.registry-bar { position: static; top: auto; }');
  });

  it('gives the builder column a track that can shrink below its content', () => {
    // A bare 1fr floors at min-content, which measured 122px of page overflow at 390.
    expect(app).toContain('.discount-builder-layout { grid-template-columns: minmax(0, 1fr); }');
  });

  it('raises the light glass edge to the same line as the solid shells, and leaves dark alone', () => {
    const light = tokens.slice(tokens.indexOf(':root, :root[data-theme="light"] {'), tokens.indexOf(':root[data-theme="dark"], .navbar--showcase {'));
    // --nav-glass-edge paints the border of every card, tray, table and panel on every route.
    expect(light).toContain('--nav-glass-edge: #77859A;');
    expect(tokens).toContain('--edge-shell: #77859A');
    expect(tokens).toContain('--nav-glass-edge: rgba(216,229,250,.46);');
  });

  it('ships the optional steps folded, each stating its value on the closed row', async () => {
    await openCouponsTab();

    const step4 = await screen.findByTestId('discount-step-4');
    expect(step4.querySelector('.discount-card-body')).toHaveAttribute('hidden');
    expect(step4.querySelector('.discount-card-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect(step4.querySelector('.discount-card-summary')?.textContent).toBe('No minimum · Unlimited');

    fireEvent.click(step4.querySelector('.discount-card-toggle')!);
    expect(step4.querySelector('.discount-card-body')).not.toHaveAttribute('hidden');
    expect(step4.querySelector('.discount-card-summary')).toBeNull();
    expect(screen.getByLabelText(/minimum order amount/i)).toBeEnabled();
  });

  it('keeps the three steps an operator must check open by default', async () => {
    await openCouponsTab();
    for (const step of [1, 2, 3]) {
      const card = await screen.findByTestId(`discount-step-${step}`);
      expect(card.querySelector('.discount-card-body'), `step ${step} starts folded`)
        .not.toHaveAttribute('hidden');
    }
    const registry = document.querySelector('.registry-bar');
    expect(registry).not.toBeNull();
    // The heading and the search share one bar so the sticky control cannot split in two.
    expect(registry!.querySelector('.registry-bar__head')).not.toBeNull();
    expect(registry!.querySelector('.registry-filterbar')).not.toBeNull();
  });
});
