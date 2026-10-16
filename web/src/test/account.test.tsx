import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Dashboard, UserRole } from '../api/types';
import { API, resetAccountFixtures } from './handlers';
import { server } from './server';
import { renderApp, seedSession } from './utils';

/**
 * The account area is one page per job, but every control has to prove it read the server back: a
 * badge that never drops after "mark all read" is the same class of bug as a form that shows a
 * generic failure instead of the field the API named.
 */
async function signIn(role: UserRole = 'Customer') {
  const user = seedSession(role);
  server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(user)));
}

beforeEach(() => resetAccountFixtures());

describe('Header bell and account menu', () => {
  it('shows the unread count as a number and empties the badge after marking all read', async () => {
    const user = userEvent.setup();
    await signIn();
    renderApp('/');

    const bell = await screen.findByRole('button', { name: 'Notifications, 2 unread' });
    // Icon plus digits: the count must survive a colour-blind reader or a monochrome print.
    expect(within(bell).getByTestId('unread-badge')).toHaveTextContent('2');

    await user.click(bell);
    const panel = await screen.findByRole('dialog', { name: 'Notifications' });
    expect(within(panel).getByText('Order #500 placed')).toBeInTheDocument();
    expect(within(panel).getByText('Order #500 confirmed')).toBeInTheDocument();
    expect(within(panel).getAllByRole('listitem')).toHaveLength(3);

    await user.click(within(panel).getByRole('button', { name: /mark all as read/i }));

    await waitFor(() => expect(screen.queryByTestId('unread-badge')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Notifications, 0 unread' })).toBeInTheDocument();
  });

  it('offers the account pages, and My Orders only to a customer', async () => {
    const user = userEvent.setup();
    await signIn();
    renderApp('/');

    await user.click(await screen.findByRole('button', { name: 'Account' }));
    const menu = await screen.findByRole('menu', { name: 'Account' });
    expect(within(menu).getByRole('menuitem', { name: 'Dashboard' })).toHaveAttribute('href', '/account');
    expect(within(menu).getByRole('menuitem', { name: 'Profile' })).toHaveAttribute('href', '/account/profile');
    expect(within(menu).getByRole('menuitem', { name: 'My Orders' })).toBeInTheDocument();

    await user.click(within(menu).getByRole('menuitem', { name: 'Log out' }));
    expect(await screen.findByRole('heading', { name: /^sign in$/i })).toBeInTheDocument();
  });

  it('leaves My Orders out of the menu for a staff account', async () => {
    const user = userEvent.setup();
    await signIn('Staff');
    renderApp('/');

    await user.click(await screen.findByRole('button', { name: 'Account' }));
    const menu = await screen.findByRole('menu', { name: 'Account' });
    expect(within(menu).queryByRole('menuitem', { name: 'My Orders' })).not.toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Notifications' })).toBeInTheDocument();
  });
});

describe('Notifications page', () => {
  it('marks the selected rows read in one action and clears the selection', async () => {
    const user = userEvent.setup();
    await signIn();
    renderApp('/notifications');

    const bar = await screen.findByTestId('notification-bulk-bar');
    expect(within(bar).getByRole('button', { name: 'Mark as read' })).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'Select Order #500 placed' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Order #500 confirmed' }));
    expect(within(bar).getByText('2 selected')).toBeInTheDocument();

    await user.click(within(bar).getByRole('button', { name: 'Mark as read' }));
    expect(await screen.findByText(/2 notifications marked as read/i)).toBeInTheDocument();

    // The fixture flips isRead, so a row that still claims data-read="false" never reached the API.
    const first = await screen.findByRole('checkbox', { name: 'Select Order #500 placed' });
    await waitFor(() => expect(first.closest('li')).toHaveAttribute('data-read', 'true'));
    expect(within(bar).getByText('0 selected')).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('filters to unread and says so when nothing is left', async () => {
    const user = userEvent.setup();
    await signIn();
    renderApp('/notifications');

    await screen.findByRole('checkbox', { name: 'Select Order #500 placed' });
    await user.click(screen.getByRole('button', { name: /^unread$/i }));
    expect(screen.getByRole('button', { name: /^unread$/i })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));

    await user.click(screen.getByRole('button', { name: /mark all as read/i }));
    expect(await screen.findByRole('heading', { name: /no unread notifications/i })).toBeInTheDocument();
  });

  it('deletes one notification', async () => {
    const user = userEvent.setup();
    await signIn();
    renderApp('/notifications');

    await user.click(await screen.findByRole('button', { name: 'Delete Order #455 cancelled' }));
    expect(await screen.findByText(/notification deleted/i)).toBeInTheDocument();
    expect(screen.queryByText('Order #455 cancelled')).not.toBeInTheDocument();
  });
});

describe('Profile page', () => {
  it('prints the field the API named instead of a generic failure', async () => {
    const user = userEvent.setup();
    await signIn();
    renderApp('/account/profile');

    const name = await screen.findByLabelText('Name');
    await user.clear(name);
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/name is required/i);
    expect(name).toHaveAttribute('aria-invalid', 'true');
    // The email is the login, so it never becomes editable.
    expect(screen.getByLabelText(/email/i)).toBeDisabled();
  });

  it('rejects a bad phone number with the server message', async () => {
    const user = userEvent.setup();
    await signIn();
    renderApp('/account/profile');

    const phone = await screen.findByLabelText('Phone');
    await user.clear(phone);
    await user.type(phone, 'abc');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/phone number is not valid/i);
  });

  it('changes the password only when the current one is right', async () => {
    const user = userEvent.setup();
    await signIn();
    renderApp('/account/profile');

    await user.type(await screen.findByLabelText('Current password'), 'wrong');
    await user.type(screen.getByLabelText('New password'), 'a-fresh-secret');
    await user.click(screen.getByRole('button', { name: /change password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/current password is not correct/i);

    await user.clear(screen.getByLabelText('Current password'));
    await user.type(screen.getByLabelText('Current password'), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: /change password/i }));
    expect(await screen.findByText(/password changed/i)).toBeInTheDocument();
  });

  it('creates and removes a saved address', async () => {
    const user = userEvent.setup();
    await signIn();
    renderApp('/account/profile');

    await user.type(await screen.findByLabelText('Label'), 'Office');
    await user.selectOptions(screen.getByLabelText('Division'), 'Dhaka');
    await user.selectOptions(screen.getByLabelText('District'), 'Dhaka');
    await user.selectOptions(screen.getByLabelText('Upazila'), 'Savar');
    await user.type(screen.getByLabelText('Address line'), 'House 42, Avenue 3');
    await user.click(screen.getByRole('button', { name: /save address/i }));

    expect(await screen.findByText('Office')).toBeInTheDocument();
    expect(await screen.findByText(/house 42, avenue 3/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /delete office/i }));
    expect(await screen.findByText(/address removed/i)).toBeInTheDocument();
    expect(screen.queryByText('Office')).not.toBeInTheDocument();
  });

  it('refuses an incomplete address before it leaves the browser', async () => {
    const user = userEvent.setup();
    await signIn();
    renderApp('/account/profile');

    await user.type(await screen.findByLabelText('Label'), 'Cabin');
    await user.click(screen.getByRole('button', { name: /save address/i }));

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map(entry => entry.textContent).join(' ')).toMatch(/division is required/i);
    expect(screen.queryByText('Cabin')).not.toBeInTheDocument();
  });

  it('keeps a staff sign-in from editing a customer record it does not have', async () => {
    server.use(http.get(`${API}/api/me`, () => HttpResponse.json({
      id: 11, name: 'Staff User', email: 'staff@ninecube.demo', phone: null, role: 'Staff',
      createdAt: '2026-09-01T09:00:00Z', addresses: []
    })));
    await signIn('Staff');
    renderApp('/account/profile');

    expect(await screen.findByRole('heading', { name: /profile/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeDisabled();
    expect(await screen.findByText(/staff account/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save address/i })).not.toBeInTheDocument();
  });
});

describe('Account dashboard', () => {
  it('summarises orders and spending in BDT with a route to each order', async () => {
    await signIn();
    renderApp('/account');

    const stats = await screen.findByTestId('dashboard-stats');
    expect(within(stats).getByText('Total orders')).toBeInTheDocument();
    expect(within(stats).getAllByText('1').length).toBeGreaterThanOrEqual(1);
    expect(within(stats).getByText('Active orders')).toBeInTheDocument();
    expect(within(stats).getByText('Delivered')).toBeInTheDocument();
    // One currency everywhere: the dashboard speaks BDT like the catalogue does.
    expect(within(stats).getByText('BDT 288.90')).toBeInTheDocument();
    expect(within(stats).getByText(/across 2 items/i)).toBeInTheDocument();

    const row = await screen.findByTestId('recent-order-500');
    expect(within(row).getByRole('link', { name: /view/i })).toHaveAttribute('href', '/orders/500');
    expect(screen.getByRole('link', { name: /open inbox/i })).toHaveTextContent('2 unread');
  });

  it('shows an empty state instead of a page of zeros', async () => {
    const empty: Dashboard = {
      totalOrders: 0,
      ordersByStatus: [
        { status: 'Pending', count: 0 }, { status: 'Confirmed', count: 0 },
        { status: 'Shipped', count: 0 }, { status: 'Cancelled', count: 0 }, { status: 'Rejected', count: 0 }
      ],
      totalSpent: 0, currency: 'BDT', totalItems: 0, recentOrders: [], recentNotifications: [], unreadNotifications: 0
    };
    server.use(http.get(`${API}/api/me/dashboard`, () => HttpResponse.json(empty)));

    await signIn();
    renderApp('/account');

    expect(await screen.findByRole('heading', { name: /no orders yet/i })).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-stats')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /browse products/i }).length).toBeGreaterThan(0);
    expect(await screen.findByText(/no messages yet/i)).toBeInTheDocument();
  });
});
