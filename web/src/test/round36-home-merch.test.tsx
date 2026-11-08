import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { API } from './handlers';
import { server } from './server';
import { renderApp } from './utils';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8');
const home = read('src', 'styles', 'home.css');

/** The last rule for a selector wins in the cascade, so contract checks read the surviving block. */
function block(css: string, selector: string): string {
  const lines = css.split('\n');
  let at = -1;
  lines.forEach((line, index) => {
    if (line.startsWith(`${selector} {`)) at = index;
  });
  if (at < 0) throw new Error(`no rule for "${selector}"`);
  const from = lines.slice(at).join('\n');
  let depth = 0;
  for (let index = from.indexOf('{'); index < from.length; index++) {
    if (from[index] === '{') depth++;
    if (from[index] === '}' && --depth === 0) return from.slice(from.indexOf('{'), index + 1);
  }
  throw new Error(`unbalanced braces in "${selector}"`);
}

const catalogue = (items: unknown[]) => ({
  items, page: 1, pageSize: 48, totalCount: items.length, totalPages: 1, hasNext: false, hasPrevious: false
});

const liveProduct = {
  id: 91, sku: 'BD-HEAD-1', name: 'Wireless Headphones', price: 1499, compareAtPrice: 2499,
  currency: 'BDT', stockQuantity: 8, isActive: true, rowVersion: null, brandId: 1, brandName: 'Apex',
  brandSlug: 'apex', imageUrl: '/uploads/head.png', images: [],
  categories: [{ id: 7, name: 'Audio', slug: 'audio', isPrimary: true }], tags: []
};

describe('The home page merchandises the live catalogue', () => {
  it('shows the live deal in the hero with its real saving', async () => {
    server.use(http.get(`${API}/api/products`, () => HttpResponse.json(catalogue([liveProduct]))));
    renderApp('/');

    const panel = await screen.findByRole('complementary', { name: /Today's best deal/i });
    expect(within(panel).getByText(/SAVE 40%/)).toBeInTheDocument();
    expect(within(panel).getByText('BDT 1,499.00')).toBeInTheDocument();
    expect(within(panel).getByText('BDT 2,499.00')).toBeInTheDocument();
  });

  it('anchors the two collection cards to a price the catalogue returns', async () => {
    server.use(http.get(`${API}/api/products`, () => HttpResponse.json(catalogue([liveProduct]))));
    renderApp('/');

    const promos = await screen.findByRole('complementary', { name: /Featured collections/i });
    await waitFor(() => expect(within(promos).getAllByText(/From BDT 1,499.00/)).toHaveLength(2));
  });

  it('gives every category tile the same media band, a photo or an icon', async () => {
    server.use(http.get(`${API}/api/categories`, () => HttpResponse.json([
      { id: 7, name: 'Audio', slug: 'audio', productCount: 3, isActive: true },
      { id: 8, name: 'Kitchen', slug: 'kitchen', productCount: 2, isActive: true }
    ])));
    server.use(http.get(`${API}/api/products`, () => HttpResponse.json(catalogue([liveProduct]))));
    renderApp('/');

    const section = await screen.findByRole('region', { name: /Browse by Category/i });
    await waitFor(() => expect(section.querySelectorAll('.home-category-card')).toHaveLength(2));
    // Both tiles wear the same band: the category with a catalogue photo wears it, the one
    // without fills it with the icon, so the row keeps one height.
    expect(section.querySelectorAll('.home-category-media')).toHaveLength(2);
    expect(section.querySelector('.home-category-card--photo .home-category-media img')).not.toBeNull();
  });

  it('marks the newest products as new, and never as best sellers', async () => {
    renderApp('/');

    const deals = await screen.findByRole('region', { name: /Featured Deals/i });
    await waitFor(() => expect(within(deals).getAllByText('NEW').length).toBeGreaterThan(0));
    // The catalogue API carries no sales, so a best-seller badge would be a claim we cannot back.
    expect(deals.textContent).not.toMatch(/best seller/i);
  });

  it('puts the live campaign on the band, with the code a shopper pastes', async () => {
    renderApp('/');

    const band = await waitFor(() => {
      const node = document.querySelector('.home-campaign-banner');
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });
    expect(band.textContent).toContain('DURAMO25');
    expect(within(band).getByRole('button', { name: 'Copy voucher code DURAMO25' })).toBeInTheDocument();
  });

  it('gives the footer the contact addresses that really work', async () => {
    renderApp('/');
    await screen.findByTestId('showcase-fallback-reason');

    const footer = document.querySelector('.showcase__outro');
    expect(footer).not.toBeNull();
    expect(within(footer as HTMLElement).getByRole('link', { name: 'support@ninecube.digital' }))
      .toHaveAttribute('href', 'mailto:support@ninecube.digital');
    expect(within(footer as HTMLElement).getByRole('link', { name: 'care@ninecube.digital' }))
      .toHaveAttribute('href', 'mailto:care@ninecube.digital');
  });

  it('keeps the new surfaces on the house tokens', () => {
    for (const selector of [
      '.home-brand-chip',
      '.home-brand-rail',
      '.home-category-media',
      '.home-campaign-banner__code',
      '.home-deal-new-badge'
    ]) {
      const rule = block(home, selector);
      expect(rule, selector).not.toMatch(/#[0-9a-fA-F]{3,8}/);
      expect(rule, selector).not.toMatch(/rgba?\(/);
      expect(rule, selector).not.toMatch(/hsla?\(/);
    }
  });
});
