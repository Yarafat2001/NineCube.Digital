import { expect, test, type Locator, type Page } from '@playwright/test';
import { seedPassword, seedPasswordMissing } from './seed-password';

/**
 * The one end-to-end smoke test: a Customer places a real order and the stock actually drops, then
 * Staff confirms that same order. It runs against the running API and SPA with the seeded demo
 * accounts, so it is the only test that proves the whole path - login, catalogue, atomic stock
 * reservation, order detail, staff transition - works together in a browser.
 */

/**
 * A page of the real catalogue against real SQL Server has measured ~26 s on this box, so every wait
 * that depends on server data carries this budget instead of the config default.
 */
const LOADED = { timeout: 90_000 };

test.describe('order flow', () => {
  test.skip(!seedPassword, seedPasswordMissing);
  test.setTimeout(300_000);

  async function signIn(page: Page, email: string) {
    await page.goto('/login');
    await page.getByRole('textbox', { name: 'Email' }).fill(email);
    await page.getByRole('textbox', { name: 'Password' }).fill(seedPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Waiting for the navigation alone is not enough: the shell renders it for anonymous visitors
    // too, so a later goto() could race the session write and be bounced back to /login. The account
    // menu only appears once a session is really established.
    await expect(page.getByRole('button', { name: 'Account' })).toBeVisible();
  }

  async function signOut(page: Page) {
    await page.getByRole('button', { name: 'Account' }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  }

  function productCard(page: Page, name: string): Locator {
    return page.locator('article').filter({ hasText: name });
  }

  /** Reads the live stock number out of a product card's availability badge. */
  async function stockOf(card: Locator): Promise<number> {
    const badge = card.locator('[data-testid^="stock-"]');
    const text = (await badge.innerText()).trim();
    const match = /(\d+)\s*$/.exec(text);
    expect(match, `expected a quantity in the stock badge, got "${text}"`).not.toBeNull();
    return Number(match![1]);
  }

  test('a customer reserves stock and a staff member confirms the order', async ({ page }) => {
    const sku = 'Paper Filters (100 pack)';

    await signIn(page, 'customer@ninecube.demo');
    await page.getByRole('searchbox', { name: 'Search products' }).fill(sku);

    const card = productCard(page, sku);
    await expect(card).toBeVisible(LOADED);

    const before = await stockOf(card);

    await card.getByRole('button', { name: 'Add to cart' }).click();

    // The cart is opened on demand — adding a product does not steal the view — so the checkout
    // control is only reachable through the cart in the navbar actions.
    await page.locator('.navbar__actions').getByRole('button', { name: /^Cart,/ }).click();
    const cart = page.getByRole('dialog', { name: /cart/i });
    await expect(cart, 'the cart did not open').toBeVisible(LOADED);
    await cart.getByRole('button', { name: 'Place order' }).click();

    await page.waitForURL(/\/orders\/\d+$/, { timeout: 90_000 });
    const orderId = Number(/(\d+)$/.exec(page.url())![1]);
    await expect(page.getByRole('heading', { name: `Order #${orderId}` })).toBeVisible(LOADED);
    await expect(page.getByText(/pending/i).first()).toBeVisible(LOADED);

    // The reservation is real: the catalogue now reports one unit less.
    await page.goto('/products');
    await page.getByRole('searchbox', { name: 'Search products' }).fill(sku);
    await expect.poll(() => stockOf(productCard(page, sku)), { timeout: 90_000 }).toBe(before - 1);

    // --- the other half of the story: Staff confirms it
    await signOut(page);
    await signIn(page, 'staff@ninecube.demo');

    await page.goto('/staff');
    const row = page.locator('tr').filter({ hasText: `#${orderId}` });
    await expect(row).toBeVisible(LOADED);
    const confirmed = page.waitForResponse(response => response.url().endsWith(`/api/orders/${orderId}/confirm`) && response.ok());
    await row.getByRole('button', { name: 'Confirm order' }).click();
    await confirmed;
    await page.getByRole('button', { name: 'To ship', exact: true }).click();
    await expect(row.getByText('Confirmed')).toBeVisible(LOADED);
  });
});
