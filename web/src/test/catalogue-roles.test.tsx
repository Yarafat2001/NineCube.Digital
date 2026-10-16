import { HttpResponse, http } from 'msw';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { UserRole } from '../api/types';
import { API, products } from './handlers';
import { server } from './server';
import { renderApp, seedSession, usersByRole } from './utils';

async function signIn(role: UserRole) {
  seedSession(role);
  server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(usersByRole[role])));
  renderApp('/products');
  await screen.findByRole('heading', { name: /catalogue/i });
}

/**
 * Ordering is a Customer action. Showing the stepper and \"Add to cart\" to Staff, Inventory or
 * Admin offered an action the API would refuse with 403 - the catalogue is read-only for them.
 * The cart itself is a modal sheet that only exists once opened, so what a role has on the page is
 * its trigger; the navbar and the mobile bar carry the same accessible name, hence findAll.
 */
describe('Catalogue by role', () => {
  it('lets a customer add products to a cart', async () => {
    await signIn('Customer');

    const triggers = await screen.findAllByRole('button', { name: /^Cart, \d+ items?$/i });
    await userEvent.click(triggers[0]!);
    expect(await screen.findByRole('dialog', { name: /your cart/i })).toBeInTheDocument();
    expect((await screen.findAllByRole('button', { name: /add to cart/i })).length).toBeGreaterThan(0);
  });

  it.each<UserRole>(['Staff', 'InventoryManager', 'Administrator'])(
    'gives %s a read-only catalogue with no ordering controls',
    async (role) => {
      await signIn(role);

      expect(await screen.findByRole('heading', { name: /read-only view/i })).toBeInTheDocument();

      // Wait for the grid to render so the negative assertions below cannot pass vacuously.
      expect(await screen.findByTestId(`product-${products[0]!.id}`)).toBeInTheDocument();

      expect(screen.queryByRole('button', { name: /add to cart/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Cart, \d+ items?$/i })).not.toBeInTheDocument();
    }
  );
});
