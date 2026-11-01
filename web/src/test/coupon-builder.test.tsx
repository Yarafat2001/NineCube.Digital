import { fireEvent } from '@testing-library/react';
import { screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { API } from './handlers';
import { server } from './server';
import { renderApp, seedSession, usersByRole } from './utils';

async function openCouponBuilder() {
  seedSession('Administrator');
  server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(usersByRole.Administrator)));
  renderApp('/admin');
  await screen.findByRole('heading', { name: /administration/i });
  fireEvent.click(await screen.findByRole('tab', { name: /coupons/i }));
  await screen.findByTestId('discount-step-1');
}

describe('Coupon & discount builder', () => {
  it('states the rule each quick template writes before it is applied', async () => {
    await openCouponBuilder();

    const cards = await screen.findAllByRole('button', {
      name: /10% Storewide Deal|20% Off Footwear|15% Off Apex|25% Off Duramo|10% Auto-Applied Deal|BDT 500 Off Cart/
    });
    expect(cards).toHaveLength(6);

    const footwear = cards.find(card => card.textContent?.includes('FOOTWEAR20'));
    expect(footwear).toBeDefined();
    expect(footwear).toHaveTextContent('20% Off Footwear (Category)');
    expect(footwear).toHaveTextContent('20% off');
    expect(footwear).toHaveTextContent('Category');
    expect(footwear).toHaveTextContent('BDT 1000+');
  });

  it('blocks the preview action and says what is still missing', async () => {
    await openCouponBuilder();

    expect(screen.getByRole('button', { name: /create coupon/i })).toBeDisabled();
    expect(screen.getByText('Add a code and a discount value to continue')).toBeInTheDocument();
  });

  it('fills the form, marks the chosen template and unlocks the preview action', async () => {
    await openCouponBuilder();

    const cards = await screen.findAllByRole('button', { name: /off footwear/i });
    const storewide = screen.getByRole('button', { name: /10% Storewide Deal/i });
    fireEvent.click(cards[0]);

    expect(screen.getByPlaceholderText(/summer25/i)).toHaveValue('FOOTWEAR20');
    expect(cards[0]).toHaveAttribute('aria-pressed', 'true');
    expect(storewide).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /create coupon/i })).toBeEnabled();
    expect(screen.getByText('Ready — this creates the coupon exactly as previewed.')).toBeInTheDocument();
  });
});
