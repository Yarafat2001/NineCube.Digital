import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { API, customerUser, order, problem } from './handlers';
import { server } from './server';
import { renderApp, seedSession } from './utils';

/** Signs in a customer and adds the Espresso Machine (id 1, stock 12) to the cart. */
async function customerWithCart(units = 1) {
  seedSession('Customer');

  server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(customerUser)));

  const user = userEvent.setup();
  renderApp('/products');

  const card = await screen.findByTestId('product-1');
  const increase = within(card).getByRole('button', { name: /increase quantity/i });
  for (let added = 1; added < units; added += 1) await user.click(increase);
  await user.click(within(card).getByRole('button', { name: /add to cart/i }));

  await user.click(within(screen.getByRole('group', { name: 'Cart, notifications and account' })).getByRole('button', { name: /^Cart,/ }));
  await screen.findByTestId('cart-line-1');
  return user;
}

describe('Checkout', () => {
  it('places an order, shows the confirmation and clears the cart', async () => {
    const requests: Request[] = [];

    const user = await customerWithCart();

    server.use(
      http.post(`${API}/api/orders`, async ({ request }) => {
        requests.push(request);
        return HttpResponse.json(order, { status: 201 });
      })
    );

    await user.click(screen.getByTestId('place-order'));

    // The order id comes from the 201 response and the user lands on the order detail page.
    expect(await screen.findByRole('heading', { name: /order #500/i })).toBeInTheDocument();
    expect(requests).toHaveLength(1);

    // Exactly one submission carried exactly one line of one unit.
    const body = (await requests[0]!.json()) as { items: { productId: number; quantity: number }[] };
    expect(body.items).toEqual([{ productId: 1, quantity: 1 }]);
    expect(requests[0]!.headers.get('Idempotency-Key')).toBeTruthy();
  });

  it('renders the short items on 409 and keeps the cart', async () => {
    const user = await customerWithCart();

    let productFetchesAfterFailure = 0;

    server.use(
      http.post(`${API}/api/orders`, () =>
        HttpResponse.json(
          problem(409, 'insufficient_stock', 'Insufficient stock.', 'One or more items do not have enough stock available.', {
            shortItems: [{ productId: 1, sku: 'NC-1001', name: 'Espresso Machine Pro', requested: 1, available: 0 }]
          }),
          { status: 409 }
        )
      ),
      http.get(`${API}/api/products/:id`, ({ params }) => {
        productFetchesAfterFailure += 1;
        return HttpResponse.json({
          id: Number(params.id),
          sku: 'NC-1001',
          name: 'Espresso Machine Pro',
          price: 249,
          stockQuantity: 0,
          isActive: true,
          rowVersion: null
        });
      })
    );

    await user.click(screen.getByTestId('place-order'));

    const shortItems = await screen.findByTestId('short-items');
    expect(within(shortItems).getByText(/not enough stock/i)).toBeInTheDocument();
    expect(within(shortItems).getByText(/requested 1 · available 0/)).toBeInTheDocument();

    // The cart is deliberately kept so the customer can correct the quantities.
    expect(screen.getByTestId('cart-line-1')).toBeInTheDocument();

    // ...and the stock badge is refreshed from the server.
    await waitFor(() => expect(productFetchesAfterFailure).toBeGreaterThan(0));
  });

  it('takes the corrected retry on the next click, not whenever the stock re-check gets round to it', async () => {
    // The shelf holds two units and the cart was built for three.
    const user = await customerWithCart(3);
    const submissions: number[] = [];

    server.use(
      http.post(`${API}/api/orders`, async ({ request }) => {
        const body = (await request.json()) as { items: { productId: number; quantity: number }[] };
        submissions.push(body.items[0]!.quantity);
        return body.items[0]!.quantity > 2
          ? HttpResponse.json(
              problem(409, 'insufficient_stock', 'Insufficient stock.', 'One or more items do not have enough stock available.', {
                shortItems: [{ productId: 1, sku: 'NC-1001', name: 'Espresso Machine Pro', requested: 3, available: 2 }]
              }),
              { status: 409 }
            )
          : HttpResponse.json(order, { status: 201 });
      }),
      // Held open on purpose: while this request was pending, the panel used to swallow the next click
      // on Place order without a word.
      http.get(`${API}/api/products/:id`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 400));
        return HttpResponse.json({
          id: 1, sku: 'NC-1001', name: 'Espresso Machine Pro', price: 249, stockQuantity: 2, isActive: true, rowVersion: null
        });
      })
    );

    await user.click(screen.getByTestId('place-order'));
    expect(await screen.findByTestId('short-items')).toHaveTextContent(/requested 3 · available 2/);

    await user.click(within(screen.getByTestId('cart-line-1')).getByRole('button', { name: /decrease quantity/i }));
    await user.click(screen.getByTestId('place-order'));

    await screen.findByRole('heading', { name: /order #500/i });
    expect(submissions).toEqual([3, 2]);
  });

  it('keeps the shortage banner while the line is short and drops it once the line fits', async () => {
    const user = await customerWithCart(3);
    const line = () => screen.getByTestId('cart-line-1');

    server.use(
      http.post(`${API}/api/orders`, () =>
        HttpResponse.json(
          problem(409, 'insufficient_stock', 'Insufficient stock.', 'One or more items do not have enough stock available.', {
            shortItems: [{ productId: 1, sku: 'NC-1001', name: 'Espresso Machine Pro', requested: 3, available: 2 }]
          }),
          { status: 409 }
        )
      ),
      http.get(`${API}/api/products/:id`, () =>
        HttpResponse.json({ id: 1, sku: 'NC-1001', name: 'Espresso Machine Pro', price: 249, stockQuantity: 2, isActive: true, rowVersion: null })
      )
    );

    await user.click(screen.getByTestId('place-order'));
    expect(await screen.findByTestId('short-items')).toHaveTextContent(/requested 3 · available 2/);

    await user.click(within(line()).getByRole('button', { name: /decrease quantity/i }));
    await waitFor(() => expect(screen.queryByTestId('short-items')).not.toBeInTheDocument());
    expect(screen.queryByTestId('cart-error')).not.toBeInTheDocument();
    expect(line()).toHaveTextContent('2 available');

    // The re-fetched figure now drives the cap: three cannot be asked for again.
    expect(within(line()).getByRole('button', { name: /increase quantity/i })).toBeDisabled();
  });

  it('does not send a second request when the button is double clicked', async () => {
    await customerWithCart();

    let posts = 0;

    server.use(
      http.post(`${API}/api/orders`, async () => {
        posts += 1;
        await new Promise((resolve) => setTimeout(resolve, 30));
        return HttpResponse.json(order, { status: 201 });
      })
    );

    const button = screen.getByTestId('place-order');
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(await screen.findByRole('heading', { name: /order #500/i })).toBeInTheDocument();
    expect(posts).toBe(1);
  });

  it('shows an inline message and a toast on a network error, and keeps the cart', async () => {
    const user = await customerWithCart();

    server.use(http.post(`${API}/api/orders`, () => HttpResponse.error()));

    await user.click(screen.getByTestId('place-order'));

    expect(await screen.findByTestId('cart-error')).toBeInTheDocument();
    expect(screen.getByTestId('cart-line-1')).toBeInTheDocument();
    expect(await screen.findByTestId('toasts')).toHaveTextContent(/did not respond/i);
  });

  it('shows an inline message on a 400 without retrying the same idempotency key', async () => {
    const user = await customerWithCart();
    const keys: (string | null)[] = [];

    server.use(
      http.post(`${API}/api/orders`, ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key'));
        return HttpResponse.json(
          problem(400, 'invalid_request', 'The request is invalid.', 'Unknown product id(s): 1.'),
          { status: 400 }
        );
      })
    );

    await user.click(screen.getByTestId('place-order'));
    expect(await screen.findByTestId('cart-error')).toBeInTheDocument();

    await user.click(screen.getByTestId('place-order'));
    await waitFor(() => expect(keys).toHaveLength(2));

    // A client error will not succeed on retry, so a fresh key is used for the next attempt.
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('redirects to the login page when the API answers 401', async () => {
    const user = await customerWithCart();

    server.use(
      http.post(`${API}/api/orders`, () =>
        HttpResponse.json(problem(401, 'unauthenticated', 'Authentication required.', 'Token expired.'), { status: 401 })
      )
    );

    await user.click(screen.getByTestId('place-order'));

    expect(await screen.findByRole('heading', { name: /^sign in$/i })).toBeInTheDocument();
    expect(sessionStorage.getItem('ninecube.auth.session')).toBeNull();
  });

  it('keeps the same idempotency key when retrying after a server error', async () => {
    const user = await customerWithCart();
    const keys: (string | null)[] = [];
    let attempt = 0;

    server.use(
      http.post(`${API}/api/orders`, ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key'));
        attempt += 1;
        return attempt === 1
          ? HttpResponse.json(problem(500, 'internal_error', 'An unexpected error occurred.', 'Boom.'), { status: 500 })
          : HttpResponse.json(order, { status: 201 });
      })
    );

    await user.click(screen.getByTestId('place-order'));
    expect(await screen.findByTestId('cart-error')).toBeInTheDocument();

    await user.click(screen.getByTestId('place-order'));
    await screen.findByRole('heading', { name: /order #500/i });

    // Same key: if the first request had in fact reached the database, the retry is a no-op.
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('disables the button while the order is in flight', async () => {
    const user = await customerWithCart();
    const received = vi.fn();

    // The response is held open by the test rather than by a timer, so "in flight" is a state the
    // test controls. Racing a 50 ms delay against waitFor's 50 ms poll interval made this flaky.
    let release!: () => void;
    const inFlight = new Promise<void>((resolve) => {
      release = resolve;
    });

    server.use(
      http.post(`${API}/api/orders`, async () => {
        received();
        await inFlight;
        return HttpResponse.json(order, { status: 201 });
      })
    );

    await user.click(screen.getByTestId('place-order'));

    await waitFor(() => expect(received).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('place-order')).toBeDisabled();

    release();
    await screen.findByRole('heading', { name: /order #500/i });
  });
});
