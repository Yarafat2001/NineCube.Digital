import { HttpResponse, http } from 'msw';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { API, customerUser, order, problem } from './handlers';
import { server } from './server';
import { renderApp, seedSession } from './utils';

function signInCustomer() {
  seedSession('Customer');
  server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(customerUser)));
}

describe('My orders', () => {
  it('shows a loading skeleton before the orders arrive', async () => {
    signInCustomer();
    server.use(
      http.get(`${API}/api/orders`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return HttpResponse.json({
          items: [order],
          page: 1,
          pageSize: 10,
          totalCount: 1,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false
        });
      })
    );

    renderApp('/orders');

    expect(await screen.findByTestId('skeleton-tile')).toBeInTheDocument();
    expect(await screen.findByText('#500')).toBeInTheDocument();
  });

  it('shows an empty state when the customer has no orders', async () => {
    signInCustomer();
    server.use(
      http.get(`${API}/api/orders`, () =>
        HttpResponse.json({ items: [], page: 1, pageSize: 10, totalCount: 0, totalPages: 0, hasNext: false, hasPrevious: false })
      )
    );

    renderApp('/orders');

    expect(await screen.findByTestId('empty-state')).toHaveTextContent(/no orders yet/i);
  });

  it('shows an error state when the order list fails', async () => {
    signInCustomer();
    server.use(
      http.get(`${API}/api/orders`, () =>
        HttpResponse.json(problem(500, 'internal_error', 'An unexpected error occurred.', 'Boom.'), { status: 500 })
      )
    );

    renderApp('/orders');

    expect(await screen.findByTestId('error-state')).toBeInTheDocument();
  });
});

describe('Order detail', () => {
  it('renders the lines, the timeline and the invoice link', async () => {
    signInCustomer();
    renderApp('/orders/500');

    expect(await screen.findByRole('heading', { name: /order #500/i })).toBeInTheDocument();

    const table = screen.getByRole('table', { name: /order lines/i });
    expect(within(table).getByText('Espresso Machine Pro')).toBeInTheDocument();
    expect(within(table).getByText('Milk Frother')).toBeInTheDocument();
    // The order carries no explicit currency, so the store default (BDT) is used.
    expect(within(table).getByText('BDT 288.90')).toBeInTheDocument();

    const timeline = screen.getByRole('list', { name: /order status timeline/i });
    expect(within(timeline).getByText(/pending/i)).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /printable invoice/i })).toHaveAttribute('href', '/orders/500/invoice');
  });

  it('offers cancel while the order is pending', async () => {
    signInCustomer();

    // A small stateful fake so the refetch after the mutation reflects the new status,
    // exactly like the real API would.
    let status: string = 'Pending';
    let cancelled = 0;

    server.use(
      http.post(`${API}/api/orders/500/cancel`, () => {
        cancelled += 1;
        status = 'Cancelled';
        return HttpResponse.json({ ...order, status });
      }),
      http.get(`${API}/api/orders/500`, () => HttpResponse.json({ ...order, status }))
    );

    const user = userEvent.setup();
    renderApp('/orders/500');

    expect(await screen.findByTestId('status-Pending')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /cancel order/i }));

    expect(cancelled).toBe(1);
    expect(await screen.findByTestId('status-Cancelled')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel order/i })).not.toBeInTheDocument();
  });

  it('hides the cancel button once the order has shipped', async () => {
    signInCustomer();
    server.use(http.get(`${API}/api/orders/500`, () => HttpResponse.json({ ...order, status: 'Shipped' })));

    renderApp('/orders/500');

    expect(await screen.findByTestId('status-Shipped')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel order/i })).not.toBeInTheDocument();
    expect(screen.getByText(/shipped orders cannot be cancelled/i)).toBeInTheDocument();
  });

  it('shows an error state for an order the customer cannot see (404)', async () => {
    signInCustomer();
    server.use(
      http.get(`${API}/api/orders/999`, () =>
        HttpResponse.json(problem(404, 'not_found', 'Not found.', 'Order 999 was not found.'), { status: 404 })
      )
    );

    renderApp('/orders/999');

    const error = await screen.findByTestId('error-state');
    expect(error).toHaveTextContent(/order 999 was not found/i);
    expect(error).toHaveTextContent(/test-correlation-id/i);
  });

  it('renders the printable invoice', async () => {
    signInCustomer();
    renderApp('/orders/500/invoice');

    expect(await screen.findByRole('heading', { name: /invoice #500/i })).toBeInTheDocument();
    expect(screen.getByText(/handled outside this system/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument();
  });
});
