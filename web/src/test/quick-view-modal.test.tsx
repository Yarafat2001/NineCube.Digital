import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import type { Product } from '../api/types';
import { API } from './handlers';
import { server } from './server';
import { renderApp, seedSession } from './utils';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readStyle = (file: string) => readFileSync(join(root, 'src', 'styles', file), 'utf8');
const readSource = (file: string) => readFileSync(join(root, 'src', file), 'utf8');

const app = readStyle('app.css');
const component = readSource('components/QuickViewModal.tsx');

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

const COLOUR_EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F3FB}-\u{1F3FF}]/u;

const inStock: Product = {
  id: 77, sku: 'BD-ACER-ASPI-3-A3-11D6DD', name: 'Acer Aspire 3 A325-42-V2 (8GB/256GB)',
  price: 57000, compareAtPrice: 64000, currency: 'BDT', stockQuantity: 10, isActive: true, rowVersion: null,
  brandName: 'Acer', description: 'Ryzen 3 5300U processor; 8GB RAM; 256GB SSD; 15.6-inch FHD IPS display.',
  imageUrl: '/products/48.webp', images: [], categories: [{ id: 1, name: 'Laptops', slug: 'laptops', isPrimary: true }], tags: ['laptop']
};
const soldOut: Product = { ...inStock, id: 78, sku: 'BD-ACER-ASPI-5-A5-22C7EE', name: 'Acer Aspire 5 A515-44 (8GB/512GB)', stockQuantity: 0 };

async function openQuickView(product: Product) {
  const user = seedSession('Customer');
  const items = [inStock, soldOut];
  server.use(
    http.get(`${API}/api/auth/me`, () => HttpResponse.json(user)),
    http.get(`${API}/api/products`, () => HttpResponse.json({ items, page: 1, pageSize: 8, totalCount: items.length, totalPages: 1, hasNext: false, hasPrevious: false })),
    http.get(`${API}/api/products/:id`, ({ params }) => HttpResponse.json(items.find(item => item.id === Number(params.id)) ?? inStock))
  );
  renderApp('/products');
  const card = await screen.findByTestId(`product-${product.id}`);
  // cardPresentation() strips the brand out of the card title, so the accessible name of the
  // eye button is "Quick view Aspire 3 A325-42-V2 (8GB/256GB)" — match the control, not the copy.
  await userEvent.click(within(card).getByRole('button', { name: /quick view/i }));
  return screen.findByRole('dialog');
}

describe('the quick view dialog is built on the house system', () => {
  it('hands nothing to the browser to paint by hand', () => {
    // Five inline styles and a shopping-trolley emoji in the label of the primary button.
    expect(component).not.toMatch(/style=\{/);
    expect(component).not.toMatch(COLOUR_EMOJI);
    const registry = readSource('components/Icon.tsx');
    const names = new Set([...registry.matchAll(/(?:^|[{,\s])([a-z0-9-]+):\s*'/g)].map(match => match[1]));
    for (const name of [...component.matchAll(/<Icon name="([a-z0-9-]+)"/g)].map(match => match[1])) {
      expect(names.has(name), `Icon "${name}" is not in the registry`).toBe(true);
    }
    expect(component).toMatch(/<Icon name=\{justAdded \? 'check' : 'cart'\}/);
  });

  it('paints one media frame, not two', () => {
    // The dialog used to wrap the shared card media in its own 1:1 sunken box: 74px of empty
    // background under the photo at 1440, and 97px of the photo cut off at 390, where the sheet
    // caps this box at 160px. The card media is the frame now; the box only sizes it.
    const media = block(app, '.quickview-modal__media');
    expect(media).toContain('aspect-ratio: 1 / 1');
    expect(media).not.toMatch(/background/);
    expect(media).not.toMatch(/border:/);
    const fill = block(app, '.quickview-modal__media > .product-detail__media');
    expect(fill).toContain('height: 100%');
    expect(fill).toContain('aspect-ratio: auto');
    expect(app).toMatch(/\.quickview-modal__media > \.product-card__media,\s*\.quickview-modal__media > \.product-detail__media/);
  });

  it('buys on one aligned row instead of three heights in a block div', () => {
    // There was no desktop rule for this row at all: stepper 34px, button 41px, heart 40px,
    // the heart 2px above the button, and no gap property.
    const row = block(app, '.quickview-modal__cta-row');
    expect(row).toContain('display: flex');
    expect(row).toContain('align-items: center');
    expect(block(app, '.quickview-modal__cta-row > .btn')).toContain('min-height: 44px');
    expect(block(app, '.quickview-modal__add')).toContain('flex: 1 1 150px');
    expect(block(app, '.quickview-modal__wishlist-btn')).toContain('width: 44px');
    // The footer divider was an inline style whose margin-top: auto could never fire.
    expect(block(app, '.quickview-modal__footer')).toContain('border-top: 1px solid var(--border)');
    // :root because modern.css loads after app.css and its .stack gap is a page measure.
    expect(block(app, ':root .quickview-modal__info')).toContain('gap: var(--space-3)');
    // The sheet grabber belongs to the phone sheet, not to a centred laptop dialog.
    expect(app).toMatch(/@media \(min-width: 641px\) \{\s*\.quickview-modal__handle \{\s*display: none;/);
  });

  it('states the product, its price and its stock without reaching for the API again', async () => {
    const dialog = await openQuickView(inStock);
    expect(within(dialog).getByText('Acer')).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { level: 2, name: inStock.name })).toBeInTheDocument();
    expect(within(dialog).getByText(inStock.sku)).toBeInTheDocument();
    expect(within(dialog).getByTestId('stock-in-stock')).toHaveTextContent('In stock · 10');
    expect(within(dialog).getByText('BDT 57,000.00')).toBeInTheDocument();
    expect(within(dialog).getByText('BDT 64,000.00')).toBeInTheDocument();
    expect(within(dialog).getByText(/Ryzen 3 5300U/)).toBeInTheDocument();
    expect(dialog.querySelectorAll('[style]')).toHaveLength(0);
    // The media column is the shared card frame, so the photo arrives through ProductImage.
    expect(dialog.querySelector('.quickview-modal__media .product-card__media img')).toBeInstanceOf(HTMLImageElement);
    expect(within(dialog).getByRole('button', { name: /close dialog/i })).toBeEnabled();
  });

  it('adds to the cart with an icon, not a pictograph in the label', async () => {
    const dialog = await openQuickView(inStock);
    const add = within(dialog).getByRole('button', { name: /^add to cart$/i });
    expect(add.textContent, 'the label carries no emoji').toBe('Add to cart');
    expect(add.querySelector('svg')).toBeInstanceOf(SVGElement);
    // The stepper, the button and the heart are three siblings of one row.
    const row = dialog.querySelector<HTMLElement>('.quickview-modal__cta-row')!;
    expect([...row.children].map(child => child.className.split(' ')[0])).toEqual(['stepper', 'btn', 'btn']);

    await userEvent.click(within(row).getByRole('button', { name: /increase quantity/i }));
    expect(within(row).getByTestId('stepper-value')).toHaveTextContent('2');
    await userEvent.click(add);
    expect(await within(dialog).findByRole('button', { name: /^added!$/i })).toBeInTheDocument();
    const lines = JSON.parse(localStorage.getItem('ninecube.cart.v1.account.10') ?? '[]');
    expect(lines[0]).toMatchObject({ productId: inStock.id, quantity: 2 });
  });

  it('says so plainly when the product cannot be ordered', async () => {
    const dialog = await openQuickView(soldOut);
    expect(within(dialog).getByText('Not currently orderable.')).toBeInTheDocument();
    expect(dialog.querySelector('.stepper')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: /add to cart/i })).toBeNull();
    expect(within(dialog).getByRole('button', { name: /add to wishlist/i })).toBeInTheDocument();
  });

  it('hands the full page over to the product page and gets out of the way', async () => {
    const dialog = await openQuickView(inStock);
    const link = within(dialog).getByRole('link', { name: /view full product details/i });
    expect(link).toHaveAttribute('href', expect.stringContaining(`/products/${inStock.id}`));
    await userEvent.click(link);
    await screen.findByRole('heading', { level: 1, name: inStock.name });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
