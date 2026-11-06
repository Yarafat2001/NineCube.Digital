import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Notification } from '../api/types';
import { API, resetAccountFixtures } from './handlers';
import { server } from './server';
import { renderApp, seedSession } from './utils';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8');

// The backend now emits NotificationType.ChatMessage (value 5) with link "/chat". Before this
// round the frontend had no entry for it, so the bell popover, the account dashboard and the
// notifications page all crashed on a live notification.
const chatNotif: Notification = {
  id: 90,
  type: 'ChatMessage',
  title: 'New chat reply',
  body: 'Support replied in "Delivery in Sylhet": We deliver to Sylhet in 2-3 working days.',
  link: '/chat',
  isRead: false,
  createdAt: '2026-11-06T09:00:00Z',
  readAt: null
};

beforeEach(() => resetAccountFixtures());

async function signInAsCustomer() {
  const user = seedSession('Customer');
  server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(user)));
}

function serveChatNotification() {
  server.use(http.get(`${API}/api/notifications`, () => HttpResponse.json({
    items: [chatNotif], page: 1, pageSize: 20, totalCount: 1, totalPages: 1, hasNext: false, hasPrevious: false
  })));
  server.use(http.get(`${API}/api/notifications/unread-count`, () => HttpResponse.json({ count: 1 })));
}

describe('A ChatMessage notification renders instead of crashing', () => {
  it('shows the bell popover with an Open chat action', async () => {
    const user = userEvent.setup();
    await signInAsCustomer();
    serveChatNotification();
    renderApp('/');

    await user.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));
    const panel = await screen.findByRole('dialog', { name: 'Notifications' });
    expect(within(panel).getByText('New chat reply')).toBeInTheDocument();
    expect(within(panel).getByText('✉')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Open chat' })).toBeInTheDocument();
  });

  it('opens the support-only chat panel from the bell', async () => {
    const user = userEvent.setup();
    await signInAsCustomer();
    serveChatNotification();
    renderApp('/');

    await user.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));
    const panel = await screen.findByRole('dialog', { name: 'Notifications' });
    await user.click(within(panel).getByRole('button', { name: 'Open chat' }));

    const chat = await screen.findByRole('dialog', { name: 'Chat with NineCube' });
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).toBeNull();
    // Round 30 split the chats: the dock panel is support only, with no assistant tab.
    expect(within(chat).queryByRole('tablist')).toBeNull();
    expect(within(chat).getByPlaceholderText('Write to the support team')).toBeInTheDocument();
  });

  it('renders the dashboard notification list with the chat glyph', async () => {
    await signInAsCustomer();
    server.use(http.get(`${API}/api/me/dashboard`, () => HttpResponse.json({
      totalOrders: 0,
      ordersByStatus: ['Pending', 'Confirmed', 'Shipped', 'Cancelled', 'Rejected'].map(status => ({ status, count: 0 })),
      totalSpent: 0, currency: 'BDT', totalItems: 0,
      recentOrders: [], recentNotifications: [chatNotif], unreadNotifications: 1
    })));
    renderApp('/account');

    expect(await screen.findByRole('heading', { level: 1, name: /Dashboard|Account/i })).toBeInTheDocument();
    expect(screen.getByText('New chat reply')).toBeInTheDocument();
    expect(screen.getByText('✉')).toBeInTheDocument();
  });

  it('renders the notifications page row with an Open chat button that opens the panel', async () => {
    const user = userEvent.setup();
    await signInAsCustomer();
    serveChatNotification();
    renderApp('/notifications');

    expect(await screen.findByText('New chat reply')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open chat' }));
    const chat = await screen.findByRole('dialog', { name: 'Chat with NineCube' });
    expect(within(chat).queryByRole('tablist')).toBeNull();
    expect(within(chat).getByPlaceholderText('Write to the support team')).toBeInTheDocument();
  });
});

describe('The chat panel and launcher never share the corner', () => {
  it('unmounts the launcher while the panel is open', async () => {
    const user = userEvent.setup();
    await signInAsCustomer();
    renderApp('/orders');

    await user.click(await screen.findByRole('button', { name: 'Chat with NineCube' }));
    await screen.findByRole('dialog', { name: 'Chat with NineCube' });
    expect(screen.queryByRole('button', { name: 'Chat with NineCube' })).toBeNull();
    // The close control takes focus so Escape and Enter work without a search.
    expect(screen.getByRole('button', { name: 'Close chat' })).toHaveFocus();
  });
});

describe('The product card chips are solid, not glass', () => {
  const app = read('src', 'styles', 'app.css');
  const block = (css: string, selector: string) => {
    const match = css.match(new RegExp(`${selector}\\s*\\{[^}]*\\}`));
    if (!match) throw new Error(`${selector} block not found`);
    return match[0];
  };
  const wishlist = block(app, '\\.product-card__wishlist-btn');
  const quickView = block(app, '\\.product-card__quick-view-btn');

  it('gives both overlay chips an opaque surface and a visible edge', () => {
    // --surface-glass is 62% white in light mode, so frosted chips dissolved into white product
    // photos. Both chips now sit on the solid surface with a strong border.
    for (const chip of [wishlist, quickView]) {
      expect(chip).toContain('background: var(--surface)');
      expect(chip).toContain('border: 1px solid var(--border-strong)');
      expect(chip).not.toContain('backdrop-filter');
    }
  });
});

describe('The account destinations have one owner: the dashboard sidebar', () => {
  const nav = read('src', 'components', 'AccountNav.tsx');
  const app = read('src', 'styles', 'app.css').replace(/\s+/g, ' ');

  const INNER_ROUTES: [string, string][] = [
    ['/account/profile', 'Profile'],
    ['/orders', 'Orders'],
    ['/wishlist', 'Wishlist'],
    ['/gift-cards', 'Gift Cards'],
    ['/notifications', 'Notifications'],
    ['/account/security', 'Security']
  ];

  // Round 33 replaced the rail this round added: the dashboard docks the destination list beside
  // its own content, and the pages it links to carry one way back rather than a second copy.
  it('lists every destination once, beside the dashboard content', async () => {
    await signInAsCustomer();
    renderApp('/account');

    const sidebar = await screen.findByRole('navigation', { name: 'Account Navigation' });
    expect(document.querySelectorAll('.account-nav-list')).toHaveLength(1);
    expect(within(sidebar).getAllByRole('link')).toHaveLength(8);
    expect(within(sidebar).getByRole('button', { name: /log out/i })).toBeInTheDocument();
    // Browse products went with the hover panel; the navbar tab owns that route.
    expect(within(sidebar).queryByRole('link', { name: /browse products/i })).not.toBeInTheDocument();
  });

  it('gives the inner pages a back link and no list of their own', async () => {
    await signInAsCustomer();
    for (const [route, heading] of INNER_ROUTES) {
      const view = renderApp(route);
      await screen.findByRole('heading', { level: 1 });
      expect(document.querySelectorAll('.account-nav-list'), `${route} grew a second list`).toHaveLength(0);

      const back = screen.getByRole('link', { name: /back to dashboard/i });
      expect(back).toHaveAttribute('href', expect.stringMatching(/#?\/account$/));
      expect(back).toBeVisible();
      // The page itself still reads as itself.
      expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(new RegExp(heading, 'i'));
      view.unmount();
    }
  });

  it('moves one measured indicator instead of scrolling a chip into view', () => {
    // The phone rail had to scroll its active chip into view; a docked column has nothing to
    // scroll, so the active state is one dot whose offset is read from the row.
    expect(nav).toContain('active.offsetTop');
    expect(nav).not.toContain('scrollLeft');
    expect(app).toContain('--spot-y: 0px; --spot-h: 0px; position: absolute;');
    expect(app).toContain('transform: translateY(calc(var(--spot-y, 0px) + var(--spot-h, 0px) / 2 - 3.5px));');
    expect(app).toContain('transition: transform var(--transition-slow), opacity var(--transition);');
  });

  it('declares the docked layout and the selected fill in the stylesheet', () => {
    expect(app).toContain('.account-dashboard > .account-nav-list { grid-area: nav; }');
    expect(app).toContain('grid-template-columns: var(--sidebar-width) minmax(0, 1fr)');
    expect(app).toContain('.account-nav-list { position: sticky;');
    const activeBlock = app.match(/\.account-nav-row--active\s*\{[^}]*\}/)?.[0] ?? '';
    expect(activeBlock).toContain('var(--selected-bg)');
    expect(activeBlock).toContain('var(--accent-text)');
  });
});

describe('The home page motion is guarded and grounded', () => {
  const homeCss = read('src', 'styles', 'home.css');
  const reveal = read('src', 'components', 'home', 'Reveal.tsx');
  const fallback = read('src', 'helix', 'ShowcaseFallback.tsx');

  it('reveals every section even where IntersectionObserver is missing, as in jsdom', async () => {
    renderApp('/');
    await screen.findByTestId('showcase-fallback-reason');
    await waitFor(() => {
      const total = document.querySelectorAll('.reveal').length;
      expect(total).toBeGreaterThan(0);
      expect(document.querySelectorAll('.reveal[data-revealed]')).toHaveLength(total);
    });
  });

  it('turns the entrance off for reduced-motion readers', () => {
    expect(reveal).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    expect(reveal).toContain("typeof IntersectionObserver === 'undefined'");
    expect(homeCss).toContain('@keyframes hero-aurora');
    expect(homeCss).toContain('.reveal[data-revealed]');
    expect(homeCss).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\.reveal/);
  });

  it('links every showcase collection card to a search the catalogue can answer', () => {
    expect(fallback).toContain('data-testid="showcase-grid"');
    expect(fallback).toContain('to={`/products?q=${encodeURIComponent(cardCategories[card.index])}`}');
    expect(fallback).toContain('aria-label={`${t("Browse products")}:');
  });

  it('handles every notification type the backend can emit, and unknown ones politely', () => {
    const helpers = read('src', 'lib', 'helpers.ts');
    expect(helpers).toContain("ChatMessage: { label: 'Chat message', glyph: '✉', tone: 'info' }");
    expect(helpers).toContain("?? { label: 'Message', glyph: '✉', tone: 'info' }");
    expect(helpers).toContain("window.dispatchEvent(new CustomEvent('ninecube:open-chat'))");
  });
});
