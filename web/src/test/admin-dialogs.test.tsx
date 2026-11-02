import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { API } from './handlers';
import { server } from './server';
import { renderApp, seedSession, usersByRole } from './utils';

const EMOJI = /\p{Extended_Pictographic}/u;

/**
 * The dialog's own wording, minus the live reach panel. Campaign titles are shop data — the storefront
 * writes them with marketing emoji — so they must not be judged as interface chrome.
 */
function chromeText(dialog: HTMLElement) {
  const clone = dialog.cloneNode(true) as HTMLElement;
  clone.querySelector('[data-testid="scope-impact"]')?.remove();
  return clone.textContent ?? '';
}

const coupon = (over: Record<string, unknown> = {}) => ({
  id: 1, code: 'SAVE10', discountType: 'Percentage', discountValue: 10, minOrderAmount: 0,
  maxDiscountCap: 1500, targetType: 'Order', targetId: null, startsAt: null, expiresAt: null,
  usageLimit: null, usageCount: 0, isActive: true, isAutomatic: false, campaignTitle: null,
  isBannerPromoted: false, createdAt: '2026-10-15T08:00:00Z', ...over
});

const giftCard = (over: Record<string, unknown> = {}) => ({
  id: 1, code: 'GC-AAAA-BBBB-1000', initialBalance: 1000, currentBalance: 1000, currency: 'BDT',
  recipientEmail: null, recipientName: 'Valued Customer', note: null, isActive: true,
  expiresAt: '2027-10-31T00:00:00Z', createdAt: '2026-10-31T00:00:00Z', lastUsedAt: null, ...over
});

async function openAdmin(tab: 'Coupons' | 'Gift Cards') {
  seedSession('Administrator');
  server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(usersByRole.Administrator)));
  renderApp('/admin');
  await screen.findByRole('heading', { name: /administration/i });
  fireEvent.click(await screen.findByRole('tab', { name: new RegExp(tab, 'i') }));
}

async function openCouponEditor() {
  // The code also appears in the live voucher preview, so the row is picked from the registry table.
  const table = await screen.findByRole('table');
  fireEvent.dblClick(within(table).getByText('SAVE10'));
  return screen.findByRole('dialog', { name: /edit coupon/i });
}

describe('Admin record dialogs', () => {
  it('opens the coupon editor as the system dialog rather than a bottom sheet', async () => {
    server.use(http.get(`${API}/api/coupons`, () => HttpResponse.json([coupon()])));
    await openAdmin('Coupons');

    const dialog = await openCouponEditor();
    // .sheet-backdrop is the mobile bell/cart pattern: it pins its child to the bottom edge.
    expect(dialog.closest('.sheet-backdrop')).toBeNull();
    expect(dialog.closest('.modal-backdrop')).not.toBeNull();
    expect(dialog.className).toContain('modal');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(chromeText(dialog)).not.toMatch(EMOJI);
    expect(dialog.querySelector('.modal__code')?.textContent).toBe('SAVE10');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(await screen.queryByRole('dialog', { name: /edit coupon/i })).toBeNull();
  });

  it('keeps the actions in the dialog itself, so a long record cannot hide them below the fold', async () => {
    server.use(http.get(`${API}/api/coupons`, () => HttpResponse.json([coupon()])));
    await openAdmin('Coupons');

    const dialog = await openCouponEditor();
    const body = dialog.querySelector('.modal__body');
    const footer = dialog.querySelector('.modal__footer');
    expect(body).not.toBeNull();
    expect(footer).not.toBeNull();
    // The fields scroll inside .modal__body and the footer is the dialog's own row: a footer that
    // lived inside the scrolling stack sat 303px below the fold on a phone, under the reason field
    // it is meant to confirm.
    expect(footer?.parentElement).toBe(dialog);
    expect(body?.contains(footer as Node)).toBe(false);
    expect(footer?.querySelectorAll('.btn').length).toBeGreaterThanOrEqual(2);

    fireEvent.keyDown(document, { key: 'Escape' });
  });

  it('labels every editor control and groups it under the builder section titles', async () => {
    server.use(http.get(`${API}/api/coupons`, () => HttpResponse.json([coupon()])));
    await openAdmin('Coupons');

    const dialog = await openCouponEditor();
    const controls = [...dialog.querySelectorAll('input, select, textarea')];
    expect(controls.length).toBeGreaterThanOrEqual(7);
    controls.forEach((control) => {
      const labelled =
        control.closest('label') ??
        (control.id ? dialog.querySelector(`label[for="${control.id}"]`) : null);
      expect(labelled, `${control.tagName}#${control.id} has no label`).not.toBeNull();
    });

    // The same section vocabulary the create flow uses, so an edit reads as the same object.
    const titles = [...dialog.querySelectorAll('.discount-card-title')].map(h => h.textContent);
    expect(titles).toEqual([
      'Discount Value & Calculation',
      'Applies to / Target Scope',
      'Minimum Spend & Usage Limits',
      'Active Dates & Campaign Placement'
    ]);
  });

  it('saves from the footer even though the button sits outside the form', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.get(`${API}/api/coupons`, () => HttpResponse.json([coupon()])),
      http.put(`${API}/api/coupons/1`, async ({ request }) => {
        body = await request.json() as Record<string, unknown>;
        return HttpResponse.json(coupon({ discountValue: 25 }));
      })
    );
    await openAdmin('Coupons');

    const dialog = await openCouponEditor();
    fireEvent.change(within(dialog).getByLabelText(/discount value/i), { target: { value: '25' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /save changes/i }));

    await screen.findByText(/Coupon SAVE10 updated\./);
    expect(body).toMatchObject({ discountValue: 25, minOrderAmount: 0, maxDiscountCap: 1500 });
    expect(screen.queryByRole('dialog', { name: /edit coupon/i })).toBeNull();
  });

  it('keeps the gift card editor on the same dialog and saves recipient edits', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.get(`${API}/api/gift-cards`, () => HttpResponse.json([giftCard()])),
      http.put(`${API}/api/gift-cards/1`, async ({ request }) => {
        body = await request.json() as Record<string, unknown>;
        return HttpResponse.json(giftCard({ recipientName: 'Eid Celebrant' }));
      })
    );
    await openAdmin('Gift Cards');

    fireEvent.click(await screen.findByRole('checkbox', { name: /Select gift card GC-AAAA-BBBB-1000/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit selected gift card' }));

    const dialog = await screen.findByRole('dialog', { name: /edit gift card/i });
    expect(dialog.closest('.modal-backdrop')).not.toBeNull();
    expect(dialog.className).toContain('modal--md');
    expect(dialog.textContent).not.toMatch(EMOJI);

    fireEvent.change(within(dialog).getByLabelText(/recipient name/i), { target: { value: 'Eid Celebrant' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /save changes/i }));

    await screen.findByText(/Gift card GC-AAAA-BBBB-1000 updated\./);
    expect(body).toMatchObject({ recipientName: 'Eid Celebrant', recipientEmail: null });
  });

  it('asks a bulk deletion as an alertdialog with a sprite glyph, and cancels on Escape', async () => {
    server.use(http.get(`${API}/api/gift-cards`, () => HttpResponse.json([giftCard(), giftCard({ id: 2, code: 'GC-BBBB-CCCC-2000' })])));
    await openAdmin('Gift Cards');

    fireEvent.click(await screen.findByRole('checkbox', { name: /Select gift card GC-AAAA-BBBB-1000/i }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /Select gift card GC-BBBB-CCCC-2000/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete selected gift cards' }));

    const dialog = await screen.findByRole('alertdialog', { name: /review bulk deletion/i });
    expect(dialog.closest('.sheet-backdrop')).toBeNull();
    const glyph = dialog.querySelector('.modal__confirm-glyph');
    expect(glyph).not.toBeNull();
    expect(glyph?.querySelector('svg')).not.toBeNull();
    expect(glyph?.textContent).toBe('');
    expect(dialog.textContent).not.toMatch(EMOJI);
    expect([...dialog.querySelectorAll('.modal-list .mono')].map(el => el.textContent))
      .toEqual(['GC-AAAA-BBBB-1000', 'GC-BBBB-CCCC-2000']);

    await userEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));
    expect(await screen.queryByRole('alertdialog')).toBeNull();
  });
});
