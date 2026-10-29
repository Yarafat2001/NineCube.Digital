import { expect, test } from '@playwright/test';
import { seedPassword, seedPasswordMissing } from './seed-password';

for (const width of [390, 768, 1024, 1440]) {
  test(`catalogue categories and filters work at ${width}px`, async ({ page }) => {
    test.skip(!seedPassword, seedPasswordMissing);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/login');
    await page.getByRole('textbox', { name: 'Email' }).fill('customer@ninecube.demo');
    await page.getByRole('textbox', { name: 'Password' }).fill(seedPassword);
    await page.getByRole('button', { name: 'LOGIN', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Catalogue' })).toBeVisible();
    await page.goto('/products?category=coffee-tea&sort=price');
    await expect(page.locator('.pager')).toContainText('of 10');
    for (const theme of ['Light', 'Dark']) {
      await page.getByRole('button', { name: `${theme} theme` }).click();
      const panel = width <= 768 ? page.getByRole('dialog', { name: 'Filter products' }) : page.getByRole('complementary', { name: 'Catalogue filters' });
      // Two "Filters (2)" buttons exist at these widths - the panel trigger and the mobile bottom bar -
      // so the drawer is opened through the trigger the panel itself owns.
      if (width <= 768) await page.locator('.category-filter-trigger').click();
      // The row's count carries the in-stock note ("Coffee & Tea, 10 products, 8 in stock") whenever
      // the two differ, so match the leading figure rather than the whole accessible name.
      await expect(panel.getByRole('treeitem', { name: /Coffee & Tea, 10 products/ }))
        .toHaveAttribute('aria-selected', 'true');
      await panel.getByRole('checkbox', { name: 'In-stock only' }).check();
      if (width <= 768) {
        // The drawer's own tab ring: Apply -> Cancel is document order, and Cancel is the last
        // focusable node in the dialog, so the next Tab has to wrap back to its first control.
        const apply = panel.getByRole('button', { name: 'Apply filters' });
        await apply.focus();
        await page.keyboard.press('Tab');
        await expect(panel.getByRole('button', { name: 'Cancel' })).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(panel.getByRole('button', { name: 'Close dialog' })).toBeFocused();
        await apply.click();
      }
      await expect(page).toHaveURL(/inStock=true/);
      await expect(page.locator('.pager')).toContainText('of 8');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(200);
      await page.screenshot({ path: `artifacts/categories-${theme.toLowerCase()}-${width}.png` });
      await page.goto('/products?category=coffee-tea&sort=price');
      await expect(page.locator('.pager')).toContainText('of 10');
    }
    await page.reload(); await expect(page.locator('.pager')).toContainText('of 10');
    // An empty category and an empty result set are different states. Electronics has no direct
    // membership of its own - only its children do - and "Include subcategories" is on by default, so
    // the direct-only switch is what makes it empty.
    await page.goto('/products?category=electronics&includeDescendants=false');
    await expect(page.getByRole('heading', { name: 'No products in this category' })).toBeVisible();
    await page.goto('/products?category=missing-category'); await expect(page.getByText('That category is no longer available. Showing all products.')).toBeVisible();
    await expect(page).not.toHaveURL(/category=/);
  });
}

test('staff category editor shows cycle conflicts and protects stock', async ({ page }) => {
  test.skip(!seedPassword, seedPasswordMissing);
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill('staff@ninecube.demo');
  await page.getByRole('textbox', { name: 'Password' }).fill(seedPassword);
  await page.getByRole('button', { name: 'LOGIN', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Catalogue' })).toBeVisible();
  await page.goto('/staff');
  await page.getByRole('button', { name: 'Manage categories' }).click();
  await page.getByRole('button', { name: 'Edit Home', exact: true }).click();
  const editor = page.getByRole('form', { name: 'Category editor' });
  await editor.getByLabel('Parent category').selectOption('4');
  await editor.getByRole('button', { name: 'Move category' }).click();
  await expect(page.getByRole('alert')).toContainText('cannot move under itself');
  await expect(editor.getByRole('button', { name: 'Delete category' })).toBeDisabled();
  await editor.getByLabel('Reassign products and children to').selectOption('1');
  await expect(editor.getByRole('button', { name: 'Delete category' })).toBeEnabled();
  await page.screenshot({ path: 'artifacts/staff-category-manager.png', fullPage: true });
});

test('staff can create, rename, move, deactivate and delete a category', async ({ page }) => {
  test.skip(!seedPassword, seedPasswordMissing);
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill('staff@ninecube.demo');
  await page.getByRole('textbox', { name: 'Password' }).fill(seedPassword);
  await page.getByRole('button', { name: 'LOGIN', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Catalogue' })).toBeVisible();
  await page.goto('/staff');
  await page.getByRole('button', { name: 'Manage categories' }).click();
  const editor = page.getByRole('form', { name: 'Category editor' });
  await page.getByRole('button', { name: 'Create category', exact: true }).click();
  const suffix = Date.now(); const name = `Review category ${suffix}`; const slug = `review-${suffix}`;
  let id: number | undefined;
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('ninecube.auth.session')!).accessToken as string);
  try {
    await editor.getByLabel('Category name').fill(name);
    await editor.getByLabel('Category slug').fill(slug);
    const created = page.waitForResponse(response => response.url().endsWith('/api/categories') && response.request().method() === 'POST');
    await editor.getByRole('button', { name: 'Save category' }).click();
    const response = await created; expect(response.status()).toBe(201); id = (await response.json()).id;
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await page.getByRole('searchbox', { name: 'Find a category' }).fill(name);
    await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
    await editor.getByLabel('Category name').fill(`${name} renamed`);
    await editor.getByLabel('Category slug').fill(`${slug}-renamed`);
    await editor.getByLabel('Sort order').fill('5');
    await editor.getByRole('button', { name: 'Save category' }).click();
    await expect(page.getByRole('dialog', { name: `Edit ${name} renamed`, exact: true })).toBeVisible();
    await editor.getByLabel('Parent category').selectOption('3');
    await editor.getByRole('button', { name: 'Move category' }).click();
    await expect.poll(async () => (await (await page.request.get(`http://127.0.0.1:5080/api/categories/${id}`)).json()).path).toBe(`/home/kitchen/${slug}-renamed/`);
    await editor.getByLabel('Active category').uncheck();
    await editor.getByRole('button', { name: 'Save category' }).click();
    await expect.poll(async () => (await page.request.get(`http://127.0.0.1:5080/api/categories/${id}`)).status()).toBe(404);
    const deleted = page.waitForResponse(response => response.url().endsWith(`/api/categories/${id}`) && response.request().method() === 'DELETE');
    await editor.getByRole('button', { name: 'Delete category' }).click();
    expect((await deleted).status()).toBe(204);
    await expect(page.getByRole('button', { name: `Edit ${name} renamed`, exact: true })).toHaveCount(0);
  } finally {
    if (id) await page.request.delete(`http://127.0.0.1:5080/api/categories/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  }
});
