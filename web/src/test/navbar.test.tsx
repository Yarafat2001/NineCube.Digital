import { HttpResponse, http } from 'msw';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { navItemsFor } from '../components/Navbar';
import type { UserRole } from '../api/types';
import { API } from './handlers';
import { server } from './server';
import { renderApp, seedSession, usersByRole } from './utils';

function signIn(role: UserRole) {
  seedSession(role);
  server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(usersByRole[role])));
}

describe('Navbar', () => {
  it('shows only the links the role can actually use', async () => {
    expect(navItemsFor('Customer').map((item) => item.label)).toEqual(['Products', 'My Orders']);
    expect(navItemsFor('Staff').map((item) => item.label)).toEqual(['Products', 'Orders', 'Sales', 'Operations']);
    expect(navItemsFor('InventoryManager').map((item) => item.label)).toEqual(['Products', 'Inventory', 'Operations']);
    expect(navItemsFor('Administrator').map((item) => item.label)).toEqual(['Products', 'Admin', 'Staff', 'Inventory', 'Operations']);

    signIn('Administrator');
    renderApp('/admin');

    const nav = await screen.findByRole('navigation', { name: /main/i });
    const links = Array.from(nav.querySelectorAll('.navbar__link')).map((link) => link.textContent);

    expect(links).toEqual(['Products', 'Admin', 'Staff', 'Inventory', 'Operations']);
    expect(screen.queryByRole('link', { name: 'My Orders' })).not.toBeInTheDocument();
  });

  it('marks the real active link with aria-current without a separate highlight layer', async () => {
    signIn('Customer');
    renderApp('/orders');

    const nav = await screen.findByRole('navigation', { name: /main/i });
    const ordersLink = within(nav).getByRole('link', { name: 'My Orders' });

    expect(ordersLink).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Products' })).not.toHaveAttribute('aria-current');

    expect(nav.querySelector('.navbar__highlight')).toBeNull();
  });

  // Round 28: a signed-in home visit stays on the storefront instead of being pushed to /products,
  // so nothing in the navbar is current there; the current-tab rule is proved on the catalogue.
  it('leaves the signed-in home visit on the storefront with no current tab', async () => {
    signIn('Customer');
    renderApp('/');

    const nav = await screen.findByRole('navigation', { name: /main/i });
    await screen.findByTestId('showcase');
    expect(within(nav).queryByRole('link', { name: 'Showcase' })).not.toBeInTheDocument();
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
  });

  it('marks only the catalogue tab current on a signed-in /products visit', async () => {
    signIn('Customer');
    renderApp('/products');

    const nav = await screen.findByRole('navigation', { name: /main/i });
    await screen.findByRole('heading', { name: /catalogue/i });
    expect(within(nav).getByRole('link', { name: 'Products' })).toHaveAttribute('aria-current', 'page');
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it('highlights only the most specific link on a nested route', async () => {
    signIn('Staff');
    renderApp('/staff/sales');

    const nav = await screen.findByRole('navigation', { name: /main/i });

    // /staff/sales is a child of /staff, so a prefix test would mark both links as current.
    expect(within(nav).getByRole('link', { name: 'Sales' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Orders' })).not.toHaveAttribute('aria-current');
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it('is keyboard operable with arrow keys', async () => {
    signIn('Administrator');
    const user = userEvent.setup();
    renderApp('/');

    await screen.findByRole('navigation', { name: /main/i });

    const adminLink = screen.getByRole('link', { name: 'Admin' });
    adminLink.focus();
    expect(adminLink).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('link', { name: 'Staff' })).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('link', { name: 'Inventory' })).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('link', { name: 'Operations' })).toHaveFocus();

    // wraps around to the first link in the tray
    await user.keyboard('{ArrowRight}');
    expect(within(screen.getByRole('navigation', { name: /main/i })).getByRole('link', { name: 'Products' })).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('link', { name: 'Operations' })).toHaveFocus();
  });

  it('shows the signed-in email and signs the user out', async () => {
    signIn('Customer');
    const user = userEvent.setup();
    renderApp('/');

    expect(await screen.findByText('customer@ninecube.demo')).toBeInTheDocument();

    // Round 33: the avatar is a plain link to the account home, and log out is the last row of the
    // sidebar that home docks. Two taps, no hover panel. Scoped to the navbar's own action group,
    // because the phone tab bar has a second Account entry.
    const actions = screen.getByRole('group', { name: /cart, notifications and account/i });
    const avatar = within(actions).getByRole('link', { name: /^account$/i });
    expect(avatar).toHaveAttribute('href', expect.stringContaining('/account'));
    await user.click(avatar);

    await user.click(await screen.findByRole('button', { name: /^log out$/i }));

    expect(await screen.findByRole('heading', { name: /^welcome$/i })).toBeInTheDocument();
    expect(sessionStorage.getItem('ninecube.auth.session')).toBeNull();
  });

  it('lets the tray size itself for a variable number of links', async () => {
    signIn('InventoryManager');
    renderApp('/inventory');

    const nav = await screen.findByRole('navigation', { name: /main/i });
    // The account avatar joined the link count when it stopped being a hover trigger, so this
    // measures the tray the keyboard roving focus walks over rather than the whole bar.
    const tray = nav.querySelector('.navbar__tray');
    expect(tray).not.toBeNull();
    expect(tray!.querySelectorAll('.navbar__link')).toHaveLength(3);
  });
});
