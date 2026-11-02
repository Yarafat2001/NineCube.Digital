import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  API,
  adminUser,
  clearDemoOrderHistory,
  resetCommerceFixtures,
  seedDiscountPolicy,
  seedPendingCoupon,
  setDemoSessionEmail
} from './handlers';
import { server } from './server';
import { renderApp, seedSession } from './utils';

/**
 * The three moderation layers on one screen: the shop's own limits refusing a coupon, the order replay
 * pricing it, and the second signature releasing it. The stub answers with the server's own sentences, so
 * a passing assertion here is the operator reading exactly what the live API would tell them.
 */

/** Sign the stub in as a named administrator, so the review dialog knows whose signature is on screen. */
function signInAs(email = adminUser.email) {
  const user = seedSession('Administrator', { email });
  server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(user)));
  setDemoSessionEmail(email);
  return user;
}

async function openAdminTab(tab: 'settings' | 'coupons', email?: string) {
  signInAs(email);
  renderApp('/admin');
  await screen.findByRole('heading', { name: /administration/i });
  fireEvent.click(await screen.findByRole('tab', { name: tab === 'settings' ? /settings/i : /coupons/i }));
  if (tab === 'settings') await screen.findByText('Discount policy');
  else await screen.findByTestId('discount-step-1');
}

/** The replay plate asks the server on a debounce, so its figures are waited for rather than assumed. */
async function replayShows(text: RegExp, inside?: HTMLElement) {
  const plate = inside ? within(inside).getByTestId('order-replay') : await screen.findByTestId('order-replay');
  await waitFor(() => expect(plate.textContent).toMatch(text), { timeout: 8000 });
  return plate;
}

/** A refusal the shop sends back is shown to the operator as a toast, in the API's own words. */
function expectToast(text: RegExp) {
  return screen.findByText(text, {}, { timeout: 8000 });
}

/** The builder keeps the voucher code and the discount typed; submitting is what the shop answers. */
function submitCoupon() {
  fireEvent.click(screen.getByRole('button', { name: /create coupon/i }));
}

function fillRate(code: string, rate: string) {
  fireEvent.change(screen.getByPlaceholderText(/summer25/i), { target: { value: code } });
  fireEvent.change(screen.getByLabelText(/discount percentage/i), { target: { value: rate } });
}

/** The registry is the only table on the coupons tab, so an absent row means nothing was stored. */
function couponTable() {
  return screen.getByRole('table');
}

beforeEach(() => resetCommerceFixtures());

describe('Discount policy guardrails', () => {
  it('opens an unguarded shop and saves the limits the operator sets', async () => {
    let sent: Record<string, number> | null = null;
    server.use(http.put(`${API}/api/admin/discount-policy`, async ({ request }) => {
      sent = await request.json() as Record<string, number>;
      seedDiscountPolicy(sent);
      return HttpResponse.json({ policy: sent, promoSpendLast7Days: 350 });
    }));

    await openAdminTab('settings');

    expect(screen.getByText('No limits yet')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/highest discount rate/i), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText(/most one coupon may take/i), { target: { value: '2000' } });
    expect(screen.getByRole('button', { name: /discard changes/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /save policy/i }));

    await expectToast(/Discount policy saved\./);
    expect(sent).toEqual({
      maxPercentageOff: 30,
      maxAmountPerOrder: 2000,
      maxShareOfOrder: 0,
      weeklySpendCap: 0,
      approvalAbovePercentage: 0,
      approvalAboveAmount: 0
    });

    // The panel reads the numbers back off the server rather than keeping them in the form.
    await waitFor(() => expect(screen.getByLabelText(/highest discount rate/i)).toHaveValue(30));
    expect(screen.getByLabelText(/most one coupon may take/i)).toHaveValue(2000);
    expect(screen.getByText('Limits on')).toBeInTheDocument();
  });

  it('shows the week’s giveaway against the budget the operator set', async () => {
    seedDiscountPolicy({ weeklySpendCap: 500 });
    await openAdminTab('settings');

    const spend = await screen.findByText('Given away in the last 7 days');
    expect(spend.closest('.policy-spend')).toHaveTextContent(/350/);
    expect(screen.getByText(/of a weekly budget of/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Given away in the last 7 days: 70%' })).toBeInTheDocument();
  });

  it('refuses a policy whose second-signature threshold sits above its own hard limit', async () => {
    await openAdminTab('settings');

    fireEvent.change(screen.getByLabelText(/highest discount rate/i), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText(/rates needing a second signature/i), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: /save policy/i }));

    await expectToast(/is above the maximum rate of 30%, so no coupon could ever reach it/);

    // A policy that was not saved must not look saved.
    expect(screen.getByText('No limits yet')).toBeInTheDocument();
    expect(screen.getByLabelText(/rates needing a second signature/i)).toHaveValue(50);
  });

  it('keeps a coupon over the rate ceiling out of the registry', async () => {
    seedDiscountPolicy({ maxPercentageOff: 30 });
    await openAdminTab('coupons');

    fillRate('REFUSE40', '40');
    submitCoupon();
    await expectToast(/Your policy allows at most 30% off\. This coupon gives 40%\./);

    // The operator keeps their work, and nothing half-built reaches the table.
    expect(screen.getByPlaceholderText(/summer25/i)).toHaveValue('REFUSE40');
    expect(within(couponTable()).queryByText('REFUSE40')).toBeNull();
  });

  it('names the share of the basket when an amount eats too much of a small order', async () => {
    seedDiscountPolicy({ maxShareOfOrder: 30 });
    await openAdminTab('coupons');

    fireEvent.click(within(screen.getByRole('group', { name: /discount type/i }))
      .getByRole('button', { name: /fixed amount/i }));
    fireEvent.change(screen.getByPlaceholderText(/summer25/i), { target: { value: 'BIG500' } });
    fireEvent.change(screen.getByLabelText(/discount amount/i), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText(/minimum order amount/i), { target: { value: '600' } });
    submitCoupon();

    await expectToast(/This gives BDT 500 off a BDT 600 order — 83\.3% of it\. Your policy allows 30%\./);
    expect(within(couponTable()).queryByText('BIG500')).toBeNull();
  });

  it('holds every new campaign while the week has already spent its budget', async () => {
    seedDiscountPolicy({ weeklySpendCap: 300 });
    await openAdminTab('coupons');

    fillRate('LATE10', '10');
    submitCoupon();
    await expectToast(/already used BDT 350 of discounts, and your policy allows BDT 300 a week/);

    expect(within(couponTable()).queryByText('LATE10')).toBeNull();
  });
});

describe('Coupon replay against real orders', () => {
  it('prices the coupon on the shop’s own last 30 days', async () => {
    await openAdminTab('coupons');

    fillRate('REPLAY10', '10');
    const plate = await replayShows(/506\.57/);

    expect(plate).toHaveTextContent('Orders it would have hit');
    expect(plate.textContent).toMatch(/4\s*\/\s*5/);
    expect(plate.textContent).toMatch(/126\.64/);
    expect(plate).toHaveTextContent('For the same window the shop actually gave away');
    expect(plate.textContent).toMatch(/BDT\s*350/);

    // Where the money would have gone, and the cancelled order the server left out of it.
    expect(plate).toHaveTextContent('Where the money would have gone');
    expect(plate.textContent).toMatch(/iPhone 17 Pro 256GB[\s\S]*?299\.8/);
    expect(plate).toHaveTextContent(/cancelled or rejected/);
  });

  it('says there is no history instead of inventing a figure', async () => {
    clearDemoOrderHistory();
    await openAdminTab('coupons');

    fillRate('NEWSHOP', '10');
    const plate = await replayShows(/no figure to show you/i);

    expect(plate).toHaveTextContent('No orders in the last 30 days to measure against');
    expect(plate).toHaveTextContent(/There are no orders at all in the last 30 days/);
    expect(within(plate).queryByText('Total giveaway')).toBeNull();
  });

  it('shows a zero giveaway with the reason when no order reaches the minimum', async () => {
    await openAdminTab('coupons');

    fillRate('RARE10', '10');
    fireEvent.change(screen.getByLabelText(/minimum order amount/i), { target: { value: '5000' } });

    // The plate had 4 of 5 orders priced a moment ago; it must move to an honest zero, not keep the old money.
    const plate = await replayShows(/0\s*\/\s*5/);
    expect(plate).toHaveTextContent(/under this coupon's own minimum order of BDT 5,000/);
    expect(within(plate).queryByText(/iPhone 17 Pro/)).toBeNull();
  });

  it('measures only the products the scope reaches', async () => {
    await openAdminTab('coupons');

    fireEvent.click(screen.getByRole('button', { name: 'Brand' }));
    const card = (await screen.findByText('Include')).closest('.scope-rule') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /Apple/ }));

    fillRate('BRAND10', '10');
    const plate = await replayShows(/469\.7/);

    // The espresso machine and the frother carry no Apple brand, so their lines drop out of the money.
    expect(plate.textContent).toMatch(/3\s*\/\s*5/);
    expect(plate.textContent).not.toMatch(/Galaxy/);
  });
});

describe('Second signature on large discounts', () => {
  it('queues a coupon that passes the approval threshold instead of releasing it', async () => {
    seedDiscountPolicy({ approvalAbovePercentage: 25 });
    await openAdminTab('coupons', 'writer@ninecube.demo');

    fillRate('BOLD40', '40');
    submitCoupon();

    await expectToast(/Coupon BOLD40 created\. It waits for a second administrator to approve it/);

    const row = (await screen.findByText('BOLD40')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Awaiting approval')).toBeInTheDocument();
    expect(within(row).getByText(/Written by writer@ninecube\.demo/)).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /review coupon BOLD40/i })).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /to approve/i })).toHaveTextContent('1');
  });

  it('signs the queued coupon off as a second administrator and puts it live', async () => {
    seedPendingCoupon();
    await openAdminTab('coupons');

    fireEvent.click(await screen.findByRole('button', { name: /review coupon BOLD40/i }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText('Second signature')).toBeInTheDocument();
    expect(within(dialog).getByText(/Written by writer@ninecube\.demo/)).toBeInTheDocument();
    expect(within(dialog).getByText('40% off')).toBeInTheDocument();
    expect(within(dialog).queryByText(/You wrote this coupon/)).toBeNull();
    await replayShows(/506\.57/, dialog);

    fireEvent.click(within(dialog).getByRole('button', { name: /approve and release/i }));

    await expectToast(/BOLD40 is approved and live\./);
    const row = (await screen.findByText('BOLD40')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Active')).toBeInTheDocument();
    expect(within(row).getByText(`Signed off by ${adminUser.email}`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /to approve/i })).not.toHaveTextContent('1');
  });

  it('will not let the writer be their own second signature', async () => {
    seedPendingCoupon();
    await openAdminTab('coupons', 'writer@ninecube.demo');

    fireEvent.click(await screen.findByRole('button', { name: /review coupon BOLD40/i }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText(/You wrote this coupon, so another administrator has to sign it off\./))
      .toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /approve and release/i })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: /^refuse$/i })).toBeEnabled();
  });

  it('refuses with a reason the writer can read on the row', async () => {
    seedPendingCoupon();
    await openAdminTab('coupons');

    fireEvent.click(await screen.findByRole('button', { name: /review coupon BOLD40/i }));
    const dialog = await screen.findByRole('dialog');

    fireEvent.click(within(dialog).getByRole('button', { name: /^refuse$/i }));
    await expectToast(/Say why in a few words, so the writer can act on it\./);
    expect(screen.getByText('Awaiting approval')).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText(/if you refuse, say why/i), {
      target: { value: 'Too generous for this week’s budget.' }
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /^refuse$/i }));

    await expectToast(/BOLD40 has been refused\. The writer sees your reason\./);
    const row = (await screen.findByText('BOLD40')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Refused')).toBeInTheDocument();
    expect(within(row).getByText(/Reason: Too generous for this week’s budget\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /to approve/i })).not.toHaveTextContent('1');
  });

  it('refuses to switch on a coupon the shop already said no to', async () => {
    seedPendingCoupon({ approvalState: 'Rejected', rejectionReason: 'Not this quarter.', isActive: false });
    await openAdminTab('coupons');

    const row = (await screen.findByText('BOLD40')).closest('tr') as HTMLElement;
    expect(within(row).getByText(/Reason: Not this quarter\./)).toBeInTheDocument();

    fireEvent.click(row);
    expect(row).toHaveAttribute('data-selected', 'true');
    fireEvent.click(screen.getByRole('button', { name: /enable selected coupons/i }));

    await expectToast(/BOLD40 was refused: Not this quarter\. Edit it and it goes back for approval\./);
    expect(within(row).getByText('Disabled')).toBeInTheDocument();
  });
});
