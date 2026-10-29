import { expect, test, type Locator, type Page } from '@playwright/test';
import type { PagedResult, Product } from '../src/api/types';
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
    await page.getByRole('button', { name: 'LOGIN', exact: true }).click();

    // Waiting for the navigation alone is not enough: the shell renders it for anonymous visitors
    // too, so a later goto() could race the session write and be bounced back to /login. The account
    // menu only appears once a session is really established.
    await expect(page.getByRole('button', { name: 'Account' })).toBeVisible();
  }

  async function signOut(page: Page) {
    await page.getByRole('button', { name: 'Account' }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await expect(page.getByRole('heading', { name: /^welcome$/i })).toBeVisible();
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

  /**
   * The recovery half of the story, which is where the panel used to fail: after a 409 it re-checks
   * stock, and while that re-check was still running the corrected "Place order" click was refused by
   * the double-submit guard without any message at all.
   */
  test('a cart that went short is corrected and placed on the very next click', async ({ page, request }) => {
    const API = 'http://127.0.0.1:5080';
    const login = await request.post(`${API}/api/auth/login`, { data: { email: 'customer@ninecube.demo', password: seedPassword } });
    expect(login.ok()).toBeTruthy();
    const session = await login.json();
    const headers = { authorization: `Bearer ${session.accessToken}` };

    // A product holding a handful of units, so asking for all of them and losing one is realistic.
    let target: Product | undefined;
    for (let pageNumber = 1; !target && pageNumber <= 3; pageNumber += 1) {
      const listed = await request.get(`${API}/api/products?page=${pageNumber}&pageSize=100`, { headers });
      await expect(listed).toBeOK();
      const catalogue: PagedResult<Product> = await listed.json();
      target = catalogue.items.find(product => product.isActive && product.stockQuantity >= 2 && product.stockQuantity <= 6);
    }
    if (!target) throw new Error('the demo catalogue needs a product holding between 2 and 6 units to be searched');

    await signIn(page, 'customer@ninecube.demo');
    // Search by SKU: the card heading is clamped, so the full name is not what the list shows.
    await page.getByRole('searchbox', { name: 'Search products' }).fill(target.sku);

    const card = page.locator('.product-card').first();
    await expect(card).toBeVisible(LOADED);
    expect(await page.locator('.product-card').count(), `the search for ${target.sku} should narrow to one card`).toBe(1);

    const increase = card.getByRole('button', { name: 'Increase quantity' });
    for (let unit = 1; unit < target.stockQuantity; unit += 1) await increase.click();
    await card.getByRole('button', { name: 'Add to cart' }).click();

    await page.locator('.navbar__actions').getByRole('button', { name: /^Cart,/ }).click();
    const cart = page.getByRole('dialog', { name: /cart/i });
    await expect(cart, 'the cart did not open').toBeVisible(LOADED);

    // Another order takes one unit while the cart waits.
    const competing = await request.post(`${API}/api/orders`, {
      headers,
      data: { items: [{ productId: target.id, quantity: 1 }] }
    });
    expect(competing.status()).toBe(201);

    await cart.getByRole('button', { name: 'Place order' }).click();
    const banner = cart.getByTestId('short-items');
    await expect(banner, 'the refusal did not name the short line').toBeVisible(LOADED);
    await expect(banner).toContainText(`requested ${target.stockQuantity}`);

    // The line is re-checked against the server, and the customer trims the cart to what exists.
    const line = cart.getByTestId(`cart-line-${target.id}`);
    await expect(line).toContainText(`${target.stockQuantity - 1} available`, LOADED);
    await line.getByRole('button', { name: 'Decrease quantity' }).click();
    await expect(banner, 'the banner kept announcing a shortage that had been corrected').toBeHidden(LOADED);

    const accepted = page.waitForResponse(
      response => response.url().endsWith('/api/orders') && response.request().method() === 'POST' && response.ok(),
      LOADED
    );
    await cart.getByRole('button', { name: 'Place order' }).click();
    await accepted;
    await page.waitForURL(/\/orders\/\d+$/, LOADED);

    const orderId = Number(/(\d+)$/.exec(page.url())![1]);
    await expect(page.getByRole('heading', { name: `Order #${orderId}` })).toBeVisible(LOADED);

    await signOut(page);
  });
});
