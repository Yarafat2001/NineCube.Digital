import { describe, it, expect } from 'vitest';
import { resolveDualProductImages } from '../lib/catalogImages';
import type { Product } from '../api/types';

describe('Catalog Dual Image Verification for SQA User Scenarios', () => {
  it('resolves Bashundhara Aromatic Chinigura Rice 10kg with authentic burlap sack and aromatic grains', () => {
    const p: Product = {
      id: 101,
      sku: 'NC-BASH-10KG',
      slug: 'bashundhara-aromatic-chinigura-rice-10kg',
      name: 'Bashundhara Aromatic Chinigura Rice 10kg',
      price: 1532,
      currency: 'BDT',
      stockQuantity: 169,
      isActive: true,
      rowVersion: 'AAAAAAA=',
      categories: [{ id: 1, name: 'Rice', slug: 'rice', isPrimary: true }],
      images: [],
      imageUrl: '/products/bd/canonical_bashundhara_rice_packet_10kg.jpg',
    };
    const res = resolveDualProductImages(p);
    expect(res.primaryUrl).toBe('/products/bd/canonical_bashundhara_rice_packet_10kg.jpg');
    expect(res.secondaryUrl).toBe('/products/bd/canonical_chinigura_rice_open.jpg');
  });

  it('resolves Fresh Mustard Oil 1L with authentic Fresh bottle and golden mustard oil with seeds (NEVER idlis)', () => {
    const p: Product = {
      id: 102,
      sku: 'NC-MUSTARD-1L',
      slug: 'fresh-mustard-oil-1l',
      name: 'Fresh Mustard Oil 1L',
      price: 1961,
      currency: 'BDT',
      stockQuantity: 28,
      isActive: true,
      rowVersion: 'AAAAAAA=',
      categories: [{ id: 2, name: 'Cooking Oil', slug: 'cooking-oil', isPrimary: true }],
      images: [],
      imageUrl: '/products/bd/fresh-mustard-oil-1l.jpg',
    };
    const res = resolveDualProductImages(p);
    expect(res.primaryUrl).toBe('/products/bd/canonical_fresh_mustard_packet.jpg');
    expect(res.secondaryUrl).toBe('/products/bd/canonical_mustard_oil_open.jpg');
    expect(res.primaryUrl).not.toContain('idli');
    expect(res.secondaryUrl).not.toContain('idli');
  });

  it('resolves Extra Virgin Olive Oil with authentic olive bottle and olive oil with olives (NEVER avocados)', () => {
    const p: Product = {
      id: 103,
      sku: 'NC-OLIVE-1L',
      slug: 'fresh-extra-virgin-olive-oil-1l',
      name: 'Fresh Extra Virgin Olive Oil 1L',
      price: 1762,
      currency: 'BDT',
      stockQuantity: 0,
      isActive: true,
      rowVersion: 'AAAAAAA=',
      categories: [{ id: 2, name: 'Cooking Oil', slug: 'cooking-oil', isPrimary: true }],
      images: [],
      imageUrl: '/products/bd/fresh-extra-virgin-olive-oil-1l.jpg',
    };
    const res = resolveDualProductImages(p);
    expect(res.primaryUrl).toBe('/products/bd/canonical_olive_oil_packet.jpg');
    expect(res.secondaryUrl).toBe('/products/bd/canonical_olive_oil_open.jpg');
    expect(res.primaryUrl).not.toContain('avocado');
    expect(res.secondaryUrl).not.toContain('avocado');
  });

  it('resolves Aarong Anklet Gold Plated with luxury gift box and authentic payel on ankle (NEVER necklace)', () => {
    const p: Product = {
      id: 104,
      sku: 'NC-ANKLET-GOLD',
      slug: 'aarong-anklet-gold-plated-premium-line',
      name: 'Aarong Anklet Gold Plated Premium Line',
      price: 11434,
      currency: 'BDT',
      stockQuantity: 99,
      isActive: true,
      rowVersion: 'AAAAAAA=',
      categories: [{ id: 3, name: 'Fashion Jewelry', slug: 'fashion-jewelry', isPrimary: true }],
      images: [],
      imageUrl: '/products/bd/aarong-anklet-gold-plated-premium-line.jpg',
    };
    const res = resolveDualProductImages(p);
    expect(res.primaryUrl).toBe('/products/bd/canonical_anklet_gold_packet.jpg');
    expect(res.secondaryUrl).toBe('/products/bd/canonical_anklet_gold_open.jpg');
    expect(res.primaryUrl).not.toContain('necklace');
    expect(res.secondaryUrl).not.toContain('necklace');
  });

  it('resolves Aarong Baby Winter Set with packaging and knit sweater with buttons (NEVER girl in flowers)', () => {
    const p: Product = {
      id: 105,
      sku: 'NC-BABY-WINTER-M',
      slug: 'aarong-baby-winter-set-size-m',
      name: 'Aarong Baby Winter Set Size M',
      price: 2151,
      currency: 'BDT',
      stockQuantity: 167,
      isActive: true,
      rowVersion: 'AAAAAAA=',
      categories: [{ id: 4, name: 'Kids Clothing', slug: 'kids-clothing', isPrimary: true }],
      images: [],
      imageUrl: '/products/bd/aarong-baby-winter-set-size-m.jpg',
    };
    const res = resolveDualProductImages(p);
    expect(res.primaryUrl).toBe('/products/bd/canonical_baby_winter_packet.jpg');
    expect(res.secondaryUrl).toBe('/products/bd/canonical_baby_winter_open.jpg');
  });

  it('resolves 10 Minute School Courses with real course cards and learning dashboard (NEVER dummy text placards)', () => {
    const p: Product = {
      id: 106,
      sku: 'NC-10MS-FREE',
      slug: '10-minute-school-freelancing-masterclass-certificate',
      name: '10 Minute School Freelancing Masterclass Certificate',
      price: 1994,
      currency: 'BDT',
      stockQuantity: 25,
      isActive: true,
      rowVersion: 'AAAAAAA=',
      categories: [{ id: 5, name: 'Online Learning', slug: 'online-learning', isPrimary: true }],
      images: [],
      imageUrl: '/products/bd/canonical_10ms_freelancing_packet.jpg',
    };
    const res = resolveDualProductImages(p);
    expect(res.primaryUrl).toBe('/products/bd/canonical_10ms_freelancing_packet.jpg');
    expect(res.secondaryUrl).toBe('/products/bd/canonical_10ms_freelancing_open.jpg');
  });
});
