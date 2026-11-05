import { HttpResponse, http } from 'msw';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { UserRole } from '../api/types';
import { API } from './handlers';
import { server } from './server';
import { renderApp, seedSession, usersByRole } from './utils';

function signIn(role: UserRole) {
  seedSession(role);
  server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(usersByRole[role])));
}

describe('Route guards', () => {
  // Round 28: the home page used to bounce every signed-in visitor to /products, which is why the
  // offers, the store pulse and the smart picks were never seen by a logged-in customer. The
  // storefront is public space, not a workspace, so all four roles land on it.
  it.each<UserRole>(['Customer', 'Staff', 'InventoryManager', 'Administrator'])('keeps the public home reachable for a signed-in %s', async (role) => {
    signIn(role);
    renderApp('/');
    expect(await screen.findByTestId('showcase')).toBeInTheDocument();
    // The storefront talks about the catalogue, so the redirect is disproved by its own heading.
    expect(screen.queryByRole('heading', { level: 1, name: 'Catalogue' })).not.toBeInTheDocument();
  });
  it('lets an anonymous visitor browse products', async () => {
    renderApp('/products');

    expect(await screen.findByRole('heading', { name: /catalogue/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^welcome$/i })).not.toBeInTheDocument();
  });

  it('shows the public showcase to an anonymous visitor without demanding a sign-in', async () => {
    renderApp('/');

    expect(await screen.findByTestId('showcase')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^welcome$/i })).not.toBeInTheDocument();
  });

  it('redirects a customer away from the staff console', async () => {
    signIn('Customer');
    renderApp('/staff');

    expect(await screen.findByRole('heading', { name: /catalogue/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /order console/i })).not.toBeInTheDocument();
  });

  it('redirects a customer away from the admin console and inventory', async () => {
    signIn('Customer');
    const { unmount } = renderApp('/admin');

    expect(await screen.findByRole('heading', { name: /catalogue/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /administration/i })).not.toBeInTheDocument();

    unmount();

    seedSession('Customer');
    server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(usersByRole.Customer)));
    renderApp('/inventory');

    expect(await screen.findByRole('heading', { name: /catalogue/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^inventory$/i })).not.toBeInTheDocument();
  });

  it('keeps an inventory manager out of the staff console', async () => {
    signIn('InventoryManager');
    renderApp('/staff');

    expect(await screen.findByRole('heading', { name: /catalogue/i })).toBeInTheDocument();
  });

  it('lets staff reach the staff console but not the admin console', async () => {
    signIn('Staff');
    const { unmount } = renderApp('/staff');

    expect(await screen.findByRole('heading', { name: /order console/i })).toBeInTheDocument();

    unmount();

    seedSession('Staff');
    server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(usersByRole.Staff)));
    renderApp('/admin');

    expect(await screen.findByRole('heading', { name: /catalogue/i })).toBeInTheDocument();
  });

  it('lets an administrator reach every console', async () => {
    signIn('Administrator');
    renderApp('/admin');

    expect(await screen.findByRole('heading', { name: /administration/i })).toBeInTheDocument();
  });

  it('renders a not-found page for an unknown route', async () => {
    signIn('Customer');
    renderApp('/does-not-exist');

    expect(await screen.findByText(/page not found/i)).toBeInTheDocument();
  });
});
