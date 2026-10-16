import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { API } from './handlers';
import { server } from './server';
import { renderApp, seedSession } from './utils';
import type { Category } from '../api/types';

/**
 * Bulk edits go to the server as one request for the whole selection, so these tests watch the
 * request body (which ids, which action, which parameters) and the summary that comes back: the
 * bug this guards is a batch that silently edits every product or loses the parameter the staff
 * member picked.
 */
let sent: { ids: number[]; action: string; params?: Record<string, unknown> } | null = null;

const category = (id: number, name: string, slug: string, parentId: number | null, children: Category[] = []): Category => ({
  id, name, slug, parentId, path: `/${slug}/`, depth: parentId ? 2 : 1, sortOrder: 0, isActive: true,
  productCount: 8, inStockCount: 7, lowStockCount: 1, directProductCount: 3, directInStockCount: 3,
  breadcrumb: parentId ? [{ id: 1, name: 'Home Appliances', slug: 'home' }, { id, name, slug }] : [{ id, name, slug }],
  children
});

const tree = [category(1, 'Home Appliances', 'home', null, [category(40, 'Mobiles & Tablets', 'mobiles', 1)])];

async function signIn() {
  const user = seedSession('InventoryManager');
  server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(user)));
}

/** The fake bulk endpoint records the body and answers with a shape the real API produces. */
function captureBulk(result: { updated: number; skipped: number; failed: number; items?: unknown[] } = { updated: 4, skipped: 4, failed: 0 }) {
  server.use(http.post(`${API}/api/products/bulk`, async ({ request }) => {
    sent = (await request.json()) as typeof sent;
    return HttpResponse.json({
      action: sent!.action,
      requested: sent!.ids.length,
      ...result,
      items: result.items ?? []
    });
  }));
}

/**
 * The bar is fixed over the bottom of the table, so it only exists while rows are ticked - an empty one
 * would cover the first row for no reason. Each test therefore ticks its own rows and then looks the
 * bar up through this accessor.
 */
async function openInventory() {
  await signIn();
  renderApp('/inventory');
  await screen.findByRole('checkbox', { name: 'Select NC-1004' });
  return () => screen.getByTestId('product-bulk-bar');
}

beforeEach(() => {
  sent = null;
  server.use(http.get(`${API}/api/categories`, () => HttpResponse.json(tree)));
});

describe('Bulk product editing', () => {
  it('selects the whole page and sends one request with the chosen category', async () => {
    const user = userEvent.setup();
    const bar = await openInventory();
    captureBulk();

    await user.click(screen.getByRole('checkbox', { name: 'Select all products on this page' }));
    expect(within(bar()).getByRole('status')).toHaveTextContent('8 selected');

    // "Mobiles & Tablets" is already primary for the four phones, so the fake reports them as skipped.
    await user.selectOptions(within(bar()).getByLabelText('Primary category'), '40');
    await user.click(within(bar()).getByRole('button', { name: /review changes/i }));

    const dialog = await screen.findByRole('dialog', { name: /confirm bulk edit/i });
    expect(dialog).toHaveTextContent('Set primary category');
    expect(dialog).toHaveTextContent('8 products');
    expect(dialog).toHaveTextContent('Home Appliances / Mobiles & Tablets');

    await user.click(within(dialog).getByRole('button', { name: /apply changes/i }));

    await waitFor(() => expect(screen.getByText(/4 of 8 updated/i)).toBeInTheDocument());
    // The ids travel in display order, which the server does not care about, so compare them sorted.
    expect([...sent!.ids].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(sent!.action).toBe('set-category');
    expect(sent!.params).toEqual({ categoryId: 40 });

    // The list refreshes with the boxes cleared, so the next batch cannot inherit this one. Clearing
    // the last box takes the bar away with it, which is the visible proof that nothing carried over.
    const rowCheckbox = await screen.findByRole('checkbox', { name: 'Select NC-1004' });
    await waitFor(() => expect(rowCheckbox).not.toBeChecked());
    await waitFor(() => expect(screen.queryByTestId('product-bulk-bar')).not.toBeInTheDocument());
  });

  it('refuses to send an action whose parameter is missing', async () => {
    const user = userEvent.setup();
    const bar = await openInventory();
    captureBulk();

    await user.click(screen.getByRole('checkbox', { name: 'Select NC-1001' }));
    // Review stays clickable - the bar's action defaults to one that needs a parameter - so the guard
    // has to be the click itself: an inline alert, no dialog, and no request leaving the page.
    await user.click(within(bar()).getByRole('button', { name: /review changes/i }));

    expect(await within(bar()).findByRole('alert')).toHaveTextContent(/choose the category/i);
    expect(screen.queryByRole('dialog', { name: /confirm bulk edit/i })).not.toBeInTheDocument();
    expect(sent).toBeNull();
  });

  it('joins typed tags into the tag list the API expects', async () => {
    const user = userEvent.setup();
    const bar = await openInventory();
    captureBulk({ updated: 2, skipped: 0, failed: 0 });

    await user.click(screen.getByRole('checkbox', { name: 'Select NC-1001' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select NC-1002' }));
    await user.selectOptions(within(bar()).getByLabelText('Action'), 'add-tags');
    await user.type(within(bar()).getByLabelText('Tags'), 'Featured, Offer');
    await user.click(within(bar()).getByRole('button', { name: /review changes/i }));

    await user.click(within(await screen.findByRole('dialog', { name: /confirm bulk edit/i })).getByRole('button', { name: /apply changes/i }));

    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent).toEqual({ ids: [1, 2], action: 'add-tags', params: { tags: ['Featured', 'Offer'] } });
  });

  it('drops brand plumbing tags out of the tag suggestions', async () => {
    const user = userEvent.setup();
    const bar = await openInventory();

    await user.click(screen.getByRole('checkbox', { name: 'Select NC-1001' }));
    await user.selectOptions(within(bar()).getByLabelText('Action'), 'add-tags');
    const options = await screen.findByTestId('bulk-tag-options');
    const values = Array.from(options.querySelectorAll('option')).map(entry => entry.getAttribute('value'));
    expect(values).toEqual(['Featured', 'New arrival', '5G', 'Best seller']);
    expect(values.some(value => /^brand[:\s]/i.test(value ?? ''))).toBe(false);
  });

  it('sends the brand and the series together for assign-brand', async () => {
    const user = userEvent.setup();
    const bar = await openInventory();
    captureBulk({ updated: 1, skipped: 0, failed: 0 });

    await user.click(screen.getByRole('checkbox', { name: 'Select NC-1002' }));
    await user.selectOptions(within(bar()).getByLabelText('Action'), 'assign-brand');
    await user.selectOptions(within(bar()).getByLabelText('Brand'), '1');
    // The series list comes from the brand, so it can only offer that brand's series.
    const series = within(bar()).getByLabelText('Series');
    await waitFor(() => expect(series).toBeEnabled());
    expect(within(series).getByRole('option', { name: 'iPhone 17' })).toBeInTheDocument();
    expect(within(series).queryByRole('option', { name: 'Galaxy S25' })).not.toBeInTheDocument();
    await user.selectOptions(series, '11');

    await user.click(within(bar()).getByRole('button', { name: /review changes/i }));
    expect(await screen.findByRole('dialog', { name: /confirm bulk edit/i })).toHaveTextContent('Apple · iPhone 17');
    await user.click(within(screen.getByRole('dialog', { name: /confirm bulk edit/i })).getByRole('button', { name: /apply changes/i }));

    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent).toEqual({ ids: [2], action: 'assign-brand', params: { brandId: 1, productLineId: 11 } });
  });

  it('reports the products the server refused without failing the batch', async () => {
    const user = userEvent.setup();
    const bar = await openInventory();
    captureBulk({
      updated: 1,
      skipped: 0,
      failed: 1,
      items: [
        { id: 1, sku: 'NC-1001', name: 'Espresso Machine Pro', result: 'updated', reason: null },
        { id: 2, sku: 'NC-1002', name: 'Milk Frother', result: 'failed', reason: 'This product carries 20 tags and can take at most 20.' }
      ]
    });

    await user.click(screen.getByRole('checkbox', { name: 'Select NC-1001' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select NC-1002' }));
    await user.selectOptions(within(bar()).getByLabelText('Action'), 'deactivate');
    await user.click(within(bar()).getByRole('button', { name: /review changes/i }));
    await user.click(within(await screen.findByRole('dialog', { name: /confirm bulk edit/i })).getByRole('button', { name: /apply changes/i }));

    expect(await screen.findByText(/1 of 2 updated/i)).toBeInTheDocument();
    expect(await screen.findByText(/Milk Frother: This product carries 20 tags/i)).toBeInTheDocument();
  });

  it('shows the validation problem instead of a bare toast when the request is rejected', async () => {
    const user = userEvent.setup();
    const bar = await openInventory();
    server.use(http.post(`${API}/api/products/bulk`, () =>
      HttpResponse.json({
        type: 'https://ninecube.digital/problems/invalid_request', title: 'Bad request.', status: 400,
        code: 'invalid_request', detail: 'A bulk request covers at most 200 products.', correlationId: 'test-correlation-id',
        errors: { ids: ['A bulk request covers at most 200 products.'] }
      }, { status: 400 })));

    await user.click(screen.getByRole('checkbox', { name: 'Select NC-1003' }));
    await user.selectOptions(within(bar()).getByLabelText('Action'), 'deactivate');
    await user.click(within(bar()).getByRole('button', { name: /review changes/i }));
    await user.click(within(await screen.findByRole('dialog', { name: /confirm bulk edit/i })).getByRole('button', { name: /apply changes/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/at most 200 products/i);
  });

  it('leaves stock out of the action list', async () => {
    const user = userEvent.setup();
    const bar = await openInventory();

    await user.click(screen.getByRole('checkbox', { name: 'Select NC-1001' }));
    const action = within(bar()).getByLabelText('Action');
    expect(within(action).queryByRole('option', { name: /stock|price/i })).not.toBeInTheDocument();
    expect(within(action).getAllByRole('option')).toHaveLength(6);
  });
});
