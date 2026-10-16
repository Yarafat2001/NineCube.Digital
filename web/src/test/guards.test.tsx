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
  it.each<UserRole>(['Customer', 'Staff', 'InventoryManager', 'Administrator'])('keeps the public home out of the %s workspace', async (role) => {
    signIn(role);
    renderApp('/');
    expect(await screen.findByRole('heading', { name: /catalogue/i })).toBeInTheDocument();
    expect(screen.queryByTestId('showcase')).not.toBeInTheDocument();
    expect(document.body).not.toHaveClass('showcase-active');
  });
  it('sends an anonymous visitor to the login page', async () => {
    renderApp('/products');

    expect(await screen.findByRole('heading', { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /catalogue/i })).not.toBeInTheDocument();
  });

  it('shows the public showcase to an anonymous visitor without demanding a sign-in', async () => {
    renderApp('/');

    expect(await screen.findByTestId('showcase')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^sign in$/i })).not.toBeInTheDocument();
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
