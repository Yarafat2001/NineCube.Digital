import { describe, it, expect } from 'vitest';
import {
  isGeneratedPlaceholderImage,
  isRepresentativeImage,
  resolveDualProductImages
} from '../lib/catalogImages';
import type { Product } from '../api/types';

const baseProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 1,
  sku: 'NC-TEST-001',
  slug: 'test-product',
  name: 'Test Product',
  price: 100,
  currency: 'BDT',
  stockQuantity: 10,
  isActive: true,
  rowVersion: 'AAAAAAA=',
  categories: [{ id: 1, name: 'General', slug: 'general', isPrimary: true }],
  images: [],
  imageUrl: null,
  ...overrides
});

describe('Product image resolution', () => {
  it('classifies the generated vector art set as a placeholder', () => {
    expect(isGeneratedPlaceholderImage('/products/bd/aarong-bed-sheet-set-double.jpg')).toBe(true);
    expect(isGeneratedPlaceholderImage('/products/bd/canonical_chinigura_rice_open.jpg')).toBe(true);
    expect(isGeneratedPlaceholderImage('/products/bd/apple-iphone-12-open.jpg')).toBe(true);
    expect(isGeneratedPlaceholderImage('/products/BD-AARO-BEDD-000-79536D.jpg')).toBe(false);
    expect(isGeneratedPlaceholderImage('/products/sourced/100-e4526f42b165.png')).toBe(false);
    expect(isGeneratedPlaceholderImage('/products/laptops/acer-aspire-lite-al15-41-16gb-512gb-0-9259d53635.webp')).toBe(false);
    expect(isGeneratedPlaceholderImage('/uploads/merchant/photo.jpg')).toBe(false);
    expect(isGeneratedPlaceholderImage(null)).toBe(true);
  });

  it('treats a category-level stock photo as a real photo that needs the representative caption', () => {
    expect(isRepresentativeImage('/products/BD-HATI-GETA-207-646C35.placeholder.jpg')).toBe(true);
    expect(isRepresentativeImage('/products/BD-AARO-BEDD-000-79536D.jpg')).toBe(false);
    expect(isRepresentativeImage(null)).toBe(false);
  });

  it('passes a real primary photo and a real second angle straight through', () => {
    const product = baseProduct({
      images: [
        { id: 1, url: '/products/BD-AARO-BEDD-000-79536D.jpg', isPrimary: true, altText: 'Bed sheet on a bed' },
        { id: 2, url: '/products/sourced/170-d6906b260a7d.jpg', isPrimary: false, altText: 'Folded bed sheet' }
      ],
      imageUrl: '/products/BD-AARO-BEDD-000-79536D.jpg'
    });
    const resolved = resolveDualProductImages(product);
    expect(resolved.primaryUrl).toBe('/products/BD-AARO-BEDD-000-79536D.jpg');
    expect(resolved.secondaryUrl).toBe('/products/sourced/170-d6906b260a7d.jpg');
    expect(resolved.primaryAlt).toBe('Bed sheet on a bed');
    expect(resolved.secondaryAlt).toBe('Folded bed sheet');
  });

  it('drops the generated second angle instead of showing a drawing as "2 / 2 angles"', () => {
    const product = baseProduct({
      images: [
        { id: 1, url: '/products/BD-AARO-BEDD-000-79536D.jpg', isPrimary: true, altText: 'Bed sheet on a bed' },
        { id: 2, url: '/products/bd/aarong-bed-sheet-set-double-open.jpg', isPrimary: false, altText: 'Generated spread' }
      ],
      imageUrl: '/products/BD-AARO-BEDD-000-79536D.jpg'
    });
    const resolved = resolveDualProductImages(product);
    expect(resolved.primaryUrl).toBe('/products/BD-AARO-BEDD-000-79536D.jpg');
    expect(resolved.secondaryUrl).toBeNull();
    expect(resolved.secondaryAlt).toBeNull();
  });

  it('never promotes generated art to the product photo', () => {
    const product = baseProduct({
      images: [{ id: 1, url: '/products/bd/interactive-cares-spoken-english-course-certificate.jpg', isPrimary: true, altText: 'Generated course card' }],
      imageUrl: '/products/bd/interactive-cares-spoken-english-course-certificate.jpg'
    });
    const resolved = resolveDualProductImages(product);
    expect(resolved.primaryUrl).toBeNull();
    expect(resolved.secondaryUrl).toBeNull();
  });

  it('does not invent a slug-derived image for a product with no media', () => {
    const resolved = resolveDualProductImages(
      baseProduct({
        slug: 'bashundhara-aromatic-chinigura-rice-10kg',
        name: 'Bashundhara Aromatic Chinigura Rice 10kg',
        categories: [{ id: 2, name: 'Rice', slug: 'rice', isPrimary: true }]
      })
    );
    expect(resolved.primaryUrl).toBeNull();
    expect(resolved.secondaryUrl).toBeNull();
  });

  it('keeps a category-level stock photo when it is the only real image', () => {
    const product = baseProduct({
      images: [{ id: 1, url: '/products/BD-HATI-GETA-207-646C35.placeholder.jpg', isPrimary: true, altText: 'Bedroom' }],
      imageUrl: '/products/BD-HATI-GETA-207-646C35.placeholder.jpg'
    });
    const resolved = resolveDualProductImages(product);
    expect(resolved.primaryUrl).toBe('/products/BD-HATI-GETA-207-646C35.placeholder.jpg');
    expect(resolved.secondaryUrl).toBeNull();
  });

  it('honours an explicit gallery override, such as the angle the viewer selected', () => {
    const product = baseProduct({
      images: [
        { id: 1, url: '/products/BD-10MI-ONLI-000-3769A2.jpg', isPrimary: true, altText: 'Course banner' },
        { id: 2, url: '/products/bd/10-minute-school-spoken-english-course-live-batch.jpg', isPrimary: false, altText: 'Generated card' }
      ]
    });
    const resolved = resolveDualProductImages(product, [
      { id: 2, url: '/products/BD-10MI-ONLI-000-3769A2.jpg', isPrimary: false, altText: 'Course banner' }
    ]);
    expect(resolved.primaryUrl).toBe('/products/BD-10MI-ONLI-000-3769A2.jpg');
    expect(resolved.secondaryUrl).toBeNull();
  });

  it('keeps a merchant upload untouched', () => {
    const product = baseProduct({
      images: [{ id: 1, url: '/uploads/shops/9/photo.webp', isPrimary: true, altText: 'Shop photo' }],
      imageUrl: '/uploads/shops/9/photo.webp'
    });
    const resolved = resolveDualProductImages(product);
    expect(resolved.primaryUrl).toBe('/uploads/shops/9/photo.webp');
    expect(resolved.secondaryUrl).toBeNull();
  });

  it('does not repeat the primary photo as its own second angle', () => {
    const product = baseProduct({
      images: [
        { id: 1, url: '/products/BD-10MI-ONLI-000-3769A2.jpg', isPrimary: false, altText: 'Course banner' },
        { id: 2, url: '/products/BD-10MI-ONLI-000-3769A2.jpg', isPrimary: false, altText: 'Course banner duplicate' }
      ]
    });
    const resolved = resolveDualProductImages(product);
    expect(resolved.primaryUrl).toBe('/products/BD-10MI-ONLI-000-3769A2.jpg');
    expect(resolved.secondaryUrl).toBeNull();
  });
});
