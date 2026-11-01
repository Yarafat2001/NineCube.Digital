import { fireEvent, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { API } from './handlers';
import { server } from './server';
import { renderApp, seedSession, usersByRole } from './utils';

async function openGiftCardBuilder() {
  seedSession('Administrator');
  server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(usersByRole.Administrator)));
  renderApp('/admin');
  await screen.findByRole('heading', { name: /administration/i });
  fireEvent.click(await screen.findByRole('tab', { name: /gift cards/i }));
  await screen.findByTestId('giftcard-step-1');
}

describe('Gift card builder', () => {
  it('states the balance, recipient and validity each preset writes', async () => {
    await openGiftCardBuilder();

    const cards = await screen.findAllByRole('button', {
      name: /Birthday Gift|Eid Mubarak Gift|VIP Executive Reward|Welcome Bonus/
    });
    expect(cards).toHaveLength(4);

    const vip = cards.find(card => card.textContent?.includes('VIP Executive Reward'));
    expect(vip).toBeDefined();
    expect(vip).toHaveTextContent('BDT 5,000');
    expect(vip).toHaveTextContent('VIP Customer · 2 years');
  });

  it('blocks issuing and names the missing choice when the card has no value', async () => {
    await openGiftCardBuilder();

    fireEvent.change(screen.getByRole('spinbutton', { name: /gift card value/i }), { target: { value: '' } });

    expect(screen.getByRole('button', { name: /issue gift card/i })).toBeDisabled();
    expect(screen.getByText('Add a card value to continue')).toBeInTheDocument();
  });

  it('fills the whole card from a preset, mints a code and unlocks issuing', async () => {
    await openGiftCardBuilder();

    const eid = (await screen.findAllByRole('button', { name: /Eid Mubarak Gift/i }))[0];
    const birthday = screen.getByRole('button', { name: /Birthday Gift/i });
    fireEvent.click(eid);

    expect(screen.getByRole('spinbutton', { name: /gift card value/i })).toHaveValue(2500);
    expect(screen.getByPlaceholderText(/Sarah Ahmed/i)).toHaveValue('Eid Celebrant');
    expect(screen.getByPlaceholderText(/Happy Birthday/i)).toHaveValue('Eid Mubarak! May your celebration be filled with joy.');
    expect(screen.getByPlaceholderText(/GC-9K3D/i).value).toMatch(/^GC-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}$/);

    expect(eid).toHaveAttribute('aria-pressed', 'true');
    expect(birthday).toHaveAttribute('aria-pressed', 'false');

    expect(screen.getByRole('button', { name: /issue gift card/i })).toBeEnabled();
    expect(screen.getByText('Ready — this issues the card exactly as previewed.')).toBeInTheDocument();
    expect(screen.getByText(/366 days left|365 days left/)).toBeInTheDocument();
  });
});
