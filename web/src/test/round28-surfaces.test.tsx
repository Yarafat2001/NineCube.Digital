import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { API, resetAccountFixtures } from './handlers';
import { server } from './server';
import { renderApp, seedSession } from './utils';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8');

beforeEach(() => resetAccountFixtures());

async function signInAsCustomer() {
  const user = seedSession('Customer');
  server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(user)));
}

describe('The signed-in customer can use the home page', () => {
  it('renders the storefront instead of pushing a signed-in visitor to the catalogue', async () => {
    await signInAsCustomer();
    renderApp('/');

    // jsdom has no WebGL, so the honest storefront fallback is the page; before this round the
    // redirect meant a signed-in customer could never see any of it.
    expect(await screen.findByTestId('showcase-fallback-reason')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: /ninecube digital/i })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: /Offers you can use right now/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Catalogue' })).not.toBeInTheDocument();
  });

  it('links the smart picks to the products they name', async () => {
    await signInAsCustomer();
    renderApp('/');
    await screen.findByTestId('showcase-fallback-reason');

    const pulse = await screen.findByRole('region', { name: /Store pulse/i });
    const picks = await within(pulse).findAllByRole('link');
    expect(picks.length).toBeGreaterThan(0);
    for (const pick of picks) {
      expect(pick).toHaveAttribute('href', expect.stringMatching(/^\/products\/\d+$/));
    }
  });

  it('counts down to the offer end and links to a search the catalogue can answer', async () => {
    await signInAsCustomer();
    const expiresAt = new Date(Date.now() + 3 * 86_400_000 + 5 * 3_600_000).toISOString();
    server.use(http.get(`${API}/api/coupons/campaigns`, () => HttpResponse.json([
      {
        id: 1, code: 'SAVE10', discountType: 'Percentage', discountValue: 10, minOrderAmount: 0,
        maxDiscountCap: 1500, targetType: 'Order', usageLimit: null, usageCount: 2, isActive: true,
        isBannerPromoted: true, campaignTitle: 'Footwear week', createdAt: '2026-10-15T08:00:00Z',
        expiresAt,
        scopeRules: [{ attribute: 'Category', polarity: 'Include', entityIds: [1], entityNames: ['Footwear'] }]
      }
    ])));
    renderApp('/');

    const section = await screen.findByRole('region', { name: /Offers you can use right now/i });
    // A live days/hours/minutes figure, not a frozen date: the shopper can see the offer ending.
    expect(within(section).getByText(/\d+d \d\dh \d\dm/)).toBeInTheDocument();
    const shop = within(section).getByRole('link', { name: /Shop this offer/i });
    expect(shop).toHaveAttribute('href', '/products?q=Footwear');
  });

  it('says so when the catalogue has no stocked category, instead of an empty rail', async () => {
    server.use(http.get(`${API}/api/categories`, () => HttpResponse.json([])));
    await signInAsCustomer();
    renderApp('/');
    await screen.findByTestId('showcase-fallback-reason');

    const strip = await screen.findByRole('region', { name: /Browse by Category/i });
    await waitFor(() => expect(within(strip).getByText(/no stocked categories/i)).toBeInTheDocument());
  });
});

describe('The account hub links only to destinations that exist', () => {
  const routes = read('src', 'App.tsx').match(/path="([^"]+)"/g)!.map(entry => entry.slice(6, -1));

  it('points every tile and shortcut at a declared route', async () => {
    await signInAsCustomer();
    renderApp('/account');

    const hub = await screen.findByRole('navigation', { name: /Account Navigation/i });
    for (const link of within(hub).getAllByRole('link')) {
      const href = link.getAttribute('href')!;
      expect(routes, `${href} is not a declared route`).toContain(href.split('?')[0]);
    }
    // The four status shortcuts carry the URL filter the orders page actually reads.
    const orders = screen.getByRole('region', { name: /My Orders/i });
    const shortcuts = within(orders).getAllByRole('link').filter(link => link.classList.contains('account-hub-status'));
    expect(shortcuts.map(link => link.getAttribute('href'))).toEqual([
      '/orders?status=Pending', '/orders?status=Confirmed', '/orders?status=Shipped', '/orders?status=Delivered'
    ]);
    // The dashboard fixture has exactly one Pending order, so only that shortcut wears a count.
    expect(within(orders).getByRole('link', { name: /Pending/i }).querySelector('.account-hub-status__count')).toHaveTextContent('1');
    expect(within(orders).getByRole('link', { name: /Confirmed/i }).querySelector('.account-hub-status__count')).toBeNull();
  });

  it('reads the status filter from the URL when a shortcut lands on the orders page', async () => {
    await signInAsCustomer();
    renderApp('/orders?status=Shipped');

    const select = await screen.findByLabelText(/Filter by status/i) as HTMLSelectElement;
    expect(select.value).toBe('Shipped');
  });
});

describe('The store chat', () => {
  it('is not mounted for a signed-out visitor', async () => {
    renderApp('/products');
    await screen.findByRole('heading', { level: 1, name: 'Catalogue' });
    expect(screen.queryByTestId('chat-dock')).toBeNull();
  });

  it('opens the seeded support thread with the unread badge on the launcher', async () => {
    const user = userEvent.setup();
    await signInAsCustomer();
    renderApp('/orders');

    const launcher = await screen.findByRole('button', { name: 'Chat with NineCube' });
    await waitFor(() => expect(launcher.querySelector('.chat-launcher__badge')).toHaveTextContent('1'));

    await user.click(launcher);
    const panel = await screen.findByRole('dialog', { name: 'Chat with NineCube' });
    // The launcher unmounts while the panel is open so the two can never overlap on a phone.
    expect(screen.queryByRole('button', { name: 'Chat with NineCube' })).toBeNull();
    expect(within(panel).getByText('Do you deliver to Sylhet?')).toBeInTheDocument();
    expect(within(panel).getByText('We deliver to Sylhet in 2-3 working days.')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Close chat' })).toHaveFocus();
  });

  it('answers from the live catalogue and links the products it found', async () => {
    const user = userEvent.setup();
    await signInAsCustomer();
    renderApp('/orders');

    await user.click(await screen.findByRole('button', { name: 'Chat with NineCube' }));
    const panel = await screen.findByRole('dialog', { name: 'Chat with NineCube' });

    await user.type(within(panel).getByLabelText('Message'), 'Show me iphone');
    await user.click(within(panel).getByRole('button', { name: 'Send' }));

    // The assistant's answer is grounded in the products fixture, with a real link per match.
    await waitFor(() => expect(within(panel).getByText(/Here is what the catalogue has/i)).toBeInTheDocument());
    const matches = await within(panel).findAllByRole('link');
    expect(matches.map(link => link.getAttribute('href'))).toEqual(
      expect.arrayContaining(['/products/5', '/products/6', '/products/7'])
    );
  });

  it('asks for a policy instead of inventing catalogue rows when the answer is not a product', async () => {
    const user = userEvent.setup();
    await signInAsCustomer();
    renderApp('/orders');

    await user.click(await screen.findByRole('button', { name: 'Chat with NineCube' }));
    const panel = await screen.findByRole('dialog', { name: 'Chat with NineCube' });

    await user.type(within(panel).getByLabelText('Message'), 'What is the return policy?');
    await user.click(within(panel).getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(within(panel).getByText(/return window/i)).toBeInTheDocument());
    expect(within(panel).getByRole('link')).toHaveAttribute('href', '/policies/returns');
  });
});

describe('The chat dock shares the layer scale and clears the phone tab bar', () => {
  const app = read('src', 'styles', 'app.css');
  const tokens = read('src', 'styles', 'tokens.css');

  it('declares the phone tab bar height once and mounts the dock on the shared layer scale', () => {
    expect(tokens).toContain('--mobile-nav-h: 60px;');
    const dock = app.match(/\.chat-dock\s*\{[^}]*\}/)?.[0] ?? '';
    expect(dock).toContain('z-index: var(--z-menu)');
    expect(dock).not.toMatch(/z-index:\s*\d/);
  });

  it('keeps the launcher at a 56px touch target and the input at 16px so phones do not zoom', () => {
    const launcher = app.match(/\.chat-launcher\s*\{[^}]*\}/)?.[0] ?? '';
    expect(launcher).toContain('width: 56px');
    expect(launcher).toContain('height: 56px');
    const input = app.match(/\.chat-composer input\s*\{[^}]*\}/)?.[0] ?? '';
    expect(input).toContain('font-size: 16px');
  });

  it('parks the dock and the open sheet above the mobile tab bar on a phone', () => {
    const phone = app.slice(app.indexOf('@media (max-width: 640px)'));
    expect(phone).toContain('bottom: calc(var(--mobile-nav-h, 60px) + 12px + env(safe-area-inset-bottom, 0px))');
    expect(phone).toContain('inset: 8px 8px calc(var(--mobile-nav-h, 60px) + 8px + env(safe-area-inset-bottom, 0px))');
  });

  it('renders the chat under the shared card material so it reads as part of the system', () => {
    expect(read('src', 'components', 'ChatWidget.tsx')).toContain('className="chat-panel card-glass"');
  });
});
