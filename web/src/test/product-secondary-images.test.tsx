import { render, screen, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ProductImage } from '../components/ProductImage';
import type { Product } from '../api/types';

describe('Product secondary image slideshow and clean presentation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const baseProduct: Product = {
    id: 101,
    sku: 'NC-TEST-001',
    name: 'Real Bangladesh Product',
    price: 150,
    currency: 'BDT',
    stockQuantity: 20,
    isActive: true,
    rowVersion: null,
    categories: [{ id: 1, name: 'Groceries', slug: 'groceries', isPrimary: true }],
    imageUrl: '/products/real-photo-1.jpg',
    images: [{ id: 1, url: '/products/real-photo-1.jpg', isPrimary: true, altText: 'Front photo' }]
  };

  it('renders ONLY primary image when product has no real second image', () => {
    const { container } = render(<ProductImage product={baseProduct} frame="card" />);

    const images = container.querySelectorAll('img');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute('src', '/products/real-photo-1.jpg');

    // Asserts no "Packet" or "Inside" buttons or pills exist
    expect(container.querySelector('.product-card__view-toggle')).toBeNull();
    expect(screen.queryByText(/Packet/i)).toBeNull();
    expect(screen.queryByText(/Inside/i)).toBeNull();
  });

  it('does NOT treat generated vector art as a real secondary image', () => {
    const productWithDummySecond: Product = {
      ...baseProduct,
      images: [
        { id: 1, url: '/products/real-photo-1.jpg', isPrimary: true, altText: 'Front' },
        { id: 2, url: '/products/bd/canonical_bashundhara_chinigura_packet_10kg.jpg', isPrimary: false, altText: 'Generated second angle' }
      ]
    };

    const { container } = render(<ProductImage product={productWithDummySecond} frame="card" />);
    const images = container.querySelectorAll('img');

    // Only the real primary image should be rendered
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute('src', '/products/real-photo-1.jpg');
    expect(container.querySelector('.product-card__image--secondary')).toBeNull();
  });

  it('skips a generated middle image and still uses the real photo after it as the second angle', () => {
    const product: Product = {
      ...baseProduct,
      images: [
        { id: 1, url: '/products/real-front.jpg', isPrimary: true, altText: 'Front' },
        { id: 2, url: '/products/bd/real-front-open.jpg', isPrimary: false, altText: 'Drawing' },
        { id: 3, url: '/products/real-detail.jpg', isPrimary: false, altText: 'Detail' }
      ]
    };

    const { container } = render(<ProductImage product={product} frame="card" />);
    const secondary = container.querySelector('.product-card__image--secondary') as HTMLImageElement | null;

    expect(container.querySelectorAll('img')).toHaveLength(2);
    expect(secondary).not.toBeNull();
    expect(secondary?.src).toContain('/products/real-detail.jpg');
    expect(secondary?.src).not.toContain('/products/bd/');
  });

  it('cycles between real primary and real secondary images over time without any packet/inside buttons', () => {
    const productWithRealSecond: Product = {
      ...baseProduct,
      images: [
        { id: 1, url: '/products/real-front.jpg', isPrimary: true, altText: 'Front View' },
        { id: 2, url: '/products/real-back.jpg', isPrimary: false, altText: 'Back View' }
      ]
    };

    const { container } = render(<ProductImage product={productWithRealSecond} frame="card" />);

    // Zero Packet / Inside buttons or icons
    expect(container.querySelector('.product-card__view-toggle')).toBeNull();
    expect(screen.queryByText(/Packet/i)).toBeNull();
    expect(screen.queryByText(/Inside/i)).toBeNull();

    // Two real images are present for smooth crossfade
    const images = container.querySelectorAll('img');
    expect(images).toHaveLength(2);

    const primaryImg = container.querySelector('.product-card__image--primary') as HTMLImageElement;
    const secondaryImg = container.querySelector('.product-card__image--secondary') as HTMLImageElement;

    expect(primaryImg).not.toBeNull();
    expect(secondaryImg).not.toBeNull();
    expect(primaryImg.src).toContain('/products/real-front.jpg');
    expect(secondaryImg.src).toContain('/products/real-back.jpg');

    // Initially, primary is visible and secondary is not marked visible
    expect(secondaryImg).not.toHaveClass('product-card__image--visible');

    // Advance time past initial stagger + interval
    act(() => {
      vi.advanceTimersByTime(4000);
    });

    // Secondary image is now active (visible)
    expect(secondaryImg).toHaveClass('product-card__image--visible');
    expect(primaryImg).toHaveClass('product-card__image--hidden');

    // Advance time again
    act(() => {
      vi.advanceTimersByTime(3600);
    });

    // Cycles back to primary image
    expect(secondaryImg).not.toHaveClass('product-card__image--visible');
    expect(primaryImg).not.toHaveClass('product-card__image--hidden');
  });
});
