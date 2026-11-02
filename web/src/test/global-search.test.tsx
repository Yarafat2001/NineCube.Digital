import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import type { UserRole } from '../api/types';
import { API } from './handlers';
import { server } from './server';
import { renderApp, seedSession, usersByRole } from './utils';

async function signIn(role: UserRole = 'Customer') {
  seedSession(role);
  server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(usersByRole[role])));
}

describe('GlobalSearch Component', () => {
  it('opens spotlight palette on trigger click and closes on Escape', async () => {
    const user = userEvent.setup();
    await signIn('Customer');
    renderApp('/products');

    const searchBtn = await screen.findByRole('button', { name: /^search catalogue$/i });
    expect(searchBtn).toBeInTheDocument();

    // Click to open spotlight
    await user.click(searchBtn);

    // Spotlight dialog is portaled to body with role dialog
    const dialog = await screen.findByRole('dialog', { name: /^search catalogue$/i });
    expect(dialog).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('data-overlay-open', 'true');

    // Input is rendered with placeholder
    const searchInput = screen.getByPlaceholderText(/search by product name, brand, category, or SKU/i);
    expect(searchInput).toBeInTheDocument();

    // Press Escape to dismiss
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /^search catalogue$/i })).not.toBeInTheDocument();
    });
    expect(document.documentElement).not.toHaveAttribute('data-overlay-open');
  });

  it('renders quick category chips inside spotlight palette', async () => {
    const user = userEvent.setup();
    server.use(
      http.get(`${API}/api/categories`, () =>
        HttpResponse.json([
          { id: 1, name: 'Electronics', slug: 'electronics', children: [] },
          { id: 2, name: 'Footwear', slug: 'footwear', children: [] },
        ])
      )
    );
    await signIn('Customer');
    renderApp('/products');

    const searchBtn = await screen.findByRole('button', { name: /^search catalogue$/i });
    await user.click(searchBtn);

    const dialog = await screen.findByRole('dialog', { name: /^search catalogue$/i });
    expect(dialog).toBeInTheDocument();

    // Check categories label
    expect(screen.getByText(/quick categories:/i)).toBeInTheDocument();

    // Check that chips are rendered once categories query resolves
    await waitFor(() => {
      expect(dialog.querySelectorAll('.spotlight-chip').length).toBeGreaterThanOrEqual(1);
    });

    // Close dialog via close button
    const closeBtn = screen.getByRole('button', { name: /^close dialog$/i });
    await user.click(closeBtn);
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /^search catalogue$/i })).not.toBeInTheDocument();
    });
  });

  it('searches products and shows live matching results', async () => {
    const user = userEvent.setup();
    await signIn('Customer');
    renderApp('/products');

    const searchBtn = await screen.findByRole('button', { name: /^search catalogue$/i });
    await user.click(searchBtn);

    const searchInput = await screen.findByPlaceholderText(/search by product name, brand, category, or SKU/i);
    await user.type(searchInput, 'Aspire');

    // Wait for debounced search results
    await waitFor(
      () => {
        expect(screen.getByText(/top matching products/i)).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    // Clear search button should appear
    const clearBtn = screen.getByRole('button', { name: /^clear$/i });
    expect(clearBtn).toBeInTheDocument();
    await user.click(clearBtn);

    expect(searchInput).toHaveValue('');
  });
});
