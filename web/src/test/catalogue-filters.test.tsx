import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { API } from './handlers';
import { server } from './server';
import { renderAppWithHistory, seedSession } from './utils';
import { HttpResponse, http } from 'msw';

/**
 * Every filter lives in the URL, so these tests read the router location rather than component
 * state: a control that updates the grid but not the URL (or the other way round) is the bug that
 * made selections disappear on reload.
 */
async function signIn() {
  const user = seedSession('Customer');
  server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(user)));
}

function panel() {
  return within(screen.getByRole('complementary', { name: /catalogue filters/i }));
}

async function openCatalogue(route = '/products') {
  await signIn();
  const view = renderAppWithHistory(route);
  await screen.findByRole('heading', { name: /catalogue/i });
  return view;
}

describe('Brand and series filters', () => {
  it('selects a brand, shows only its series, and writes both to the URL', async () => {
    const user = userEvent.setup();
    const { router } = await openCatalogue();

    // The facet count is the number of products the filter will return, not a static catalogue total.
    expect(await panel().findByRole('checkbox', { name: /Apple\s*3/i })).not.toBeChecked();

    await user.click(panel().getByRole('checkbox', { name: /Apple/i }));

    await waitFor(() => expect(router.state.location.search).toBe('?brand=apple'));
    // Only the three Apple phones survive the filter, and the series group appeared for that brand.
    expect(await screen.findByText(/3 products found/i)).toBeInTheDocument();
    expect(screen.queryByText(/Milk Frother/i)).not.toBeInTheDocument();
    await panel().findByText('Series');

    await user.click(panel().getByRole('checkbox', { name: /iPhone 17/i }));
    await waitFor(() => expect(router.state.location.search).toBe('?brand=apple&line=iphone-17'));
    expect(await screen.findByText(/2 products found/i)).toBeInTheDocument();

    // Removing the brand must remove its series too, otherwise the impossible pair stays in the URL.
    await user.click(panel().getByRole('checkbox', { name: /Apple/i }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(screen.queryByText('Series')).not.toBeInTheDocument();
  });

  it('applies a series reached straight from the URL', async () => {
    await openCatalogue('/products?brand=apple&line=iphone-16');
    const checkbox = await panel().findByRole('checkbox', { name: /iPhone 16/i });
    expect(checkbox).toBeChecked();
    await waitFor(() => expect(screen.getByText(/1 product found/i)).toBeInTheDocument());
  });

  it('restores the selection on reload and after navigating back and forward', async () => {
    const user = userEvent.setup();
    const { router, unmount } = await openCatalogue();

    expect(await panel().findByRole('checkbox', { name: /Apple/i })).not.toBeChecked();
    await user.click(panel().getByRole('checkbox', { name: /Apple/i }));
    await waitFor(() => expect(router.state.location.search).toBe('?brand=apple'));

    await user.click(panel().getByRole('checkbox', { name: /iPhone 17/i }));
    await waitFor(() => expect(router.state.location.search).toBe('?brand=apple&line=iphone-17'));

    // Each filter change is a history entry, so the browser back button steps out of the series
    // while the brand stays selected.
    router.navigate(-1);
    await waitFor(() => expect(router.state.location.search).toBe('?brand=apple'));
    expect(await panel().findByRole('checkbox', { name: /Apple/i })).toBeChecked();
    expect(panel().getByRole('checkbox', { name: /iPhone 17/i })).not.toBeChecked();

    router.navigate(1);
    await waitFor(() => expect(router.state.location.search).toBe('?brand=apple&line=iphone-17'));
    expect(await panel().findByRole('checkbox', { name: /iPhone 17/i })).toBeChecked();

    // A reload builds a fresh router from the address bar alone; the panel must light up from it.
    unmount();
    await openCatalogue('/products?brand=apple&line=iphone-17');
    expect(await panel().findByRole('checkbox', { name: /Apple/i })).toBeChecked();
    expect(await panel().findByRole('checkbox', { name: /iPhone 17/i })).toBeChecked();
    expect(await screen.findByText(/2 products found/i)).toBeInTheDocument();
  });
});

describe('Active filter chips and reset', () => {
  it('removes one filter without touching the others', async () => {
    const user = userEvent.setup();
    const { router } = await openCatalogue('/products?brand=apple&tag=Featured');

    const chip = await screen.findByRole('button', { name: /Remove Brand: Apple filter/i });
    await user.click(chip);

    await waitFor(() => expect(router.state.location.search).toBe('?tag=Featured'));
    expect(screen.queryByRole('button', { name: /Remove Brand: Apple filter/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove Tag: Featured filter/i })).toBeInTheDocument();
  });

  it('resets every control from the panel', async () => {
    const user = userEvent.setup();
    const { router } = await openCatalogue('/products?brand=apple&line=iphone-17&minPrice=100&sort=price');

    await user.click(await panel().findByRole('button', { name: /^reset all$/i }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(panel().getByRole('checkbox', { name: /Apple/i })).not.toBeChecked();
  });
});

describe('Price range', () => {
  it('keeps the slider and the number fields in sync and only sends valid ranges', async () => {
    const user = userEvent.setup();
    const { router } = await openCatalogue();

    await user.type(panel().getByRole('spinbutton', { name: /^min price$/i }), '5000');
    await waitFor(() => expect(router.state.location.search).toBe('?minPrice=5000'), { timeout: 2000 });
    expect(panel().getByRole('slider', { name: /minimum price slider/i })).toHaveValue('5000');

    await user.type(panel().getByRole('spinbutton', { name: /^max price$/i }), '1000');
    expect(await panel().findByText(/minimum must not be above the maximum/i)).toBeInTheDocument();
    // The invalid value is held in the field but never reaches the URL, so the grid stays usable.
    await waitFor(() => expect(router.state.location.search).toBe('?minPrice=5000'));

    await user.clear(panel().getByRole('spinbutton', { name: /^max price$/i }));
    await user.type(panel().getByRole('spinbutton', { name: /^max price$/i }), '9000');
    await waitFor(() => expect(router.state.location.search).toBe('?minPrice=5000&maxPrice=9000'), { timeout: 2000 });
  });
});

describe('Mobile filter drawer', () => {
  it('applies the draft only on Apply and discards it on Cancel', async () => {
    const user = userEvent.setup();
    const { router } = await openCatalogue();

    await user.click(screen.getAllByRole('button', { name: /^Filters \(\d+\)$/i })[0]!);
    const drawer = screen.getByRole('dialog', { name: /filter products/i });

    // Tags are a checkbox list in the drawer too, so a selection is a click, not a selectOption.
    await user.click(within(drawer).getByRole('checkbox', { name: /^Featured/ }));
    expect(router.state.location.search).toBe('');

    await user.click(within(drawer).getByRole('button', { name: /apply filters/i }));
    await waitFor(() => expect(router.state.location.search).toBe('?tag=Featured'));

    await user.click(screen.getAllByRole('button', { name: /^Filters \(\d+\)$/i })[0]!);
    const second = screen.getByRole('dialog', { name: /filter products/i });
    await user.click(within(second).getByRole('checkbox', { name: /^New arrival/ }));
    await user.click(within(second).getByRole('button', { name: /cancel/i }));
    expect(router.state.location.search).toBe('?tag=Featured');
  });
});
