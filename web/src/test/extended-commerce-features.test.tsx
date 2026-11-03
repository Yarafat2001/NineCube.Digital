import { screen, waitFor, within, render, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import type { UserRole } from '../api/types';
import { API, order, products } from './handlers';
import { server } from './server';
import { renderApp, seedSession, usersByRole } from './utils';
import { recordRecentView, getRecentViews, clearRecentViews } from '../lib/recentViews';
import { resolveAssetUrl } from '../api/client';
import { ProductThumbnail } from '../components/ProductImage';

async function signIn(role: UserRole = 'Customer') {
  seedSession(role);
  server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(usersByRole[role])));
}

describe('Extended Modern Commerce Features', () => {
  it('tracks recently viewed products and renders them with 1-click cart addition', async () => {
    clearRecentViews();
    recordRecentView(products[0]);
    recordRecentView(products[1]);

    const recent = getRecentViews();
    expect(recent.length).toBe(2);
    expect(recent[0].id).toBe(products[1].id);

    const user = userEvent.setup();
    await signIn('Customer');
    renderApp('/products');

    const recentSection = await screen.findByTestId('recently-viewed-section');
    expect(recentSection).toBeInTheDocument();
    expect(within(recentSection).getByText(/recently viewed products/i)).toBeInTheDocument();
    expect(within(recentSection).getByText(products[0].name)).toBeInTheDocument();

    // 1-click add to cart from recently viewed
    const addBtn = within(recentSection).getByRole('button', { name: new RegExp(`add ${products[0].name}`, 'i') });
    await user.click(addBtn);

    // Clear history button
    const clearBtn = within(recentSection).getByRole('button', { name: /clear recently viewed history/i });
    await user.click(clearBtn);
    expect(screen.queryByTestId('recently-viewed-section')).not.toBeInTheDocument();
  });

  it('opens quick view modal from product card and allows direct add to cart', async () => {
    const user = userEvent.setup();
    await signIn('Customer');
    renderApp('/products');

    const card = await screen.findByTestId(`product-${products[0].id}`);
    const quickViewBtn = within(card).getByRole('button', { name: /^quick view/i });
    expect(quickViewBtn).toBeInTheDocument();

    await user.click(quickViewBtn);

    // Modal dialog is opened
    const modal = await screen.findByRole('dialog', { name: /quick view/i });
    expect(modal).toBeInTheDocument();
    expect(within(modal).getByText(products[0].name)).toBeInTheDocument();

    // Add to cart inside quick view modal
    const addToCartBtn = within(modal).getByRole('button', { name: /add to cart/i });
    await user.click(addToCartBtn);

    // Close dialog
    const closeBtn = within(modal).getByRole('button', { name: /close dialog/i });
    await user.click(closeBtn);
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /quick view/i })).not.toBeInTheDocument();
    });
  });

  it('renders estimated delivery milestone on order detail timeline', async () => {
    await signIn('Customer');
    server.use(http.get(`${API}/api/orders/500`, () => HttpResponse.json(order)));
    renderApp('/orders/500');

    expect(await screen.findByRole('heading', { name: /order #500/i })).toBeInTheDocument();
    const estDelivery = await screen.findByLabelText(/estimated delivery/i);
    expect(estDelivery).toBeInTheDocument();
    expect(estDelivery).toHaveTextContent(/estimated delivery:/i);
    expect(estDelivery).toHaveTextContent(/standard fulfillment/i);
  });

  it('displays coupon analytics KPI ribbon in admin console', async () => {
    seedSession('Administrator');
    server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(usersByRole['Administrator'])));
    renderApp('/admin');

    // Switch to Coupons tab
    const user = userEvent.setup();
    const couponsTab = await screen.findByRole('tab', { name: /coupons & discounts/i });
    await user.click(couponsTab);

    // KPI ribbon is present
    const ribbon = await screen.findByLabelText(/coupon performance overview/i);
    expect(ribbon).toBeInTheDocument();
    expect(within(ribbon).getByText(/active campaigns/i)).toBeInTheDocument();
    expect(within(ribbon).getByText(/total redemptions/i)).toBeInTheDocument();
    expect(within(ribbon).getByText(/banner promoted/i)).toBeInTheDocument();
  });
it('resolves product asset URLs robustly across GitHub Pages and API hosts', () => {
    expect(resolveAssetUrl(null)).toBeUndefined();
    expect(resolveAssetUrl('')).toBeUndefined();
    expect(resolveAssetUrl('https://example.com/item.png')).toBe('https://example.com/item.png');
    expect(resolveAssetUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
    expect(resolveAssetUrl('/uploads/phone.png')).toContain('/uploads/phone.png');

    // GitHub Pages subpath resolution
    const originalLocation = window.location;
    try {
      delete (window as any).location;
      (window as any).location = {
        hostname: 'yarafat2001.github.io',
        pathname: '/NineCube.Digital/#/products'
      };
      expect(resolveAssetUrl('/products/sourced/112-shoes.jpg')).toBe('/NineCube.Digital/products/sourced/112-shoes.jpg');
      expect(resolveAssetUrl('products/sourced/112-shoes.jpg')).toBe('/NineCube.Digital/products/sourced/112-shoes.jpg');
    } finally {
      (window as any).location = originalLocation;
    }
  });

  it('renders ProductThumbnail with fallback placeholder when image URL fails or is missing', () => {
    // Missing URL falls back to placeholder with shoe icon for shoe category
    const shoeProduct = {
      ...products[0],
      imageUrl: null,
      images: [],
      categories: [{ id: 1, name: 'Shoes', slug: 'shoes', isPrimary: true }]
    };
    const { rerender } = render(<ProductThumbnail product={shoeProduct} />);
    const placeholder = screen.getByTestId('thumb-placeholder');
    expect(placeholder).toBeInTheDocument();

    // Broken image triggers onError and displays fallback
    rerender(<ProductThumbnail product={shoeProduct} url="https://example.com/broken.jpg" alt="Running Shoe" />);
    const img = screen.getByRole('img', { name: /running shoe/i });
    fireEvent.error(img);
    expect(screen.getByTestId('thumb-placeholder')).toBeInTheDocument();
  });
});
