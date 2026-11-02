import { fireEvent, screen, within } from '@testing-library/react';
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

  it('selects a coupon row on click and opens the editor on double click', async () => {
    server.use(http.get(`${API}/api/coupons`, () => HttpResponse.json([coupon({})])));
    await openRegistry('Coupons');

    const row = within(await screen.findByRole('table')).getByText('SAVE10').closest('tr') as HTMLElement;
    expect(row.className).toContain('registry-row');

    fireEvent.click(row);
    expect(row).toHaveAttribute('data-selected', 'true');
    expect(screen.queryByRole('heading', { name: /edit coupon/i })).toBeNull();

    fireEvent.doubleClick(row);
    expect(await screen.findByRole('heading', { name: /edit coupon/i })).toBeInTheDocument();
  });

  it('leaves a click on a row control to that control instead of selecting the row', async () => {
    server.use(http.get(`${API}/api/coupons`, () => HttpResponse.json([coupon({})])));
    await openRegistry('Coupons');

    const checkbox = await screen.findByRole('checkbox', { name: /Select coupon SAVE10/i });
    fireEvent.click(checkbox);

    const row = checkbox.closest('tr') as HTMLElement;
    expect(row).toHaveAttribute('data-selected', 'true');
    expect(checkbox).toBeChecked();
  });

  it('finds a coupon by code without emptying the registry', async () => {
    server.use(http.get(`${API}/api/coupons`, () => HttpResponse.json([
      coupon({ id: 1, code: 'SAVE10' }),
      coupon({ id: 2, code: 'EID2026', campaignTitle: 'Eid Mega Sale' })
    ])));
    await openRegistry('Coupons');

    const table = await screen.findByRole('table');
    expect(within(table).getByText('EID2026')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: /search coupons/i }), { target: { value: 'eid' } });
    expect(within(table).queryByText('SAVE10')).toBeNull();
    expect(within(table).getByText('EID2026')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /1 \/ 2/ })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: /search coupons/i }), { target: { value: 'Mega' } });
    expect(within(table).getByText('EID2026')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: /search coupons/i }), { target: { value: 'zzzz' } });
    expect(await screen.findByText('No coupon matches that search.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /0 \/ 2/ })).toBeInTheDocument();
  });

  it('narrows the coupon registry by state with the same segmented control as the builder', async () => {
    server.use(http.get(`${API}/api/coupons`, () => HttpResponse.json([
      coupon({ id: 1, code: 'SAVE10' }),
      coupon({ id: 2, code: 'OFFLINE', isActive: false }),
      coupon({ id: 3, code: 'LAPSED', expiresAt: '2020-01-01T00:00:00Z' })
    ])));
    await openRegistry('Coupons');

    const group = screen.getByRole('group', { name: /coupon status/i });
    expect(group.className).toContain('segmented');

    const table = await screen.findByRole('table');
    const press = (name: string) => {
      const option = within(group).getByRole('button', { name });
      fireEvent.click(option);
      expect(option).toHaveAttribute('aria-pressed', 'true');
      return option;
    };

    press('Disabled');
    expect(within(table).getByText('OFFLINE')).toBeInTheDocument();
    expect(within(table).queryByText('SAVE10')).toBeNull();

    press('Expired');
    expect(within(table).getByText('LAPSED')).toBeInTheDocument();

    press('All');
    expect(within(table).getByText('SAVE10')).toBeInTheDocument();
  });

  it('brings the gift card registry onto the same search and state bar', async () => {
    server.use(http.get(`${API}/api/gift-cards`, () => HttpResponse.json([
      giftCard({ id: 1, code: 'GC-LIVE-0000-1000', recipientName: 'Ayesha Rahman' }),
      giftCard({ id: 2, code: 'GC-OFF-0000-1000', recipientName: 'Bilal Hossain', isActive: false })
    ])));
    await openRegistry('Gift Cards');

    const group = screen.getByRole('group', { name: /gift card status/i });
    expect(group.className).toContain('segmented');

    const table = await screen.findByRole('table');
    const search = screen.getByRole('searchbox', { name: /search gift cards/i });

    // The registry masks the code on screen, so match on the recipient the row shows.
    fireEvent.change(search, { target: { value: 'GC-OFF' } });
    expect(within(table).getByText('Bilal Hossain')).toBeInTheDocument();
    expect(within(table).queryByText('Ayesha Rahman')).toBeNull();

    fireEvent.change(search, { target: { value: 'zzzz' } });
    expect(await screen.findByText('No gift card matches that search.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^clear$/i }));
    expect(within(table).getByText('Ayesha Rahman')).toBeInTheDocument();
  });
});
