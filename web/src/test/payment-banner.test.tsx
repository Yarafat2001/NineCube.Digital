import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { API, customerUser, order } from './handlers';
import { server } from './server';
import { renderApp, seedSession } from './utils';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');
const flat = (css: string) => css.replace(/\s+/g, ' ');

const appCss = flat(read('src', 'styles', 'app.css'));
const paymentEndpoints = read('..', 'src', 'NineCube.Api', 'Endpoints', 'PaymentEndpoints.cs');

beforeEach(() => sessionStorage.clear());

function signInCustomer() {
  seedSession('Customer');
  server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(customerUser)));
}

describe('Payment outcome banner on the order page', () => {
  it('confirms a verified payment with the success banner', async () => {
    signInCustomer();
    renderApp('/orders/500?payment=success');

    const banner = await screen.findByTestId('payment-banner-success');
    expect(banner).toHaveTextContent('Payment received');
    expect(banner).toHaveTextContent('your order is being processed');
  });

  it('warns about a failed payment and points at the retry', async () => {
    signInCustomer();
    renderApp('/orders/500?payment=failed');

    const banner = await screen.findByTestId('payment-banner-failed');
    expect(banner).toHaveTextContent('Payment failed');
    expect(banner).toHaveTextContent('retry from your order');
  });

  it('notes a cancelled payment with the neutral banner', async () => {
    signInCustomer();
    renderApp('/orders/500?payment=cancelled');

    const banner = await screen.findByTestId('payment-banner-cancelled');
    expect(banner).toHaveTextContent('Payment was cancelled');
  });

  it('stays silent without a payment param', async () => {
    signInCustomer();
    renderApp('/orders/500');
    await screen.findByRole('heading', { name: /order #500/i });
    expect(document.querySelector('[data-testid^="payment-banner-"]')).toBeNull();
  });

  it('stays silent with an unknown payment param', async () => {
    signInCustomer();
    renderApp('/orders/500?payment=unknown');
    await screen.findByRole('heading', { name: /order #500/i });
    expect(document.querySelector('[data-testid^="payment-banner-"]')).toBeNull();
  });
});

describe('Guest payment return', () => {
  it('reroutes a guest order back to the guest page before the login guard, keeping the outcome', async () => {
    sessionStorage.setItem('ninecube.guest.order.500', 'guest-token-1');
    server.use(http.get(`${API}/api/guest/orders/500`, () => HttpResponse.json(order)));

    renderApp('/orders/500?payment=success');

    expect(await screen.findByRole('heading', { name: /order #500/i })).toBeInTheDocument();
    expect(screen.getByTestId('payment-banner-success')).toHaveTextContent('Payment received');
    expect(screen.getByRole('link', { name: /recover a guest order/i })).toBeInTheDocument();
  });
});

describe('Payment callback contract', () => {
  it('answers browsers with a hand-written 303 See Other, never a plain redirect', () => {
    expect(paymentEndpoints).toContain('request.Headers.Accept.Any');
    expect(paymentEndpoints).toContain('StatusCodes.Status303SeeOther');
    expect(paymentEndpoints).toContain('httpContext.Response.Headers.Location = url');
    expect(paymentEndpoints).not.toContain('Results.Redirect(url)');
  });

  it('targets the verified order page, and the orders list when the reference is unknown', () => {
    expect(paymentEndpoints).toContain('orders/{transaction.OrderId}?payment=success');
    expect(paymentEndpoints).toContain('$"orders?payment={outcome}"');
  });

  it('declares the three banner tones in app.css', () => {
    expect(appCss).toContain('.payment-banner {');
    expect(appCss).toContain('.payment-banner--ok {');
    expect(appCss).toContain('.payment-banner--warn {');
    expect(appCss).toContain('.payment-banner--neutral {');
  });
});
