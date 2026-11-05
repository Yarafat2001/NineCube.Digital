import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import type { Product } from '../api/types';
import { SavingsNote, productSavings } from '../components/SavingsNote';
import { API } from './handlers';
import { server } from './server';
import { renderApp, renderWithProviders, seedSession } from './utils';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readStyle = (file: string) => readFileSync(join(root, 'src', 'styles', file), 'utf8');
const readSource = (file: string) => readFileSync(join(root, 'src', file), 'utf8');

const app = readStyle('app.css');

/** The rule whose selector ends at `selector`, returned with its braces. */
function block(css: string, selector: string): string {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`no rule for "${selector}"`);
  const from = css.slice(at);
  const open = from.indexOf('{');
  let depth = 0;
  for (let index = open; index < from.length; index++) {
    if (from[index] === '{') depth++;
    if (from[index] === '}' && --depth === 0) return from.slice(open, index + 1);
  }
  throw new Error(`unbalanced braces in "${selector}"`);
}

/** The @media a rule sits inside, or null at the top level. app.css has six phone queries, so the
 *  label-collapse rule can only be identified by where it lives. */
function enclosingMedia(css: string, selector: string): string | null {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`no rule for "${selector}"`);
  let depth = 0;
  for (let index = at - 1; index >= 0; index--) {
    if (css[index] === '}') depth++;
    else if (css[index] === '{') {
      if (depth === 0) {
        const prelude = css.slice(0, index).match(/@media[^{]*$/);
        return prelude ? prelude[0].trim().replace(/\s+/g, ' ') : null;
      }
      depth--;
    }
  }
  return null;
}

const discounted: Product = {
  id: 77, sku: 'BD-ACER-ASPI-3-A3-11D6DD', name: 'Acer Aspire 3 A325-42-V2 (8GB/256GB)',
  price: 57000, compareAtPrice: 64000, currency: 'BDT', stockQuantity: 10, isActive: true, rowVersion: null,
  brandName: 'Acer', description: 'Ryzen 3 5300U processor; 8GB RAM; 256GB SSD.',
  imageUrl: '/products/48.webp', images: [], categories: [{ id: 1, name: 'Laptops', slug: 'laptops', isPrimary: true }], tags: ['laptop']
};
const fullPrice: Product = { ...discounted, id: 78, sku: 'BD-ACER-ASPI-5-A5-22C7EE', name: 'Acer Aspire 5 A515-44 (8GB/512GB)', compareAtPrice: null };

function stubCatalogue(items: Product[]) {
  const user = seedSession('Customer');
  server.use(
    http.get(`${API}/api/auth/me`, () => HttpResponse.json(user)),
    http.get(`${API}/api/products`, () => HttpResponse.json({
      items, page: 1, pageSize: 8, totalCount: items.length, totalPages: 1, hasNext: false, hasPrevious: false
    })),
    http.get(`${API}/api/products/:id`, ({ params }) => HttpResponse.json(items.find(item => item.id === Number(params.id)) ?? items[0]))
  );
}

describe('the savings widget', () => {
  it('measures the saving from the two server prices and is silent without one', () => {
    expect(productSavings(discounted)).toBe(7000);
    expect(productSavings({ ...discounted, compareAtPrice: 57000 }), 'a list price equal to the selling price saves nothing').toBe(0);
    expect(productSavings({ ...discounted, compareAtPrice: 51000 }), 'a list price below the selling price saves nothing').toBe(0);
    expect(productSavings({ ...discounted, compareAtPrice: null })).toBe(0);

    const zero = renderWithProviders(<SavingsNote amount={0} currency="BDT" />);
    expect(zero.queryByTestId('savings-note')).toBeNull();
    expect(zero.container.querySelector('.savings-note')).toBeNull();
    zero.unmount();

    renderWithProviders(<SavingsNote amount={7000} currency="BDT" />);
    const note = screen.getByTestId('savings-note');
    expect(note).toHaveTextContent('You save BDT 7,000');
    // The separator has to be a real text node, or the accessible name reads "You saveBDT 7,000".
    // en-BD puts a no-break space between the currency code and the amount, which is what keeps the
    // badge from breaking a taka figure across two lines, so the comparison normalises it away.
    expect((note.textContent ?? '').replace(/\u00A0/g, ' ')).toBe('You save BDT 7,000');
    expect(note.textContent).not.toMatch(/\.00/);
  });

  it('is the shared badge family, not a box written for one page', () => {
    const { container } = renderWithProviders(<SavingsNote amount={7000} currency="BDT" />);
    const note = container.firstElementChild!;
    expect(note.className.split(' ')).toEqual(['savings-note', 'badge', 'badge--ok']);
    expect(container.querySelectorAll('[style]')).toHaveLength(0);
    const styles = block(app, '.savings-note');
    expect(styles).toContain('tabular-nums');
    expect(block(app, '.badge--ok')).toContain('var(--ok-bg');
  });

  it('is written once and read by every price surface', () => {
    for (const [file, expected] of [
      ['pages/ProductDetailPage.tsx', 2],
      ['components/QuickViewModal.tsx', 1],
      ['components/CartPanel.tsx', 1]
    ] as const) {
      const source = readSource(file);
      const uses = [...source.matchAll(/<SavingsNote\b/g)].length;
      expect(uses, `${file} routes its savings through the widget`).toBe(expected);
      expect(source).toMatch(/from '(\.\.\/)?components\/SavingsNote'|from '\.\/SavingsNote'/);
    }
    // Every product-side amount comes from the two server prices, so no surface does its own maths
    // for the taka figure; only the percentage chip beside it is computed inline.
    for (const file of ['pages/ProductDetailPage.tsx', 'components/QuickViewModal.tsx']) {
      const source = readSource(file);
      expect([...source.matchAll(/productSavings\(/g)].length, `${file} asks the helper`).toBeGreaterThan(0);
      expect(source).not.toMatch(/formatMoney(?:Whole)?\((?:product\.compareAtPrice - product\.price)/);
    }
  });

  it('sits on the detail page price line and in the phone purchase dock', async () => {
    stubCatalogue([discounted]);
    renderApp('/products/77');
    await screen.findByRole('heading', { level: 1, name: discounted.name });

    const notes = await screen.findAllByTestId('savings-note');
    expect(notes, 'the price line and the sticky dock each carry the widget').toHaveLength(2);
    for (const note of notes) expect(note).toHaveTextContent('You save BDT 7,000');
    expect(document.querySelector('.product-detail__price-row .savings-note')).not.toBeNull();
    expect(document.querySelector('.pdp-sticky-bar__prices .savings-note')).not.toBeNull();
    // The amount is the gap between the two server prices, and the struck price and the chip stay.
    expect(screen.getByText('BDT 64,000.00')).toBeInTheDocument();
    expect(screen.getByText(/-11% OFF/)).toBeInTheDocument();
  });

  it('says nothing at all when the product carries no list price', async () => {
    stubCatalogue([fullPrice]);
    renderApp('/products');
    const card = await screen.findByTestId('product-78');
    await userEvent.click(within(card).getByRole('button', { name: /quick view/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('BDT 57,000.00')).toBeInTheDocument();
    expect(within(dialog).queryByTestId('savings-note')).toBeNull();
    expect(within(dialog).queryByText(/You save/i)).toBeNull();
  });

  it('shows the widget in Quick View beside the price, and hides the label it has no room for', async () => {
    stubCatalogue([discounted]);
    renderApp('/products');
    const card = await screen.findByTestId('product-77');
    await userEvent.click(within(card).getByRole('button', { name: /quick view/i }));
    const dialog = await screen.findByRole('dialog');
    const note = await within(dialog).findByTestId('savings-note');
    expect(note).toHaveTextContent('You save BDT 7,000');
    expect(dialog.querySelector('.quickview-modal__price-row .savings-note')).not.toBeNull();

    // Quick View keeps the words at every width; only the two price lines that cannot fit them lose
    // the label, and they lose it visually only - the accessible text still reads "You save".
    expect(enclosingMedia(app, '.pdp-sticky-bar__prices .savings-note__label')).toBe('@media (max-width: 640px)');
    expect(app).toMatch(/\.product-detail__price-row \.savings-note__label,\s*\.pdp-sticky-bar__prices \.savings-note__label \{/);
    expect(app).not.toMatch(/quickview[^\n]*savings-note__label/);
    expect(app).not.toMatch(/cart-sticky-dock[^\n]*savings-note__label/);
    const collapsed = block(app, '.pdp-sticky-bar__prices .savings-note__label');
    expect(collapsed).toContain('clip-path: inset(50%)');
    expect(collapsed).not.toMatch(/display:\s*none/);
    const row = block(app, '.product-detail__price-row');
    expect(row).toContain('flex-wrap: wrap');
    expect(block(app, '.pdp-sticky-bar__prices')).toContain('flex-wrap: wrap');
  });

  it('keeps the dock copies small enough that the checkout button is never pushed away', () => {
    const dock = block(app, '.pdp-sticky-bar__prices .savings-note, .cart-sticky-dock__totalgroup .savings-note');
    expect(dock).toContain('font-size: var(--text-label)');
    const group = block(app, '.cart-sticky-dock__totalgroup');
    expect(group).toContain('display: inline-flex');
    expect(group).toContain('min-width: 0');
  });
});
