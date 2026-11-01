import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { API } from './handlers';
import { server } from './server';
import { renderApp, seedSession, usersByRole } from './utils';

/**
 * The coupon scope builder: what an operator assembles here is what the money engine reads, so the
 * rule chips, the include/exclude control, the Any/All switch and the reach panel are tested together.
 */
async function openCouponBuilder() {
  seedSession('Administrator');
  server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(usersByRole.Administrator)));
  renderApp('/admin');
  await screen.findByRole('heading', { name: /administration/i });
  fireEvent.click(await screen.findByRole('tab', { name: /coupons/i }));
  await screen.findByTestId('discount-step-1');
}

const coupon = (over: Record<string, unknown> = {}) => ({
  id: 4, code: 'APEX15', discountType: 'Percentage', discountValue: 15, minOrderAmount: 500,
  maxDiscountCap: 1500, targetType: 'Brand', targetId: 1, startsAt: null, expiresAt: null,
  usageLimit: null, usageCount: 0, isActive: true, isAutomatic: false, campaignTitle: null,
  isBannerPromoted: false, minEligibleAmount: 0, scopeMatch: 'Any', exclusivity: 'BestOnly',
  scopeRules: [{ attribute: 'Brand', polarity: 'Is', entityIds: [1], entityNames: ['Apple'] }],
  createdAt: '2026-10-15T08:00:00Z', ...over
});

/** The reach panel the builder asks the server for, looked up by its test id. */
async function reachShows(text: string) {
  const impact = await screen.findByTestId('scope-impact');
  await waitFor(() => expect(impact.textContent).toContain(text), { timeout: 6000 });
  return impact;
}

describe('Coupon scope rules', () => {
  it('sends the rules, the combination and the stacking policy the operator built', async () => {
    let sent: Record<string, unknown> | null = null;
    server.use(http.post(`${API}/api/coupons`, async ({ request }) => {
      sent = await request.json() as Record<string, unknown>;
      return HttpResponse.json(coupon({ id: 9, code: 'SCOPEUI1' }), { status: 201 });
    }));

    await openCouponBuilder();

    fireEvent.change(screen.getByPlaceholderText(/summer25/i), { target: { value: 'SCOPEUI1' } });
    fireEvent.change(screen.getByLabelText(/discount percentage/i), { target: { value: '10' } });

    fireEvent.click(screen.getByRole('button', { name: 'Brand' }));
    const card = (await screen.findByText('Include')).closest('.scope-rule') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /Apple/ }));
    fireEvent.click(within(card).getByRole('button', { name: /Samsung/ }));
    expect(within(card).getByText('2 chosen')).toBeInTheDocument();

    // Both brands together cover the four phones in a catalogue of seven active products.
    await reachShows('Products reached4 / 7');

    fireEvent.click(screen.getByRole('button', { name: 'Stack by scope' }));
    fireEvent.change(screen.getByLabelText(/minimum in-scope spend/i), { target: { value: '500' } });

    fireEvent.click(screen.getByRole('button', { name: /create coupon/i }));

    await screen.findByText(/Coupon SCOPEUI1 created\./);
    expect(sent).toMatchObject({
      code: 'SCOPEUI1',
      scopeRules: [{ attribute: 'Brand', polarity: 'Is', entityIds: [1, 2] }],
      scopeMatch: 'Any',
      exclusivity: 'StackByScope',
      minEligibleAmount: 500
    });
  });

  it('widens the reach with Any and narrows it with All', async () => {
    await openCouponBuilder();

    fireEvent.click(screen.getByRole('button', { name: 'Brand' }));
    const apple = (await screen.findByText('Include')).closest('.scope-rule') as HTMLElement;
    fireEvent.click(within(apple).getByRole('button', { name: /Apple/ }));

    // Apple alone reaches its three phones.
    await reachShows('Products reached3 / 7');

    fireEvent.click(screen.getByRole('button', { name: 'Tag' }));
    const tagCard = screen.getAllByText('Include').map(el => el.closest('.scope-rule') as HTMLElement)
      .find(card => card !== apple)!;
    fireEvent.click(within(tagCard).getByRole('button', { name: /5G/ }));

    // Either one: the two 5G iPhones plus the iPhone 16 that carries no 5G tag.
    await reachShows('Products reached3 / 7');

    fireEvent.click(screen.getByRole('button', { name: 'Every one of them' }));

    // Both at once: only the two iPhones that are Apple *and* tagged 5G.
    await reachShows('Products reached2 / 7');
  });

  it('refuses to save a rule that names nothing rather than quietly going storewide', async () => {
    let posted = false;
    server.use(
      http.get(`${API}/api/coupons`, () => HttpResponse.json([])),
      http.post(`${API}/api/coupons`, () => {
        posted = true;
        return HttpResponse.json(coupon(), { status: 201 });
      })
    );

    await openCouponBuilder();
    fireEvent.change(screen.getByPlaceholderText(/summer25/i), { target: { value: 'HALLOW1' } });
    fireEvent.change(screen.getByLabelText(/discount percentage/i), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Category' }));

    fireEvent.click(screen.getByRole('button', { name: /create coupon/i }));

    expect(await screen.findByText(/Every rule needs at least one category, brand, tag or product chosen/)).toBeInTheDocument();
    expect(posted).toBe(false);
  });

  it('excludes a brand from the scope and says so on the voucher', async () => {
    await openCouponBuilder();

    fireEvent.click(screen.getByRole('button', { name: 'Brand' }));
    const card = (await screen.findByText('Include')).closest('.scope-rule') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /Samsung/ }));
    fireEvent.click(within(card).getByRole('button', { name: 'Exclude' }));

    // Flipping polarity rebuilds the rule card, so read it back rather than the stale node.
    const outCard = (await screen.findByText('Exclude')).closest('.scope-rule') as HTMLElement;
    expect(within(outCard).getByText('1 chosen')).toBeInTheDocument();

    const voucherScope = await screen.findByText(/^Scope:/);
    await waitFor(() => expect(voucherScope.parentElement?.textContent).toContain('except Samsung'));
  });

  it('reads a stored scope back into the editor and keeps it when only the value changes', async () => {
    let sent: Record<string, unknown> | null = null;
    server.use(
      http.get(`${API}/api/coupons`, () => HttpResponse.json([coupon()])),
      http.put(`${API}/api/coupons/4`, async ({ request }) => {
        sent = await request.json() as Record<string, unknown>;
        return HttpResponse.json(coupon({ discountValue: 20 }));
      })
    );

    await openCouponBuilder();
    const table = await screen.findByRole('table');
    fireEvent.dblClick(within(table).getByText('APEX15'));

    const dialog = await screen.findByRole('dialog', { name: /edit coupon/i });

    // The stored brand comes back as a chosen chip, and its dimension cannot be added twice.
    expect(within(dialog).getByRole('button', { name: 'Apple', pressed: true })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Brand' })).toBeDisabled();
    expect(within(dialog).getByText('1 chosen')).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText(/discount value/i), { target: { value: '20' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /save changes/i }));

    await screen.findByText(/Coupon APEX15 updated\./);
    expect(sent).toMatchObject({
      discountValue: 20,
      scopeRules: [{ attribute: 'Brand', polarity: 'Is', entityIds: [1] }],
      scopeMatch: 'Any',
      exclusivity: 'BestOnly'
    });
  });

  it('prints the stored scope on the registry row instead of a bare id or storewide', async () => {
    server.use(http.get(`${API}/api/coupons`, () => HttpResponse.json([coupon({
      code: 'TWOBRAND',
      scopeRules: [{ attribute: 'Brand', polarity: 'Is', entityIds: [1, 2], entityNames: ['Apple', 'Samsung'] }]
    })])));

    await openCouponBuilder();

    const table = await screen.findByRole('table');
    const row = within(table).getByText('TWOBRAND').closest('tr') as HTMLElement;
    expect(row).toHaveTextContent('Apple or Samsung');
    expect(row).not.toHaveTextContent('All products');
  });

  it('shows the campaigns that already reach the same products', async () => {
    // The catalogue answers with the category before the builder mounts, as the real API does.
    server.use(http.get(`${API}/api/categories`, () => HttpResponse.json([
      {
        id: 40, name: 'Mobiles & Tablets', slug: 'mobiles', parentId: null, path: '/mobiles/', depth: 1,
        sortOrder: 1, isActive: true, productCount: 4, children: []
      }
    ])));

    await openCouponBuilder();

    fireEvent.click(screen.getByRole('button', { name: 'Category' }));
    const card = (await screen.findByText('Include')).closest('.scope-rule') as HTMLElement;
    fireEvent.click(await within(card).findByRole('button', { name: /Mobiles & Tablets/ }));

    const impact = await reachShows('Live campaigns that already reach these products');
    expect(impact).toHaveTextContent('SAVE10');
  });
});
