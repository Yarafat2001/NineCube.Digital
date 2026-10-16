import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Category, Product } from '../api/types';
import { API, products } from './handlers';
import { server } from './server';
import { renderAppWithHistory, seedSession } from './utils';

/**
 * The sidebar is the one part of the catalogue where a number can lie: a count that ignores
 * "In-stock only", a slug where a name belongs, or a selection that is only painted in colour. These
 * tests read the panel the way a shopper does - label, count, chip and result total together.
 */
async function openCatalogue(route = '/products') {
  const user = seedSession('Customer');
  server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(user)));
  const view = renderAppWithHistory(route);
  // The route is lazy: wait for the page itself, or the first query runs against an empty document.
  await screen.findByRole('heading', { name: /catalogue/i });
  return view;
}

function panel() {
  return within(screen.getByRole('complementary', { name: /catalogue filters/i }));
}

const paged = (items: Product[]) => ({
  items, page: 1, pageSize: 20, totalCount: items.length, totalPages: items.length ? 1 : 0,
  hasNext: false, hasPrevious: false
});

beforeEach(() => {
  server.use(http.get(`${API}/api/categories`, () => HttpResponse.json([])));
});

describe('Tag and sort controls', () => {
  beforeEach(() => {
    // The importer writes a "Brand: Apple" tag beside the real ones, so the grid carries it here and
    // the panel can be checked against a catalogue that really contains plumbing.
    server.use(http.get(`${API}/api/products`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      const wanted = (params.get('tag') ?? '').split(',').map(value => value.trim()).filter(Boolean);
      let items = wanted.length ? products.filter(product => product.tags?.some(tag => wanted.includes(tag))) : [...products];
      const sort = params.get('sort');
      if (sort === 'price') items.sort((a, b) => a.price - b.price);
      else items.sort((a, b) => a.name.localeCompare(b.name));
      return HttpResponse.json(paged(items.map(product => ({ ...product, tags: [...(product.tags ?? []), 'Brand: Apple'] }))));
    }));
  });

  it('selects several tags into one parameter and keeps plumbing tags out of the list and the cards', async () => {
    const user = userEvent.setup();
    const { router } = await openCatalogue();

    expect(panel().queryByText('Brand: Apple')).not.toBeInTheDocument();
    const card = await screen.findByTestId('product-5');
    expect(card).toHaveTextContent('Featured');
    expect(card).not.toHaveTextContent('Brand: Apple');

    await user.click(panel().getByRole('checkbox', { name: /Featured/i }));
    await waitFor(() => expect(router.state.location.search).toBe('?tag=Featured'));
    expect(await screen.findByText(/2 products found/i)).toBeInTheDocument();

    await user.click(panel().getByRole('checkbox', { name: /5G/i }));
    await waitFor(() => expect(router.state.location.search).toBe('?tag=Featured%2C5G'));
    // OR inside the tag group: Featured (2) plus 5G (2), one product carrying both.
    expect(await screen.findByText(/3 products found/i)).toBeInTheDocument();

    const featuredChip = screen.getByRole('button', { name: /remove tag: featured filter/i });
    expect(screen.getByRole('button', { name: /remove tag: 5g filter/i })).toBeInTheDocument();

    await user.click(featuredChip);
    await waitFor(() => expect(router.state.location.search).toBe('?tag=5G'));
    expect(await screen.findByText(/2 products found/i)).toBeInTheDocument();
  });

  it('sorts through radios in the panel instead of a popup the scroll area clips', async () => {
    const user = userEvent.setup();
    const { router } = await openCatalogue();

    const group = await panel().findByTestId('group-sort');
    expect(within(group).getByRole('radiogroup', { name: /sort results by/i })).toBeInTheDocument();
    expect(within(group).queryByRole('combobox')).not.toBeInTheDocument();

    await user.click(within(group).getByRole('radio', { name: 'Price: low to high' }));
    await waitFor(() => expect(router.state.location.search).toBe('?sort=price'));

    // The cheapest product leads, which is what the server-side ordering is supposed to do.
    const cards = await screen.findAllByTestId(/^product-\d+$/);
    expect(cards[0]).toHaveAttribute('data-testid', 'product-4');
    expect(within(group).getAllByRole('radio').filter(entry => (entry as HTMLInputElement).checked)).toHaveLength(1);
  });
});

describe('Counts against the result list', () => {
  const shelf: Product[] = [
    { id: 21, sku: 'SH-1', name: 'Cordless Drill', price: 120, stockQuantity: 3, isActive: true, rowVersion: null, tags: ['Power tool'], categories: [{ id: 5, name: 'Tools', slug: 'tools', isPrimary: true }] },
    { id: 22, sku: 'SH-2', name: 'Angle Grinder', price: 90, stockQuantity: 0, isActive: true, rowVersion: null, tags: ['Power tool'], categories: [{ id: 5, name: 'Tools', slug: 'tools', isPrimary: true }] },
    { id: 23, sku: 'SH-3', name: 'Work Light', price: 45, stockQuantity: 5, isActive: false, rowVersion: null, tags: ['Power tool'], categories: [{ id: 5, name: 'Tools', slug: 'tools', isPrimary: true }] }
  ];
  const available = shelf.filter(product => product.isActive && product.stockQuantity > 0);

  const tools: Category = {
    id: 5, name: 'Tools', slug: 'tools', parentId: null, path: '/tools/', depth: 1, sortOrder: 0, isActive: true,
    productCount: shelf.length, inStockCount: available.length, lowStockCount: 0,
    directProductCount: shelf.length, directInStockCount: available.length,
    breadcrumb: [{ id: 5, name: 'Tools', slug: 'tools' }], children: []
  };

  beforeEach(() => {
    // One fixture, two views: the panel numbers and the grid come from the same rows, so a
    // disagreement between them can only be a UI bug.
    server.use(
      http.get(`${API}/api/categories`, () => HttpResponse.json([tools])),
      http.get(`${API}/api/tags`, () => HttpResponse.json([
        { id: 7, name: 'Power tool', productCount: shelf.length, inStockCount: available.length }
      ])),
      http.get(`${API}/api/products`, ({ request }) =>
        HttpResponse.json(paged(new URL(request.url).searchParams.get('inStock') === 'true' ? available : shelf)))
    );
  });

  it('follows "In-stock only" everywhere and starts unchecked', async () => {
    const user = userEvent.setup();
    const { router } = await openCatalogue();

    const switcher = await panel().findByRole('checkbox', { name: /in-stock only/i });
    expect(switcher).not.toBeChecked();

    const row = await panel().findByRole('treeitem', { name: 'Tools, 3 products, 1 in stock' });
    expect(within(row).getByText('3')).toBeInTheDocument();
    expect(await screen.findByText(/3 products found/i)).toBeInTheDocument();
    expect(panel().getByTitle('1 of 3 in stock')).toHaveTextContent('3');

    await user.click(switcher);
    await waitFor(() => expect(router.state.location.search).toBe('?inStock=true'));
    expect(await screen.findByText(/1 product found/i)).toBeInTheDocument();
    await panel().findByRole('treeitem', { name: 'Tools, 1 in stock' });
    expect(within(panel().getByRole('group', { name: /tags/i })).getByText('1')).toBeInTheDocument();

    // The switch is also a chip, so it can be dropped without hunting for the checkbox again.
    await user.click(screen.getByRole('button', { name: /remove in stock filter/i }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(await screen.findByText(/3 products found/i)).toBeInTheDocument();
    expect(switcher).not.toBeChecked();
  });

  it('marks the selected row with a tick and words, not colour alone', async () => {
    const user = userEvent.setup();
    await openCatalogue();

    const row = await panel().findByRole('treeitem', { name: 'Tools, 3 products, 1 in stock' });
    await user.click(within(row).getByRole('button', { name: /^Tools/ }));

    const selected = await panel().findByRole('treeitem', { name: 'Tools, 3 products, 1 in stock' });
    expect(selected).toHaveAttribute('aria-selected', 'true');
    // The tick is a separate node inside the label, so the state reads as "✓ Tools" and not just colour.
    expect(selected.querySelector('.category-tree__label')?.textContent).toBe('✓ Tools');
  });

  it('names the group by category name and leaves the odd zero out of the price header', async () => {
    const user = userEvent.setup();
    await openCatalogue();

    const row = await panel().findByRole('treeitem', { name: 'Tools, 3 products, 1 in stock' });
    await user.click(within(row).getByRole('button', { name: /^Tools/ }));

    // The header and the chip both speak the name; the slug belongs in the URL only.
    expect(await panel().findByTestId('group-category')).toHaveTextContent('Tools');
    expect(panel().queryByText('tools')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /remove tools filter/i })).toBeInTheDocument();

    // An untouched price range used to print a stray "0" in its header.
    expect(panel().getByTestId('group-price').querySelector('.filter-group__tally')).toBeNull();

    // Name line and summary line are separate nodes: inline they ran together as "Category · 1Tools".
    const group = panel().getByTestId('group-category');
    expect(group.querySelector('.filter-group__name')?.textContent).toBe('Category · 1');
    expect(group.querySelector('.filter-group__summary')?.textContent).toBe('Tools');
  });
});

describe('Panel chrome', () => {
  it('keeps the title and reset in place and counts the active brand selection', async () => {
    const user = userEvent.setup();
    await openCatalogue();

    expect(await panel().findByRole('heading', { name: /browse & filter/i })).toBeInTheDocument();
    const reset = panel().getByRole('button', { name: /^reset all$/i });
    expect(reset).toBeDisabled();

    await user.click(await panel().findByRole('checkbox', { name: /Apple/i }));
    await user.click(panel().getByRole('checkbox', { name: /Samsung/i }));

    expect(await panel().findByTestId('group-brand')).toHaveTextContent('Brand · 2');
    expect(reset).toBeEnabled();
  });

  it('prices the cart in the catalogue currency, not dollars', async () => {
    const user = userEvent.setup();
    await openCatalogue();

    // The cart is a sheet, so its total only exists once it has been opened.
    const triggers = await screen.findAllByRole('button', { name: /^Cart, \d+ items?$/i });
    await user.click(triggers[0]!);
    const total = await screen.findByTestId('cart-total');
    expect(total).toHaveTextContent('BDT 0.00');
    expect(total).not.toHaveTextContent('$');
  });
});
