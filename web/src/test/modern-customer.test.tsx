import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { API, products, resetAccountFixtures } from './handlers';
import { server } from './server';
import { renderApp, seedSession } from './utils';

beforeEach(() => {
  resetAccountFixtures();
  const user = seedSession('Customer');
  server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(user)));
});

describe('Modern customer controls', () => {
  it('caps the visual bell count and retains its exact accessible count', async () => {
    server.use(http.get(`${API}/api/notifications/unread-count`, () => HttpResponse.json({ count: 15 })));
    renderApp('/account');
    const bell = await screen.findByRole('button', { name: 'Notifications, 15 unread' });
    expect(bell).toHaveClass('nav-control');
    expect(within(bell).getByTestId('unread-badge')).toHaveTextContent('9+');
    expect(screen.getByRole('group', { name: 'Cart, notifications and account' })).toBeInTheDocument();
    // The avatar is a link now rather than a hover trigger, and keeps the navbar's nav-control face.
    expect(within(screen.getByRole('group', { name: 'Cart, notifications and account' }))
      .getByRole('link', { name: 'Account' })).toHaveClass('nav-control');
    expect(screen.getByRole('group', { name: 'Language and colour theme' })).toHaveClass('nav-control');
  });

  // Round 33 deleted the popover, so the keyboard contract is a plain tab sequence over real
  // links rather than a roving focus inside a portal. Nothing is skipped and nothing is trapped.
  it('walks the account sidebar by keyboard and leaves it for log out last', async () => {
    const user = userEvent.setup();
    renderApp('/account');

    const sidebar = await screen.findByRole('navigation', { name: 'Account Navigation' });
    const rows = within(sidebar).getAllByRole('link');
    expect(rows).toHaveLength(8);

    rows[0]!.focus();
    for (const row of rows.slice(1)) {
      await user.keyboard('{Tab}');
      expect(row).toHaveFocus();
    }
    const logout = within(sidebar).getByRole('button', { name: /^log out$/i });
    await user.keyboard('{Tab}');
    expect(logout).toHaveFocus();

    // Round 34: activating a row moves the page, and the rail moves with it - the same list is
    // docked beside every destination, so the second surface Round 33 put here is gone.
    await user.click(within(sidebar).getByRole('link', { name: /my orders/i }));
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /back to dashboard/i })).not.toBeInTheDocument();
    expect(document.querySelectorAll('.account-nav-list')).toHaveLength(1);
  });

  it('clears dependent location fields when their parent changes', async () => {
    const user = userEvent.setup(); renderApp('/account/profile');
    // The editor is a task, not a fixture: the fields only exist once it has been asked for.
    await user.click(await screen.findByRole('button', { name: /^add an address$/i }));
    const division = await screen.findByRole('combobox', { name: 'Division' });
    const district = screen.getByRole('combobox', { name: 'District' });
    const upazila = screen.getByRole('combobox', { name: 'Area / thana / upazila' });
    // Suggestions remain optional so city thanas and unlisted villages can be entered.
    expect(district).toBeEnabled(); expect(upazila).toBeEnabled();
    await user.type(division, 'Dhaka'); await user.type(district, 'Dhaka');
    await user.type(upazila, 'Savar'); expect(upazila).toHaveValue('Savar');
    await user.clear(district); await user.type(district, 'Gazipur');
    expect(upazila).toHaveValue('');
    await user.type(upazila, 'Unlisted village');
    await user.clear(division); await user.type(division, 'Sylhet');
    expect(district).toHaveValue(''); expect(upazila).toHaveValue('');
    const suggestions = document.getElementById(district.getAttribute('list')!) as HTMLDataListElement;
    expect(Array.from(suggestions.options, option => option.value)).not.toContain('Dhaka');
  });

  it('toggles password visibility without changing its value and supplies a strength hint', async () => {
    const user = userEvent.setup(); renderApp('/account/profile');
    const input = await screen.findByLabelText('New password');
    await user.type(input, 'a-unique-long-passphrase');
    await user.click(screen.getByRole('button', { name: 'Show new password' }));
    expect(input).toHaveAttribute('type', 'text'); expect(input).toHaveValue('a-unique-long-passphrase');
    await user.click(screen.getByRole('button', { name: 'Hide new password' }));
    expect(input).toHaveAttribute('type', 'password'); expect(screen.getByText(/good length/i)).toBeInTheDocument();
  });

  it('keeps shipped separate from delivered and status counts sum to the order total', async () => {
    server.use(http.get(`${API}/api/me/dashboard`, () => HttpResponse.json({
      totalOrders: 6, totalSpent: 1200, currency: 'BDT', totalItems: 7, recentOrders: [], recentNotifications: [], unreadNotifications: 0,
      ordersByStatus: [{ status: 'Pending', count: 2 }, { status: 'Confirmed', count: 1 }, { status: 'Shipped', count: 1 }, { status: 'Cancelled', count: 1 }, { status: 'Rejected', count: 1 }]
    })));
    renderApp('/account'); const stats = await screen.findByTestId('dashboard-stats');
    expect(stats.querySelectorAll('.stat-tile')).toHaveLength(4);
    expect(within(stats).getByText('Delivered').closest('.stat-tile')).toHaveTextContent('0');
    const tally = document.querySelector('.status-tally')!;
    await waitFor(() => expect(Array.from(tally.querySelectorAll('.status-tally__count')).reduce((sum, n) => sum + Number(n.textContent), 0)).toBe(6));
    expect(screen.getByRole('img', { name: /orders by status:.*Shipped 1.*Delivered 0/i })).toBeInTheDocument();
    expect(stats.textContent).not.toContain('$');
  });

  it('shows eight brand rows and expands the rest without a nested scroll container', async () => {
    const user = userEvent.setup();
    server.use(http.get(`${API}/api/brands`, () => HttpResponse.json(Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `Brand ${i + 1}`, slug: `brand-${i + 1}`, productCount: 1, inStockCount: 1 })))));
    renderApp('/products');
    const group = await screen.findByRole('group', { name: 'Brands' });
    expect(within(group).getAllByRole('checkbox')).toHaveLength(8);
    await user.click(within(group).getByRole('button', { name: 'Show more (4)' }));
    expect(within(group).getAllByRole('checkbox')).toHaveLength(12);
    await user.click(within(group).getByRole('button', { name: 'Show fewer brands' }));
    expect(within(group).getAllByRole('checkbox')).toHaveLength(8);
  });

  it('counts a cross-listed product once in a parent with the other filters applied', async () => {
    const user = userEvent.setup(); const requests: URL[] = [];
    const node = (id: number, name: string, slug: string, children: unknown[] = []) => ({ id, name, slug, parentId: id === 10 ? null : 10, path: `/${slug}/`, depth: id === 10 ? 1 : 2, sortOrder: 0, isActive: true, productCount: 8, inStockCount: 7, directProductCount: 0, directInStockCount: 0, lowStockCount: 0, breadcrumb: [], children });
    server.use(http.get(`${API}/api/categories`, () => HttpResponse.json([node(10, 'Electronics', 'electronics', [node(11, 'Phones', 'phones'), node(12, 'Audio', 'audio')])])),
      http.get(`${API}/api/tags`, () => HttpResponse.json([{ id: 1, name: 'Featured', productCount: 20, inStockCount: 10 }])),
      http.get(`${API}/api/products`, ({ request }) => {
        requests.push(new URL(request.url));
        const item = { ...products[0], name: 'Cross-listed model', categories: [{ id: 11, name: 'Phones', slug: 'phones', isPrimary: true }, { id: 12, name: 'Audio', slug: 'audio', isPrimary: false }], tags: ['Featured'] };
        return HttpResponse.json({ items: [item], page: 1, pageSize: 100, totalCount: 1, totalPages: 1, hasNext: false });
      }));
    renderApp('/products?tag=Featured&inStock=true&minPrice=50');
    const root = await screen.findByRole('treeitem', { name: 'Electronics, 1 in stock' });
    await user.click(within(root).getByRole('button', { name: 'Expand Electronics' }));
    expect(screen.getByRole('treeitem', { name: 'Phones, 1 in stock' })).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: 'Audio, 1 in stock' })).toBeInTheDocument();
    const countRequest = requests.find(r => r.searchParams.get('pageSize') === '100' && r.searchParams.get('tag') === 'Featured');
    expect(countRequest?.searchParams.get('tag')).toBe('Featured');
    expect(countRequest?.searchParams.get('inStock')).toBe('true');
    expect(countRequest?.searchParams.get('minPrice')).toBe('50');
    const tagGroup = screen.getByRole('group', { name: 'Tags' });
    await waitFor(() => expect(within(tagGroup).getByRole('checkbox', { name: /^Featured 1$/ })).toBeInTheDocument());
  });
});
