import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, screen, within } from '@testing-library/react';
import { resetCommerceFixtures } from './handlers';
import { renderApp, seedSession } from './utils';
import { formatMoney } from '../lib/helpers';
import { beforeEach, describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readStyle = (file: string) => readFileSync(join(root, 'src', 'styles', file), 'utf8');
const readSource = (file: string) => readFileSync(join(root, 'src', file), 'utf8');

const app = readStyle('app.css');
const modern = readStyle('modern.css');
const tokens = readStyle('tokens.css');
const responsive = readStyle('responsive.css');
const page = readSource('pages/GiftCardsPage.tsx');
const admin = readSource('pages/AdminPage.tsx');
const certificate = readSource('components/GiftCardCertificate.tsx');

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

/** Anything in the colour emoji ranges, which is how a glyph becomes an icon on this screen. */
const COLOUR_EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F3FB}-\u{1F3FF}]/u;

beforeEach(() => resetCommerceFixtures());

describe('Gift cards page is built from the house system', () => {
  it('carries no inline styles on the customer screen', () => {
    // 26 inline-styled elements on the balance tab and 47 once a card was verified is what made
    // this page drift from every other page in the shop.
    expect(page).not.toMatch(/style=\{/);
    expect(admin.match(/className=\{?"gift-card-cert/g) ?? []).toHaveLength(0);
  });

  it('has no colour emoji standing in for an icon, and every icon it names exists', () => {
    expect(page).not.toMatch(COLOUR_EMOJI);
    expect(certificate).not.toMatch(COLOUR_EMOJI);
    const registry = readSource('components/Icon.tsx');
    for (const name of [...page.matchAll(/<Icon name="([a-z0-9-]+)"/g)].map(m => m[1])) {
      expect(registry, `Icon "${name}" is not in the registry`).toMatch(new RegExp(`^  ${name}:`, 'm'));
    }
  });

  it('renders the certificate once, from one component, at all four call sites', () => {
    expect(certificate).toContain('className="gift-card-cert"');
    expect(page.match(/<GiftCardCertificate/g) ?? []).toHaveLength(2);
    expect(admin.match(/<GiftCardCertificate/g) ?? []).toHaveLength(2);
  });

  it('paints the certificate only from --cert-* tokens, with a solid ground under the gradient', () => {
    const cert = block(app, '.gift-card-cert');
    expect(cert).toContain('background-color: var(--cert-base)');
    expect(cert).toContain('background-image: var(--cert-bg)');
    expect(cert).toContain('color: var(--cert-ink)');
    expect(cert).toContain('border-radius: var(--radius-md)');
    expect(cert).toContain('box-shadow: var(--cert-shadow)');
    expect(cert).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(cert).not.toMatch(/rgba?\(/);
    // The copy used to raise the card with a 48px black smear; that read as a hole in a light plate.
    expect(tokens).toMatch(/--cert-shadow: 0 10px 22px -14px/);
    expect(tokens).not.toMatch(/--cert-shadow:[^;]*48px/);
  });

  it('keeps the button inside the certificate legible without inheriting the page plate', () => {
    const onCert = block(modern, '.btn--on-cert');
    expect(onCert).toContain('border-color: var(--cert-rule)');
    expect(onCert).toContain('color: var(--cert-ink)');
    // The default button paint is more specific than .btn--on-cert, so it has to opt out by name.
    expect(modern).toContain(':not(.btn--on-cert)');
  });

  it('sits the whole screen on one divided plate instead of stacked glass cards', () => {
    expect(page).toContain('className="table-surface gift-plate"');
    expect(page).not.toContain('card-glass');
    expect(block(app, '.gift-block + .gift-block')).toContain('border-top: 1px solid var(--row-line)');
    expect(block(app, '.gift-demo')).toContain('background: var(--well-fill)');
  });

  it('switches tabs with the shared segmented control, not two loose pills', () => {
    expect(page).toContain('className="segmented"');
    expect(page).toContain('segmented__option--active');
    expect(page).not.toMatch(/role="tablist"/);
  });

  it('gives the code field the same type size as the form fields so one input height is on the page', () => {
    const code = block(app, '.gift-code');
    expect(code).toContain('font-family: var(--font-mono)');
    expect(code).toContain('font-size: var(--text-base)');
  });

  it('lays the denomination picker out as tiles that cannot wrap inside a 999px pill', () => {
    const amounts = block(app, '.gift-amounts');
    expect(amounts).toContain('display: grid');
    expect(amounts).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
    expect(amounts).toContain('border-radius: var(--radius-md)');
    expect(responsive).toMatch(/\.gift-amounts \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
    expect(responsive).toMatch(/\.gift-send \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  });

  it('asks the DOM what the switcher and the certificate resolved to', async () => {
    seedSession('Customer');
    renderApp('/gift-cards');
    const main = await screen.findByRole('main');
    // The route is a lazy chunk, so <main> is on the page long before the screen is.
    await within(main).findByRole('button', { name: /send a digital card/i });

    const group = within(main).getByRole('group', { name: /gift cards/i });
    const options = within(group).getAllByRole('button');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveAttribute('aria-pressed', 'true');
    expect(options[1]).toHaveAttribute('aria-pressed', 'false');

    fireEvent.change(within(main).getByRole('textbox', { name: /gift card code/i }), { target: { value: 'GC-WELCOME-1000' } });
    fireEvent.click(within(main).getByRole('button', { name: /^check balance$/i }));

    const flag = await within(main).findByText(/active digital certificate verified/i);
    const cert = flag.closest('.gift-block')?.querySelector('.gift-card-cert');
    expect(cert).not.toBeNull();
    // One plate, one certificate: the result is a block of the same shell, not a second card.
    expect(cert?.closest('.table-surface')).toBe(within(main).getByRole('textbox', { name: /gift card code/i }).closest('.table-surface'));
    expect(cert?.querySelector('.gift-card-cert__code .mono')?.textContent).toBe('GC-WELCOME-1000');
    // formatMoney is Intl's currency formatter, so the gap it puts between code and amount is a
    // non-breaking one; comparing against the helper is what pins the card to the shared formatter.
    expect(cert?.querySelector('.gift-card-cert__amount > strong')?.textContent).toBe(formatMoney(1000));
    expect(within(cert as HTMLElement).getByRole('button', { name: /copy/i })).toHaveClass('btn--on-cert');
    expect(cert?.getAttribute('style')).toBeNull();

    const faq = await within(main).findByText(/how do i use a gift card\?/i);
    expect(faq.closest('dl')).not.toBeNull();
  });

  it('keeps the live preview and the send form in the same plate', async () => {
    seedSession('Customer');
    renderApp('/gift-cards');
    const main = await screen.findByRole('main');
    await within(main).findByRole('button', { name: /send a digital card/i });

    fireEvent.click(within(main).getByRole('button', { name: /send a digital card/i }));
    const preview = await within(main).findByText(/real-time card certificate preview/i);
    const form = within(main).getByRole('group', { name: /select amount/i });
    expect(form.closest('.table-surface')).toBe(preview.closest('.table-surface'));
    expect(within(form).getAllByRole('button')).toHaveLength(4);
    // The preview is the same component, so it resolves the same class the customer screen uses.
    expect(preview.closest('.gift-preview')?.querySelector('.gift-card-cert')).not.toBeNull();
  });
});
