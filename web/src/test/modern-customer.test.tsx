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
    expect(screen.getByRole('button', { name: 'Account' })).toHaveClass('nav-control');
    expect(screen.getByRole('group', { name: 'Colour theme' })).toHaveClass('nav-control');
  });

  it('portals the account menu and supports arrows, Home, End, Escape and outside close', async () => {
    const user = userEvent.setup(); renderApp('/account');
    const trigger = await screen.findByRole('button', { name: 'Account' });
    trigger.focus(); await user.keyboard('{ArrowDown}');
    const menu = await screen.findByRole('menu', { name: 'Account' });
    expect(menu.parentElement).toBe(document.body);
    expect(menu.closest('nav')).toBeNull();
    expect(within(menu).getByRole('menuitem', { name: 'Dashboard' })).toHaveFocus();
    await user.keyboard('{End}'); expect(within(menu).getByRole('menuitem', { name: 'Log out' })).toHaveFocus();
    await user.keyboard('{Home}{ArrowDown}'); expect(within(menu).getByRole('menuitem', { name: 'Profile' })).toHaveFocus();
    await user.keyboard('{Escape}'); expect(screen.queryByRole('menu')).not.toBeInTheDocument(); expect(trigger).toHaveFocus();
    await user.click(trigger); await user.click(screen.getByRole('heading', { name: 'Dashboard' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('clears dependent location fields when their parent changes', async () => {
    const user = userEvent.setup(); renderApp('/account/profile');
    const division = await screen.findByRole('combobox', { name: 'Division' });
    const district = screen.getByRole('combobox', { name: 'District' });
    const upazila = screen.getByRole('combobox', { name: 'Upazila' });
    expect(district).toBeDisabled(); expect(upazila).toBeDisabled();
    await user.selectOptions(division, 'Dhaka'); await user.selectOptions(district, 'Dhaka');
    await user.selectOptions(upazila, 'Savar'); expect(upazila).toHaveValue('Savar');
    await user.selectOptions(division, 'Sylhet');
    expect(district).toHaveValue(''); expect(upazila).toHaveValue(''); expect(upazila).toBeDisabled();
    expect(within(district).queryByRole('option', { name: 'Dhaka' })).not.toBeInTheDocument();
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
