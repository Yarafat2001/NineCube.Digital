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
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');
const flat = (css: string) => css.replace(/\s+/g, ' ');

const app = flat(read('src', 'styles', 'app.css'));
const home = flat(read('src', 'styles', 'home.css'));
const chatWidget = read('src', 'components', 'ChatWidget.tsx');
const signInPrompt = read('src', 'components', 'home', 'HomeSignInPrompt.tsx');
const fallback = read('src', 'helix', 'ShowcaseFallback.tsx');

beforeEach(() => resetAccountFixtures());

async function signInAsCustomer() {
  const user = seedSession('Customer');
  server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(user)));
}

describe('Round 30: the dock chat is support only', () => {
  it('drops the mode tabs, the assistant wording and the match cards from the panel', () => {
    expect(chatWidget).not.toContain('chat-panel__modes');
    expect(chatWidget).not.toContain('role="tab"');
    expect(chatWidget).not.toContain('SUGGESTED_QUESTIONS');
    expect(chatWidget).not.toContain('useAskAssistant');
    expect(chatWidget).not.toContain('chat-match');
    expect(chatWidget).toContain("window.addEventListener('ninecube:open-chat'");
    expect(chatWidget).toContain('placeholder={t(\'Write to the support team\')}');
  });
});

describe('Round 30: the assistant lives on the home screen', () => {
  it('mounts the assistant dock in the storefront and keeps the guest sign-in prompt in the fallback', () => {
    expect(read('src', 'App.tsx')).toContain('<AssistantDock />');
    expect(fallback).toContain('<HomeSignInPrompt />');
    expect(fallback).not.toContain('<HomeAssistant />');
  });

  it('gives guests the public corner launcher instead of a sign-in gate', async () => {
    renderApp('/');
    const dock = await screen.findByTestId('assistant-dock');
    expect(within(dock).getByTestId('assistant-hint')).toHaveTextContent('Chat with me');
    expect(screen.queryByTestId('home-assistant-guest')).toBeNull();
    expect(document.querySelector('.assistant-dock--above')).toBeNull();
  });

  it('gives signed-in customers the live stage: chips, thinking, an answer and grounded match cards', async () => {
    const user = userEvent.setup();
    await signInAsCustomer();
    renderApp('/');

    await user.click(await screen.findByRole('button', { name: 'Chat with me' }));
    const stage = await screen.findByTestId('home-assistant-stage');
    expect(document.querySelector('.assistant-dock--above')).not.toBeNull();
    expect(within(stage).getAllByRole('listitem').map((chip) => chip.textContent)).toEqual(
      expect.arrayContaining(['Show me laptops', 'Where is my order?', 'What is the return policy?'])
    );

    await user.type(screen.getByLabelText('Message'), 'Show me iphone');
    await user.click(within(stage).getByRole('button', { name: 'Ask' }));

    await waitFor(() => expect(screen.getByText(/Here is what the catalogue has/i)).toBeInTheDocument());
    const answer = screen.getByTestId('home-assistant-answer');
    expect(within(answer).getByText('Answered from the live catalogue')).toBeInTheDocument();
    const links = [...document.querySelectorAll('.home-assistant__match')].map((link) => link.getAttribute('href'));
    expect(links).toEqual(expect.arrayContaining(['/products/5', '/products/6', '/products/7']));
  });

  it('declares the live pulse, the thinking dots and the answer reveal, all reduced-motion safe', () => {
    expect(home).toContain('.home-assistant__live {');
    expect(home).toContain('@keyframes assistant-live');
    expect(home).toContain('@keyframes assistant-dot');
    expect(home).toContain('@keyframes assistant-answer-in');
    expect(home).toContain('.home-assistant__dots i { animation: none; }');
    expect(home).toContain('.home-assistant__answer { animation: none; }');
    expect(home).toContain('.home-assistant__live { animation: none; }');
  });
});

describe('Round 30: the home sign-in prompt follows the reference sites', () => {
  it('shows the strip to guests with one pill CTA and real account benefits only', async () => {
    renderApp('/');
    const prompt = await screen.findByTestId('home-signin-prompt');
    expect(within(prompt).getByText(/track your orders, keep your wishlist and use gift cards/i)).toBeInTheDocument();
    expect(within(prompt).getByRole('link', { name: 'Sign in or Register' })).toHaveAttribute('href', expect.stringMatching(/#?\/login$/));
  });

  it('dismisses for the session and never appears for signed-in customers', async () => {
    const user = userEvent.setup();
    const guestView = renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('home-signin-prompt')).toBeNull();
    expect(signInPrompt).toContain('ninecube-home-signin-dismissed');
    guestView.unmount();

    await signInAsCustomer();
    renderApp('/');
    await screen.findByTestId('assistant-dock');
    expect(screen.queryByTestId('home-signin-prompt')).toBeNull();
  });
});

describe('Round 30: the account hub reads as the reference list', () => {
  it('renders the identity header, one list of icon rows and log out last', async () => {
    await signInAsCustomer();
    server.use(http.get(`${API}/api/me/dashboard`, () => HttpResponse.json({
      totalOrders: 0,
      ordersByStatus: ['Pending', 'Confirmed', 'Shipped', 'Cancelled', 'Rejected'].map(status => ({ status, count: 0 })),
      totalSpent: 0, currency: 'BDT', totalItems: 0,
      recentOrders: [], recentNotifications: [], unreadNotifications: 1
    })));
    renderApp('/account');

    await screen.findByRole('heading', { level: 1, name: /Dashboard|Account/i });
    const profile = document.querySelector('.account-profile-card');
    expect(profile).not.toBeNull();
    expect(profile?.querySelector('.account-profile-card__pill')).toHaveTextContent('Customer');

    const list = document.querySelector('.account-nav-list');
    expect(list).not.toBeNull();
    expect(list?.querySelectorAll('.account-nav-row').length).toBe(9);
    expect(list?.querySelectorAll('.account-nav-row__chevron').length).toBe(9);
    expect(list?.querySelector('.account-nav-row__badge')).toHaveTextContent('1');
    expect(list?.querySelector('.account-nav-row--logout')).toHaveTextContent('Log out');
    expect(document.querySelector('.account-hub-tile')).toBeNull();
    expect(document.querySelector('.quick-actions')).toBeNull();
  });

  it('keeps the amber row hover and the two-group divider in the stylesheet', () => {
    expect(app).toContain('.account-nav-row:hover { background: var(--selected-bg); }');
    expect(app).toContain('.account-nav-list__group + .account-nav-list__group { border-top: 1px solid var(--border); }');
    expect(app).toContain('.account-nav-row__chevron {');
  });
});

describe('Round 30: the mobile card chips clear the badge zone and stay solid', () => {
  it('pins the pair to the badge-free bottom corner with the solid surface re-asserted over the mobile glass sheet', () => {
    expect(app).toContain(':root .product-card__actions-overlay { flex-direction: row; top: auto; bottom: 8px;');
    expect(app).toContain('position: relative; background: var(--surface) !important; border: 1px solid var(--border-strong) !important;');
    expect(app).toContain(':root .product-card__wishlist-btn--active { background: rgba(239, 68, 68, 0.16) !important;');
  });

  it('keeps the unpainted 44px collar intact under the new corner', () => {
    expect(app).toContain(':root .product-card__wishlist-btn::after, :root .product-card__quick-view-btn::after { content: ""; position: absolute; inset: -6px; }');
  });
});
