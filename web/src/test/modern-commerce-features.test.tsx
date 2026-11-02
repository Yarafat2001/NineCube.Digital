import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import type { UserRole } from '../api/types';
import { API, products } from './handlers';
import { server } from './server';
import { renderApp, seedSession, usersByRole } from './utils';

async function signIn(role: UserRole = 'Customer') {
  seedSession(role);
  server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(usersByRole[role])));
}

describe('Modern Commerce Features', () => {
  it('toggles product wishlist status with the quick-heart button on product cards', async () => {
    const user = userEvent.setup();
    let wishlistedIds: number[] = [];

    server.use(
      http.get(`${API}/api/wishlist`, () =>
        HttpResponse.json(wishlistedIds.map((id) => ({ id, productId: id, createdAt: new Date().toISOString() })))
      ),
      http.post(`${API}/api/wishlist/:id/toggle`, ({ params }) => {
        const id = Number(params.id);
        if (wishlistedIds.includes(id)) {
          wishlistedIds = wishlistedIds.filter((x) => x !== id);
        } else {
          wishlistedIds = [...wishlistedIds, id];
        }
        return HttpResponse.json({ inWishlist: wishlistedIds.includes(id) });
      })
    );

    await signIn('Customer');
    renderApp('/products');

    // First card should have a wishlist heart button
    const firstCard = await screen.findByTestId(`product-${products[0].id}`);
    expect(firstCard).toBeInTheDocument();

    const heartBtn = within(firstCard).getByRole('button', { name: /add to wishlist/i });
    expect(heartBtn).toBeInTheDocument();
    expect(heartBtn).not.toHaveClass('product-card__wishlist-btn--active');

    // Click heart to add to wishlist
    await user.click(heartBtn);

    // Heart button reflects active wishlisted state
    await waitFor(() => {
      expect(within(firstCard).getByRole('button', { name: /remove from wishlist/i })).toHaveClass(
        'product-card__wishlist-btn--active'
      );
    });
  });

  it('adds products to compare dock, opens side-by-side modal, and adds to cart', async () => {
    const user = userEvent.setup();
    await signIn('Customer');
    renderApp('/products');

    const firstCard = await screen.findByTestId(`product-${products[0].id}`);
    const secondCard = await screen.findByTestId(`product-${products[1].id}`);

    // Click Compare on first product
    const compareBtn1 = within(firstCard).getByRole('button', { name: /^compare$/i });
    await user.click(compareBtn1);

    // Compare floating dock appears
    const dock = await screen.findByRole('region', { name: /product comparison/i });
    expect(dock).toBeInTheDocument();
    expect(within(dock).getByText(/compare \(1\/4\)/i)).toBeInTheDocument();

    // Click Compare on second product
    const compareBtn2 = within(secondCard).getByRole('button', { name: /^compare$/i });
    await user.click(compareBtn2);
    expect(within(dock).getByText(/compare \(2\/4\)/i)).toBeInTheDocument();

    // Open side-by-side comparison modal
    const viewModalBtn = within(dock).getByRole('button', { name: /view comparison/i });
    await user.click(viewModalBtn);

    // Modal dialog is portaled
    const modal = await screen.findByRole('dialog', { name: /product comparison/i });
    expect(modal).toBeInTheDocument();

    // Both products are present in comparison columns
    expect(within(modal).getByText(products[0].name)).toBeInTheDocument();
    expect(within(modal).getByText(products[1].name)).toBeInTheDocument();

    // 1-click Add to cart from comparison modal
    const addToCartBtns = within(modal).getAllByRole('button', { name: /add to cart/i });
    expect(addToCartBtns.length).toBeGreaterThanOrEqual(2);
    await user.click(addToCartBtns[0]);

    // Close modal
    const closeBtn = within(modal).getByRole('button', { name: /close dialog/i });
    await user.click(closeBtn);
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /product comparison/i })).not.toBeInTheDocument();
    });
  });

  it('renders smart upsell recommendations in the cart sheet', async () => {
    const user = userEvent.setup();
    await signIn('Customer');
    renderApp('/products');

    // Add first product to cart to display cart sheet
    const firstCard = await screen.findByTestId(`product-${products[0].id}`);
    const addToCartBtn = within(firstCard).getByRole('button', { name: /add to cart/i });
    await user.click(addToCartBtn);

    // Open cart sheet via the navbar cart trigger button
    const cartNavBtn = screen.getByTitle('Your cart');
    await user.click(cartNavBtn);

    const cartSheet = await screen.findByRole('dialog', { name: /your cart/i });
    expect(cartSheet).toBeInTheDocument();

    // Verify "Frequently added together" upsell area is rendered
    expect(within(cartSheet).getByText(/frequently added together/i)).toBeInTheDocument();

    // 1-click add recommendation
    const upsellAddBtns = cartSheet.querySelectorAll<HTMLButtonElement>('.cart-upsell__btn');
    expect(upsellAddBtns.length).toBeGreaterThan(0);
    await user.click(upsellAddBtns[0]);

    // Cart line count increases
    expect(cartSheet.querySelectorAll('.cart-line').length).toBeGreaterThanOrEqual(2);
  });
});
