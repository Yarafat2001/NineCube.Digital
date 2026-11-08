import { describe, it, expect } from 'vitest';
import { resolveDualProductImages } from '../lib/catalogImages';
import type { Product } from '../api/types';

describe('Catalog Dual Image Verification for SQA User Scenarios', () => {
  it('resolves Bashundhara Aromatic Chinigura Rice 10kg with authentic packaging and aromatic grains', () => {
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
      imageUrl: null,
    };
    const res = resolveDualProductImages(p);
    expect(res.primaryUrl).toBe('/products/bd/canonical_bashundhara_chinigura_packet_10kg.jpg');
    expect(res.secondaryUrl).toBe('/products/bd/canonical_chinigura_rice_open.jpg');
  });

  it('resolves Bashundhara Aromatic Chinigura Rice 10kg Export Quality with export badge', () => {
    const p: Product = {
      id: 108,
      sku: 'NC-BASH-10KG-NULL',
      slug: 'bashundhara-aromatic-chinigura-rice-10kg-export-quality',
      name: 'Bashundhara Aromatic Chinigura Rice 10kg Export Quality',
      price: 1622,
      currency: 'BDT',
      stockQuantity: 47,
      isActive: true,
      rowVersion: 'AAAAAAA=',
      categories: [{ id: 1, name: 'Rice', slug: 'rice', isPrimary: true }],
      images: [],
      imageUrl: null,
    };
    const res = resolveDualProductImages(p);
    expect(res.primaryUrl).toBe('/products/bd/canonical_bashundhara_chinigura_packet_export.jpg');
    expect(res.secondaryUrl).toBe('/products/bd/canonical_chinigura_rice_open.jpg');
  });

  it('resolves PRAN Atap Rice with distinct Atap packaging and sun-dried atap grains (NEVER Chinigura pouch)', () => {
    const p: Product = {
      id: 110,
      sku: 'NC-PRAN-ATAP-10KG',
      slug: 'pran-atap-rice-10kg',
      name: 'Pran Atap Rice 10kg',
      price: 2770,
      currency: 'BDT',
      stockQuantity: 139,
      isActive: true,
      rowVersion: 'AAAAAAA=',
      categories: [{ id: 1, name: 'Rice', slug: 'rice', isPrimary: true }],
      images: [],
      imageUrl: null,
    };
    const res = resolveDualProductImages(p);
    expect(res.primaryUrl).toBe('/products/bd/canonical_pran_atap_packet_10kg.jpg');
    expect(res.secondaryUrl).toBe('/products/bd/canonical_atap_rice_open.jpg');
    expect(res.primaryUrl).not.toContain('chinigura');
  });

  it('resolves Bashundhara Miniket and Najirshail with variety-specific packaging and grains', () => {
    const pMiniket: Product = {
      id: 111,
      sku: 'NC-BASH-MINIKET-10KG',
      slug: 'bashundhara-miniket-rice-10kg',
      name: 'Bashundhara Miniket Rice 10kg',
      price: 1850,
      currency: 'BDT',
      stockQuantity: 50,
      isActive: true,
      rowVersion: 'AAAAAAA=',
      categories: [{ id: 1, name: 'Rice', slug: 'rice', isPrimary: true }],
      images: [],
      imageUrl: null,
    };
    const resMiniket = resolveDualProductImages(pMiniket);
    expect(resMiniket.primaryUrl).toBe('/products/bd/canonical_bashundhara_miniket_packet_10kg.jpg');
    expect(resMiniket.secondaryUrl).toBe('/products/bd/canonical_miniket_rice_open.jpg');

    const pNajirshail: Product = {
      id: 112,
      sku: 'NC-BASH-NAJIR-10KG',
      slug: 'bashundhara-najirshail-rice-10kg',
      name: 'Bashundhara Najirshail Rice 10kg',
      price: 1950,
      currency: 'BDT',
      stockQuantity: 40,
      isActive: true,
      rowVersion: 'AAAAAAA=',
      categories: [{ id: 1, name: 'Rice', slug: 'rice', isPrimary: true }],
      images: [],
      imageUrl: null,
    };
    const resNajirshail = resolveDualProductImages(pNajirshail);
    expect(resNajirshail.primaryUrl).toBe('/products/bd/canonical_bashundhara_najirshail_packet_10kg.jpg');
    expect(resNajirshail.secondaryUrl).toBe('/products/bd/canonical_najirshail_rice_open.jpg');
  });

  it('resolves Fresh Mustard Oil 1L with authentic Fresh bottle and golden mustard seeds (NEVER idlis)', () => {
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

  it('resolves 10 Minute School courses with distinct official course cards and interactive dashboards', () => {
    const pPython: Product = {
      id: 113,
      sku: 'NC-10MS-PYTHON',
      slug: '10-minute-school-python-development-course-live-batch',
      name: '10 Minute School Python Development Course Live Batch',
      price: 4325,
      currency: 'BDT',
      stockQuantity: 78,
      isActive: true,
      rowVersion: 'AAAAAAA=',
      categories: [{ id: 5, name: 'Online Learning', slug: 'online-learning', isPrimary: true }],
      images: [],
      imageUrl: null,
    };
    const resPython = resolveDualProductImages(pPython);
    expect(resPython.primaryUrl).toBe('/products/bd/canonical_10ms_python_packet.jpg');
    expect(resPython.secondaryUrl).toBe('/products/bd/canonical_10ms_python_open.jpg');

    const pIelts: Product = {
      id: 114,
      sku: 'NC-10MS-IELTS',
      slug: '10-minute-school-ielts-preparation-course-certificate',
      name: '10 Minute School IELTS Preparation Course Certificate',
      price: 10214,
      currency: 'BDT',
      stockQuantity: 30,
      isActive: true,
      rowVersion: 'AAAAAAA=',
      categories: [{ id: 5, name: 'Online Learning', slug: 'online-learning', isPrimary: true }],
      images: [],
      imageUrl: null,
    };
    const resIelts = resolveDualProductImages(pIelts);
    expect(resIelts.primaryUrl).toBe('/products/bd/canonical_10ms_ielts_packet.jpg');
    expect(resIelts.secondaryUrl).toBe('/products/bd/canonical_10ms_ielts_open.jpg');
  });

  it('ensures toys and appliances never match rice patterns', () => {
    const pToy: Product = {
      id: 115,
      sku: 'NC-FISHER-PRICE',
      slug: 'fisher-price-educational-puzzle-age-3-gift-edition',
      name: 'Fisher-Price Educational Puzzle Age 3 Gift Edition',
      price: 1200,
      currency: 'BDT',
      stockQuantity: 20,
      isActive: true,
      rowVersion: 'AAAAAAA=',
      categories: [{ id: 6, name: 'Toys', slug: 'toys-kids-baby', isPrimary: true }],
      images: [],
      imageUrl: '/products/bd/fisher-price-educational-puzzle-age-3-gift-edition.jpg',
    };
    const resToy = resolveDualProductImages(pToy);
    expect(resToy.primaryUrl).not.toMatch(/canonical_.*(?:rice|chinigura|miniket|najirshail)/);
    expect(resToy.secondaryUrl).not.toMatch(/canonical_.*(?:rice|chinigura|miniket|najirshail)/);
  });

  it('preserves null for an uncatalogued custom product with no images to show placeholder', () => {
    const p: Product = {
      id: 109,
      sku: 'NC-CUSTOM-UNKNOWN',
      name: 'Mystery Custom Item Without Image',
      price: 99,
      currency: 'BDT',
      stockQuantity: 10,
      isActive: true,
      rowVersion: 'AAAAAAA=',
      images: [],
      imageUrl: null,
    };
    const res = resolveDualProductImages(p);
    expect(res.primaryUrl).toBeNull();
    expect(res.secondaryUrl).toBeNull();
  });
});
