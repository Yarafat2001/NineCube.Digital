import { fireEvent, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { API } from './handlers';
import { server } from './server';
import { renderApp, seedSession, usersByRole } from './utils';

const EMOJI = /\p{Extended_Pictographic}/u;

const giftCard = (over: Record<string, unknown>) => ({
  id: 1, code: 'GC-AAAA-BBBB-1000', initialBalance: 1000, currentBalance: 1000, currency: 'BDT',
  recipientEmail: null, recipientName: 'Valued Customer', note: null, isActive: true,
  expiresAt: '2027-10-31T00:00:00Z', createdAt: '2026-10-31T00:00:00Z', lastUsedAt: null, ...over
});

const coupon = (over: Record<string, unknown>) => ({
  id: 1, code: 'SAVE10', discountType: 'Percentage', discountValue: 10, minOrderAmount: 0,
  maxDiscountCap: null, targetType: 'Order', targetId: null, startsAt: null, expiresAt: null,
  usageLimit: null, usageCount: 0, isActive: true, isAutomatic: false, campaignTitle: null,
  isBannerPromoted: false, createdAt: '2026-10-15T08:00:00Z', ...over
});

async function openRegistry(tab: 'Coupons' | 'Gift Cards') {
  seedSession('Administrator');
  server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(usersByRole.Administrator)));
  renderApp('/admin');
  await screen.findByRole('heading', { name: /administration/i });
  fireEvent.click(await screen.findByRole('tab', { name: new RegExp(tab, 'i') }));
}

describe('Admin registry tables', () => {
  it('puts both registries on the same table plate', async () => {
    server.use(
      http.get(`${API}/api/gift-cards`, () => HttpResponse.json([giftCard({})])),
      http.get(`${API}/api/coupons`, () => HttpResponse.json([coupon({})]))
    );
    await openRegistry('Gift Cards');

    const giftTable = await screen.findByRole('table');
    expect(giftTable.closest('.table-surface')).not.toBeNull();
    expect(giftTable.closest('.card-glass')).toBeNull();
  });

  it('keeps colour emoji out of the code and scope cells', async () => {
    server.use(
      http.get(`${API}/api/gift-cards`, () => HttpResponse.json([giftCard({})])),
      http.get(`${API}/api/coupons`, () => HttpResponse.json([
        coupon({ id: 4, code: 'EID2026', targetType: 'Category', targetId: 1 }),
        coupon({ id: 1, code: 'SAVE10' })
      ]))
    );
    await openRegistry('Coupons');

    const table = await screen.findByRole('table');
    const scopeCells = [...table.querySelectorAll('td')].filter(td => /All products|Footwear|Category/.test(td.textContent ?? ''));
    expect(scopeCells.length).toBeGreaterThan(0);
    scopeCells.forEach(cell => expect(cell.textContent).not.toMatch(EMOJI));
  });

  it('gives every status badge a glyph and the same tone to the same state', async () => {
    server.use(
      http.get(`${API}/api/gift-cards`, () => HttpResponse.json([
        giftCard({ id: 1, code: 'GC-LIVE-0000-1000' }),
        giftCard({ id: 2, code: 'GC-OFF-0000-1000', isActive: false }),
        giftCard({ id: 3, code: 'GC-SPENT-0000-0000', currentBalance: 0 }),
        giftCard({ id: 4, code: 'GC-LAPSED-000-0000', expiresAt: '2020-01-01T00:00:00Z' })
      ])),
      http.get(`${API}/api/coupons`, () => HttpResponse.json([
        coupon({ id: 1, code: 'SAVE10' }),
        coupon({ id: 2, code: 'OFFLINE', isActive: false })
      ]))
    );
    await openRegistry('Gift Cards');

    const giftTable = await screen.findByRole('table');
    const badges = [...giftTable.querySelectorAll('td .badge')];
    expect(badges.length).toBe(4);
    badges.forEach(badge => expect(badge.querySelector('.badge__glyph')).not.toBeNull());

    const tone = (label: string) =>
      [...badges].find(b => b.textContent?.includes(label))?.className ?? '';
    expect(tone('Active')).toContain('badge--ok');
    expect(tone('Disabled')).toContain('badge--neutral');
    expect(tone('Expired')).toContain('badge--danger');
    expect(tone('Depleted')).toContain('badge--neutral');

    fireEvent.click(screen.getByRole('tab', { name: /coupons/i }));
    const couponTable = await screen.findByRole('table');
    const disabled = [...couponTable.querySelectorAll('td .badge')].find(b => b.textContent?.includes('Disabled'));
    expect(disabled?.className).toContain('badge--neutral');
    expect(disabled?.querySelector('.badge__glyph')).not.toBeNull();
  });

  it('lights the selection counter instead of dropping its pill', async () => {
    server.use(http.get(`${API}/api/gift-cards`, () => HttpResponse.json([giftCard({})])));
    await openRegistry('Gift Cards');

    const chip = await screen.findByText(/selected/i);
    expect(chip.className).toContain('badge--neutral');

    fireEvent.click(await screen.findByRole('checkbox', { name: /Select gift card GC-AAAA-BBBB-1000/i }));
    expect(chip.className).toContain('badge--primary');
  });
});
