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
const assistantDock = read('src', 'components', 'home', 'AssistantDock.tsx');
const signInPrompt = read('src', 'components', 'home', 'HomeSignInPrompt.tsx');
const chatWidget = read('src', 'components', 'ChatWidget.tsx');

beforeEach(() => resetAccountFixtures());

async function signInAsCustomer() {
  const user = seedSession('Customer');
  server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(user)));
}

/** The customer's only conversation has no staff message, so the automated responder owns the thread. */
function giveCustomerAnUnansweredConversation() {
  server.use(http.get(`${API}/api/chat/conversations`, () => HttpResponse.json([
    {
      id: 9, subject: 'Delivery question', status: 'open',
      createdAt: '2026-10-29T09:00:00Z', updatedAt: '2026-10-29T09:00:00Z',
      lastMessage: { body: 'Do you ship to Chattogram?', authorKind: 'customer', createdAt: '2026-10-29T09:00:00Z' },
      unreadCount: 0
    }
  ])));
}

describe('Round 31: the assistant is a public corner launcher', () => {
  it('mounts the dock only on the storefront home, with the spark, the hint and the pulse ring', () => {
    expect(read('src', 'App.tsx')).toContain('{isShowcase ? <AssistantDock /> : null}');
    expect(assistantDock).toContain('data-testid="assistant-dock"');
    expect(assistantDock).toContain('assistant-dock__hint');
    expect(assistantDock).toContain("t('Chat with me')");
    expect(assistantDock).toContain('assistant-launcher__ring');
    expect(assistantDock).toContain('Icon name="spark"');
    expect(assistantDock).toContain('assistant-dock--above');
  });

  it('declares the bob, the ring pulse and the hint slide, and stills all three under reduced motion', () => {
    expect(app).toContain('.assistant-dock { position: fixed; inset-inline-end: 18px; bottom: 18px;');
    expect(app).toContain('.assistant-dock--above { bottom: calc(18px + 56px + 12px); }');
    expect(app).toContain('.assistant-launcher { position: relative; width: 56px; height: 56px;');
    expect(app).toContain('animation: assistant-bob 2.6s ease-in-out 3;');
    expect(app).toContain('animation: assistant-ring 2.6s ease-out infinite;');
    expect(app).toContain('animation: assistant-hint-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;');
    expect(app).toContain('@keyframes assistant-bob');
    expect(app).toContain('@keyframes assistant-ring');
    expect(app).toContain('@keyframes assistant-hint-in');
    expect(app).toContain('.assistant-launcher:hover, .assistant-launcher:focus-visible { animation-play-state: paused; }');
    expect(app).toContain('.assistant-launcher, .assistant-launcher__ring, .assistant-dock__hint { animation: none; }');
    expect(app).toContain('.assistant-dock__hint::after {');
  });

  it('answers a signed-out guest from the panel, with the live catalogue grounding intact', async () => {
    const user = userEvent.setup();
    renderApp('/');

    const dock = await screen.findByTestId('assistant-dock');
    expect(within(dock).getByTestId('assistant-hint')).toHaveTextContent('Chat with me');
    expect(document.querySelector('.assistant-dock--above')).toBeNull();

    await user.click(within(dock).getByRole('button', { name: 'Chat with me' }));
    const panel = await screen.findByRole('dialog', { name: 'Ask the store assistant' });
    expect(screen.queryByTestId('assistant-hint')).toBeNull();
    expect(within(panel).getByRole('button', { name: 'Close chat' })).toHaveFocus();

    await user.type(within(panel).getByLabelText('Message'), 'Show me iphone');
    await user.click(within(panel).getByRole('button', { name: 'Ask' }));

    await waitFor(() => expect(screen.getByText(/Here is what the catalogue has/i)).toBeInTheDocument());
    const answer = screen.getByTestId('home-assistant-answer');
    expect(within(answer).getByText('Answered from the live catalogue')).toBeInTheDocument();
    const links = [...document.querySelectorAll('.home-assistant__match')].map((link) => link.getAttribute('href'));
    expect(links).toEqual(expect.arrayContaining(['/products/5', '/products/6', '/products/7']));
  });

  it('says so in the thread when the assistant is not reachable, instead of spinning', async () => {
    const user = userEvent.setup();
    server.use(http.post(`${API}/api/chat/assistant`, () => HttpResponse.json({ message: 'Down' }, { status: 503 })));
    renderApp('/');

    const dock = await screen.findByTestId('assistant-dock');
    await user.click(within(dock).getByRole('button', { name: 'Chat with me' }));
    await screen.findByRole('dialog', { name: 'Ask the store assistant' });

    await user.type(screen.getByLabelText('Message'), 'Show me iphone');
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    const error = await screen.findByTestId('home-assistant-error');
    expect(error).toHaveTextContent(/not available right now/i);
  });
});

describe('Round 31: the support chat answers common questions automatically', () => {
  it('greets the customer instantly in a conversation the staff has not joined', async () => {
    const user = userEvent.setup();
    await signInAsCustomer();
    giveCustomerAnUnansweredConversation();
    renderApp('/orders');

    await user.click(await screen.findByRole('button', { name: 'Chat with NineCube' }));
    await screen.findByRole('dialog', { name: 'Chat with NineCube' });

    await user.type(screen.getByLabelText('Message'), 'Hi there');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(screen.getByText(/Hello, and welcome to NineCube support/i)).toBeInTheDocument());
    const bubble = screen.getByText(/Hello, and welcome to NineCube support/i).closest('.chat-bubble') as HTMLElement;
    expect(bubble.classList.contains('chat-bubble--assistant')).toBe(true);
    expect(within(bubble).getByText('Automated answer')).toBeInTheDocument();
  });

  it('quotes the stored delivery policy when the question is about shipping', async () => {
    const user = userEvent.setup();
    await signInAsCustomer();
    giveCustomerAnUnansweredConversation();
    renderApp('/orders');

    await user.click(await screen.findByRole('button', { name: 'Chat with NineCube' }));
    await screen.findByRole('dialog', { name: 'Chat with NineCube' });

    await user.type(screen.getByLabelText('Message'), 'Do you deliver to Chattogram?');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(screen.getByText(/From our delivery & shipping policy/i)).toBeInTheDocument());
    expect(screen.getByText(/Standard delivery is BDT 60/i)).toBeInTheDocument();
    expect(document.querySelectorAll('.chat-bubble__auto').length).toBe(1);
  });

  it('stays quiet once a staff member has replied, so a human keeps the thread', async () => {
    const user = userEvent.setup();
    await signInAsCustomer();
    renderApp('/orders');

    await user.click(await screen.findByRole('button', { name: 'Chat with NineCube' }));
    await screen.findByRole('dialog', { name: 'Chat with NineCube' });

    await user.type(screen.getByLabelText('Message'), 'Hi there');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    // The seeded conversation already carries a staff reply, so only the customer bubble comes back.
    await waitFor(() => expect(screen.getByText('Hi there')).toBeInTheDocument());
    expect(screen.queryByText(/Hello, and welcome to NineCube support/i)).toBeNull();
    expect(document.querySelector('.chat-bubble__auto')).toBeNull();
  });

  it('marks the automated bubble in the stylesheet and the support panel code', () => {
    expect(chatWidget).toContain("message.authorKind === 'assistant'");
    expect(chatWidget).toContain("t('Automated answer')");
    expect(app).toContain('.chat-bubble--assistant { background: var(--surface);');
    expect(app).toContain('.chat-bubble__auto {');
  });
});

describe('Round 31: the home sign-in alert is alive', () => {
  it('adds an animated gradient heading and a travelling shine over the strip', () => {
    expect(signInPrompt).toContain('home-signin-prompt__heading');
    expect(signInPrompt).toContain("t('Welcome to NineCube')");
    expect(home).toContain('.home-signin-prompt { position: relative; overflow: hidden;');
    expect(home).toContain('.home-signin-prompt::after {');
    expect(home).toContain('.home-signin-prompt__heading {');
    expect(home).toContain('background-clip: text');
    expect(home).toContain('@keyframes prompt-in');
    expect(home).toContain('@keyframes prompt-shine');
    expect(home).toContain('@keyframes prompt-gradient');
    expect(home).toContain('@keyframes prompt-icon');
    expect(home).toContain('.home-signin-prompt__cta:hover {');
    expect(home).toContain('.home-signin-prompt__copy {');
  });

  it('keeps the strip still and the CTA flat under reduced motion', () => {
    expect(home).toContain('.home-signin-prompt, .home-signin-prompt::after, .home-signin-prompt__icon, .home-signin-prompt__heading { animation: none; }');
    expect(home).toContain('.home-signin-prompt__cta:hover { transform: none; box-shadow: var(--shadow-sm); }');
  });

  it('wraps the copy on a phone so the CTA and dismiss stay on one row', () => {
    const phone = home.slice(home.indexOf('@media (max-width: 640px)'));
    expect(phone).toContain('.home-signin-prompt__copy { flex: 1 1 calc(100% - 56px); }');
    expect(phone).toContain('.home-signin-prompt__cta { margin-left: 48px; }');
  });

  it('shows the animated welcome heading to guests alongside the real benefits', async () => {
    renderApp('/');
    const prompt = await screen.findByTestId('home-signin-prompt');
    expect(within(prompt).getByRole('heading', { name: 'Welcome to NineCube' })).toBeInTheDocument();
    expect(within(prompt).getByText(/track your orders, keep your wishlist and use gift cards/i)).toBeInTheDocument();
    expect(within(prompt).getByRole('link', { name: 'Sign in or Register' })).toHaveAttribute('href', expect.stringMatching(/#?\/login$/));
  });
});
