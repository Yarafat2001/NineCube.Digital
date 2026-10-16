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
    expect(navItemsFor('Staff').map((item) => item.label)).toEqual(['Products', 'Orders', 'Sales']);
    expect(navItemsFor('InventoryManager').map((item) => item.label)).toEqual(['Products', 'Inventory']);
    expect(navItemsFor('Administrator').map((item) => item.label)).toEqual(['Products', 'Admin', 'Staff', 'Inventory']);

    signIn('Administrator');
    renderApp('/admin');

    const nav = await screen.findByRole('navigation', { name: /main/i });
    const links = Array.from(nav.querySelectorAll('.navbar__link')).map((link) => link.textContent);

    expect(links).toEqual(['Products', 'Admin', 'Staff', 'Inventory']);
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

  it('sends signed-in home visits to products and omits showcase navigation', async () => {
    signIn('Customer');
    renderApp('/');

    const nav = await screen.findByRole('navigation', { name: /main/i });

    await screen.findByRole('heading', { name: /catalogue/i });
    expect(within(nav).queryByRole('link', { name: 'Showcase' })).not.toBeInTheDocument();
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

    // wraps around to the first link in the tray
    await user.keyboard('{ArrowRight}');
    expect(within(screen.getByRole('navigation', { name: /main/i })).getByRole('link', { name: 'Products' })).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('link', { name: 'Inventory' })).toHaveFocus();
  });

  it('shows the signed-in email and signs the user out', async () => {
    signIn('Customer');
    const user = userEvent.setup();
    renderApp('/');

    expect(await screen.findByText('customer@ninecube.demo')).toBeInTheDocument();

    // Signing out moved into the account menu, so the control is a menu item behind a trigger.
    await user.click(screen.getByRole('button', { name: /^account$/i }));
    await user.click(await screen.findByRole('menuitem', { name: /^log out$/i }));

    expect(await screen.findByRole('heading', { name: /^sign in$/i })).toBeInTheDocument();
    expect(sessionStorage.getItem('ninecube.auth.session')).toBeNull();
  });

  it('lets the tray size itself for a variable number of links', async () => {
    signIn('InventoryManager');
    renderApp('/inventory');

    const nav = await screen.findByRole('navigation', { name: /main/i });
    expect(nav.querySelector('.navbar__tray')).not.toBeNull();
    expect(within(nav).getAllByRole('link')).toHaveLength(3); // brand + 2 role links
  });
});
