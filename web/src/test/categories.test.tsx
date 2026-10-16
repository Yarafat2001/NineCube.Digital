import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { App } from '../App';
import type { Category } from '../api/types';
import { API, customerUser, staffUser, products, problem } from './handlers';
import { server } from './server';
import { AppProviders, seedSession } from './utils';

const category = (id: number, name: string, slug: string, parentId: number | null, children: Category[] = []): Category => ({ id, name, slug, parentId, path: `/${slug}/`, depth: parentId ? 2 : 1, sortOrder: 0, isActive: true, productCount: 2, inStockCount: 1, lowStockCount: 1, directProductCount: 1, directInStockCount: 1, breadcrumb: [{ id, name, slug }], children });
const coffee = category(4, 'Coffee', 'coffee', 3);
const kitchen = category(3, 'Kitchen', 'kitchen', 2, [coffee]);
const home = category(2, 'Home', 'home', null, [kitchen]);
const tree = [home, category(1, 'Uncategorized', 'uncategorized', null), category(9, 'Empty category', 'empty-category', null)];
const page = (items: typeof products) => ({ items: items.map(p => ({ ...p, stockQuantity: p.id === products[1].id ? 0 : p.stockQuantity, categories: [{ id: p.id === products[1].id ? 2 : 4, name: p.id === products[1].id ? 'Home' : 'Coffee', slug: p.id === products[1].id ? 'home' : 'coffee', isPrimary: true }] })), page: 1, pageSize: 8, totalCount: items.length, totalPages: items.length ? 1 : 0 });
function NavigationProbe() {
  const location = useLocation(); const navigate = useNavigate();
  return <><output data-testid="test-url">{location.pathname + location.search}</output><button onClick={() => navigate(-1)}>Test back</button><button onClick={() => navigate(1)}>Test forward</button></>;
}
function mount(route = '/products') {
  return render(<MemoryRouter initialEntries={[route]}><AppProviders><><NavigationProbe /><App /></></AppProviders></MemoryRouter>);
}
beforeEach(() => {
  seedSession('Customer');
  server.use(
    http.get(`${API}/api/auth/me`, () => HttpResponse.json(customerUser)),
    http.get(`${API}/api/categories`, () => HttpResponse.json(tree)),
    http.get(`${API}/api/tags`, () => HttpResponse.json([{ id: 1, name: 'Coffee', productCount: 2, inStockCount: 1 }])),
    http.get(`${API}/api/products`, ({ request }) => {
      const p = new URL(request.url).searchParams;
      if (p.get('categorySlug') === 'missing') return HttpResponse.json(problem(404, 'not_found', 'Category unavailable', 'This category is unavailable.'), { status: 404 });
      if (p.get('categorySlug') === 'empty-category' || p.get('q') === 'nothing') return HttpResponse.json(page([]));
      return HttpResponse.json(page(p.get('includeDescendants') === 'false' || p.get('categorySlug') === 'coffee' ? [products[p.get('categorySlug') === 'coffee' ? 0 : 1]] : products.slice(0, 2)));
    })
  );
});

describe('Catalogue categories', () => {
  it('collapses an initially expanded selected category and keeps filters on search', async () => {
    const user = userEvent.setup(); const requests: URL[] = [];
    server.use(http.get(`${API}/api/products`, ({ request }) => { requests.push(new URL(request.url)); return HttpResponse.json(page(products.slice(0, 2))); }));
    mount('/products?category=home&tag=Coffee&page=3');
    const root = await screen.findByRole('treeitem', { name: 'Home, 2 products, 1 in stock' });
    expect(root).toHaveAttribute('aria-expanded', 'true');
    await user.click(within(await screen.findByRole('tree')).getByRole('button', { name: 'Collapse Home' }));
    expect(root).toHaveAttribute('aria-expanded', 'false');
    await user.type(screen.getByRole('searchbox', { name: 'Search products' }), 'frother');
    await waitFor(() => expect(requests.filter(r => r.searchParams.get('pageSize') !== '100').at(-1)?.searchParams.get('q')).toBe('frother'));
    expect(requests.filter(r => r.searchParams.get('pageSize') !== '100').at(-1)?.searchParams.get('categorySlug')).toBe('home');
    expect(requests.filter(r => r.searchParams.get('pageSize') !== '100').at(-1)?.searchParams.get('tag')).toBe('Coffee');
    expect(requests.filter(r => r.searchParams.get('pageSize') !== '100').at(-1)?.searchParams.get('page')).toBe('1');
  });

  it('renders counts, expands with the keyboard, and selection updates URL and results', async () => {
    const user = userEvent.setup(); mount();
    const root = await screen.findByRole('treeitem', { name: 'Home, 2 products, 1 in stock' });
    expect(root).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(root, { key: 'ArrowRight' });
    expect(screen.getByRole('treeitem', { name: 'Kitchen, 2 products, 1 in stock' })).toBeInTheDocument();
    await user.click(within(await screen.findByRole('tree')).getByRole('button', { name: /^Home/ }));
    expect(screen.getByTestId('test-url')).toHaveTextContent('category=home');
    await user.click(screen.getByLabelText('Include subcategories'));
    expect(screen.getByRole('treeitem', { name: 'Home, 1 products' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('product-1')).not.toBeInTheDocument());
    expect(screen.getByTestId('test-url')).toHaveTextContent('includeDescendants=false');
    expect(screen.getByTestId('product-2')).toBeInTheDocument();
  });

  it('restores URL filters after remount and respects back and forward navigation', async () => {
    const user = userEvent.setup(); let rendered = mount('/products?category=home&tag=Coffee&inStock=true&sort=price');
    await screen.findByTestId('product-1');
    expect(screen.getByLabelText('In-stock only')).toBeChecked();
    // Tags and sort are in-panel lists now, so the restored state is a checked box and a radio.
    expect(screen.getByRole('checkbox', { name: /^Coffee/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Price: low to high' })).toBeChecked();
    await user.click(within(await screen.findByRole('tree')).getByRole('button', { name: 'Expand Kitchen' }));
    await user.click(within(await screen.findByRole('tree')).getByRole('button', { name: /^Coffee/ }));
    await waitFor(() => expect(screen.getByTestId('test-url')).toHaveTextContent('category=coffee'));
    await user.click(screen.getByText('Test back')); expect(screen.getByTestId('test-url')).toHaveTextContent('category=home');
    await user.click(screen.getByText('Test forward')); expect(screen.getByTestId('test-url')).toHaveTextContent('category=coffee');
    const url = screen.getByTestId('test-url').textContent!;
    rendered.unmount(); rendered = mount(url);
    await screen.findByTestId('product-1'); expect(screen.getByRole('checkbox', { name: /^Coffee/ })).toBeChecked(); expect(screen.getByRole('radio', { name: 'Price: low to high' })).toBeChecked();
  });

  it('distinguishes empty category from filters with no results', async () => {
    const user = userEvent.setup(); mount('/products?category=empty-category');
    await screen.findByRole('heading', { name: 'No products in this category' });
    await user.type(screen.getByRole('searchbox', { name: 'Search products' }), 'nothing');
    await screen.findByRole('heading', { name: 'No results for these filters' });
  });

  it('falls back to All with a friendly message when a category disappears', async () => {
    mount('/products?category=missing');
    await screen.findByText('That category is no longer available. Showing all products.');
    await screen.findByTestId('product-1'); expect(screen.getByTestId('test-url')).not.toHaveTextContent('category=');
  });

  it('opens the filter drawer, traps focus, and applies its draft', async () => {
    const user = userEvent.setup(); mount();
    await screen.findByTestId('product-1');
    const trigger = screen.getAllByRole('button', { name: 'Filters (0)' })[0]!; await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Filter products' });
    await user.click(within(dialog).getByRole('checkbox', { name: 'In-stock only' }));
    expect(screen.getByTestId('test-url')).not.toHaveTextContent('inStock');
    const apply = within(dialog).getByRole('button', { name: 'Apply filters' });
    // jsdom has no layout; expose focusable bounds for the real modal focus trap.
    dialog.querySelectorAll<HTMLElement>('button,input,select,[tabindex="0"]').forEach(el => { el.getClientRects = () => [el.getBoundingClientRect()] as unknown as DOMRectList; });
    apply.focus(); await user.tab(); expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.tab(); expect(within(dialog).getByRole('button', { name: 'Close dialog' })).toHaveFocus();
    await user.click(apply); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('test-url')).toHaveTextContent('inStock=true');
  });
});

describe('Staff category management', () => {
  it('saves multiple categories, a primary selection, and tags without stock fields', async () => {
    const user = userEvent.setup(); seedSession('Staff');
    let payload: unknown;
    server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(staffUser)),
      http.put(`${API}/api/products/:id/categories`, async ({ request }) => { payload = await request.json(); return HttpResponse.json(products[0]); }));
    mount('/staff');
    await user.click(await screen.findByRole('button', { name: 'Manage categories' }));
    await user.click(screen.getByRole('button', { name: 'Product categories & tags' }));
    await screen.findByRole('option', { name: 'Espresso Machine Pro (NC-1001)' });
    await user.selectOptions(await screen.findByLabelText('Product'), '1');
    const editor = await screen.findByRole('form', { name: 'Product category editor' });
    await user.click(within(editor).getByRole('checkbox', { name: 'Uncategorized' }));
    await user.selectOptions(within(editor).getByLabelText('Primary category'), '4');
    await user.type(within(editor).getByLabelText('Tags (comma separated)'), 'Coffee, Featured');
    await user.click(within(editor).getByRole('button', { name: 'Save product categories' }));
    await waitFor(() => expect(payload).toEqual({ categoryIds: expect.arrayContaining([1, 4]), primaryCategoryId: 4, tags: ['Coffee', 'Featured'] }));
  });

  it('shows a cycle error inline and requires reassignment for an occupied category', async () => {
    const user = userEvent.setup(); seedSession('Staff');
    server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(staffUser)),
      http.post(`${API}/api/categories/:id/move`, () => HttpResponse.json(problem(409, 'category_cycle', 'Cycle', 'A category cannot move under itself or a descendant.'), { status: 409 })));
    mount('/staff'); await user.click(await screen.findByRole('button', { name: 'Manage categories' })); await user.click(await screen.findByRole('button', { name: 'Edit Home' }));
    const editor = screen.getByRole('form', { name: 'Category editor' });
    await user.selectOptions(within(editor).getByLabelText('Parent category'), '4');
    await user.click(within(editor).getByRole('button', { name: 'Move category' }));
    await screen.findByRole('alert'); expect(screen.getByRole('alert')).toHaveTextContent(/cannot move under itself/);
    const remove = within(editor).getByRole('button', { name: 'Delete category' }); expect(remove).toBeDisabled();
    await user.selectOptions(within(editor).getByLabelText('Reassign products and children to'), '1'); expect(remove).toBeEnabled();
  });
});
