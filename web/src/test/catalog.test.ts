import { describe, expect, it } from 'vitest';
import type { Product } from '../api/types';
import { activeFilterCount, cardPresentation, CATALOG_FILTER_KEYS, isFilterActive, mergeSearchParams } from '../lib/catalog';

const base: Product = { id: 1, sku: 'NC-1', name: 'x', price: 1, stockQuantity: 1, isActive: true, rowVersion: null };

describe('cardPresentation', () => {
  it('strips the trailing SKU parenthetical and the repeated brand prefix', () => {
    const { brand, displayName } = cardPresentation({
      ...base,
      name: "Apex Apex Men's Dress Shoe (91314a67)",
      brandName: 'Apex'
    });
    expect(brand).toBe('Apex');
    expect(displayName).toBe("Men's Dress Shoe");
  });

  it('handles a 120 character name and a 60 character SKU without spaces', () => {
    const longName = `${'Widget '.repeat(14)}${'x'.repeat(22)}`.trim().slice(0, 120);
    const sku = 'A'.repeat(60);
    const { displayName, fullName } = cardPresentation({ ...base, name: longName, sku });
    expect(fullName).toHaveLength(120);
    // Nothing here can force a line wider than the card: the name is clamped in CSS, and no
    // synthetic text is inserted.
    expect(displayName.length).toBeGreaterThan(100);
    expect(sku).not.toContain(displayName);
  });

  it('keeps Bengali names intact', () => {
    const { displayName, variant } = cardPresentation({ ...base, name: 'সামসান্স গ্যালাক্সি এ৫৬ ৮জিবি/১২৮জিবি, কালো', brandName: 'Samsung' });
    expect(displayName).toContain('গ্যালাক্সি');
    expect(variant).toBe('');
  });

  it('moves colour and storage into the variant summary', () => {
    const { displayName, variant } = cardPresentation({ ...base, name: 'Apple iPhone 17 Pro 256GB, Black (83170042)', brandName: 'Apple' });
    expect(displayName).toBe('iPhone 17 Pro 256GB');
    expect(variant).toBe('256GB, Black');
  });

  it('falls back to the Brand: tag when the product has no brand row', () => {
    const { brand } = cardPresentation({ ...base, name: 'Generic Kettle', tags: ['Brand: Generic'] });
    expect(brand).toBe('Generic');
  });

  it('never leaves an empty display name', () => {
    const { displayName } = cardPresentation({ ...base, name: 'Walton (1234ab)', brandName: 'Walton' });
    expect(displayName).toBe('Walton');
  });
});

describe('URL filter helpers', () => {
  it('merges a card chip without wiping the live filters', () => {
    const current = new URLSearchParams('brand=apple&q=kettle&page=2');
    expect(mergeSearchParams(current, { category: 'mobiles' })).toBe('?brand=apple&q=kettle&category=mobiles');
    expect(mergeSearchParams(current, { brand: null })).toBe('?q=kettle');
  });

  it('counts only the filters that change the default behaviour', () => {
    expect(activeFilterCount(new URLSearchParams('sort=name&includeDescendants=true'))).toBe(0);
    expect(isFilterActive('sort', 'name')).toBe(false);
    expect(activeFilterCount(new URLSearchParams('brand=apple&brand=samsung&line=iphone-17&minPrice=10'))).toBe(4);
    expect(CATALOG_FILTER_KEYS).toContain('brand');
  });
});
