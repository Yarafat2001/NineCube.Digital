import { fireEvent, screen, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Product } from '../api/types';
import { API, problem } from './handlers';
import { server } from './server';
import { renderApp, seedSession } from './utils';

const longName = `Apex ${'Widget '.repeat(10)}${'x'.repeat(34)} (64010a13)`.slice(0, 120);
const cardProduct: Product = {
  id: 77,
  sku: 'A'.repeat(60),
  name: longName,
  price: 1234.5,
  currency: 'BDT',
  stockQuantity: 2,
  isActive: true,
  rowVersion: null,
  brandName: 'Apex',
  categories: [{ id: 1, name: 'Long Category Name For Testing Truncation', slug: 'long-category', isPrimary: true }],
  tags: ['Featured', 'New arrival', '5G', 'Best seller'],
  imageUrl: '/uploads/missing.png',
  images: [{ id: 1, url: '/uploads/missing.png', isPrimary: true, altText: 'Apex widget' }]
};

async function openCard(product: Product) {
  const user = seedSession('Customer');
  const one = { items: [product], page: 1, pageSize: 8, totalCount: 1, totalPages: 1, hasNext: false, hasPrevious: false };
  server.use(
    http.get(`${API}/api/auth/me`, () => HttpResponse.json(user)),
    http.get(`${API}/api/products`, () => HttpResponse.json(one)),
    http.get(`${API}/api/products/:id`, ({ params }) =>
      Number(params.id) === product.id
        ? HttpResponse.json(product)
        : HttpResponse.json(problem(404, 'not_found', 'Not found.', 'Missing.'), { status: 404 })
    )
  );
  renderApp('/products');
  return screen.findByTestId(`product-${product.id}`);
}

/**
 * The card has a fixed shape. jsdom cannot measure layout, so these tests pin the DOM contract that
 * makes the shape possible: the SKU is absent (it was the 495px line that broke the grid), the long
 * name lives behind a clamped element with the full text as a tooltip, and the media area always
 * renders - either the image or the placeholder of the same height.
 */
describe('Product card shape', () => {
  it('shows a short name, the variant line and no SKU', async () => {
    const card = await openCard({ ...cardProduct, name: 'Apex iPhone 17 Pro 256GB, Black (83170042)', sku: '83170042' });

    expect(within(card).getByText('Apex')).toBeInTheDocument();
    expect(within(card).getByRole('heading', { name: 'iPhone 17 Pro 256GB' })).toHaveAttribute('title', 'Apex iPhone 17 Pro 256GB, Black (83170042)');
    expect(within(card).getByText('256GB, Black')).toBeInTheDocument();
    expect(card.textContent).not.toContain('83170042');
    expect(within(card).getByText(/1,234\.50/)).toBeInTheDocument();
  });

  it('clamps a 120 character name and hides the extra tags behind +N', async () => {
    const card = await openCard(cardProduct);

    const name = within(card).getByRole('heading', { level: 3 });
    expect(name).toHaveClass('product-card__name');
    expect(name.textContent!.length).toBeLessThan(longName.length);
    expect(name).toHaveAttribute('title', longName);
    expect(within(card).getByText('Long Category Name For Testing Truncation')).toBeInTheDocument();
    expect(within(card).getAllByText('Featured')).toHaveLength(1);
    expect(within(card).getByText('+2')).toBeInTheDocument();
    expect(within(card).queryByText('Best seller')).not.toBeInTheDocument();
    expect(card.textContent).not.toContain('A'.repeat(60));
  });

  it('replaces a missing image with the placeholder', async () => {
    const card = await openCard({ ...cardProduct, imageUrl: null, images: [] });
    const placeholder = within(card).getByTestId('image-placeholder');
    expect(within(placeholder).getByText('No image')).toBeInTheDocument();
    expect(placeholder).toHaveAccessibleName(/no image for/i);
    expect(card.querySelector('img')).toBeNull();
  });

  it('falls back to the placeholder when the stored URL fails to load', async () => {
    const card = await openCard(cardProduct);
    const image = card.querySelector('img') as HTMLImageElement;
    // The photo is described by the alt text stored with it, and a root-relative path is qualified
    // for the API host.
    expect(image.getAttribute('alt')).toBe('Apex widget');
    expect(image.getAttribute('src')).toBe('http://localhost:5080/uploads/missing.png');

    fireEvent.error(image);
    expect(within(card).getByTestId('image-placeholder')).toBeInTheDocument();
    expect(card.querySelector('img')).toBeNull();
  });

  it('describes an image with no alt text by the product name', async () => {
    const card = await openCard({
      ...cardProduct,
      id: 78,
      images: [{ id: 2, url: '/uploads/missing.png', isPrimary: true, altText: null }]
    });
    expect(card.querySelector('img')).toHaveAttribute('alt', longName);
  });

  it('renders a Bengali name as a name, and keeps the SKU off the card', async () => {
    const bangla = 'গ্রামীণফোন পাওয়ার ব্যাংক ২০০০ এমএইচ, কালো (64010b13)';
    const card = await openCard({ ...cardProduct, name: bangla });

    // The attribute words are Latin, so a name in another script must still clamp, keep its tooltip
    // and above all not push the 60 character SKU back into the card.
    const name = within(card).getByRole('heading', { level: 3 });
    expect(name.textContent).toContain('গ্রামীণফোন পাওয়ার ব্যাংক');
    expect(name).toHaveAttribute('title', bangla);
    expect(name.textContent).not.toContain('64010b13');
    expect(card.textContent).not.toContain('A'.repeat(60));
  });

  it('keeps the app-owned catalogue photos on the app origin', async () => {
    const card = await openCard({ ...cardProduct, imageUrl: '/products/nc-1001.jpg', images: [] });
    // Qualifying these with the API origin was how every seeded photo ended up a 404.
    expect((card.querySelector('img') as HTMLImageElement).getAttribute('src')).toBe('/products/nc-1001.jpg');
    expect(card.querySelector('img')).toHaveClass('product-card__image--photo');
  });

  it('links the card to the detail page, where the full name and the SKU live', async () => {
    const user = userEvent.setup();
    const card = await openCard(cardProduct);

    await user.click(within(card).getByRole('link', { name: `Open ${longName}` }));

    expect(await screen.findByRole('heading', { level: 1, name: longName })).toBeInTheDocument();
    expect(screen.getByText('A'.repeat(60))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Copy SKU ${'A'.repeat(60)}` })).toBeInTheDocument();
  });
});
