import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Product, Order } from '../api/types';
import type { CartContextValue, CartLine } from '../state/CartContext';
import {
  searchProducts,
  compareProducts,
  formatOrderTracking,
  processCommerceUserMessage,
  loadShopperMemory,
  saveShopperMemory,
  clearShopperMemory,
  updateShopperMemoryFromInteraction,
  type ShoppingContext,
  type ShopperPreferenceMemory,
  type CommerceToolbox,
} from '../ai/commerceAgent';
import { CommerceAgentProvider } from '../ai/CommerceAgentContext';
import { CommerceCopilot } from '../components/ai/CommerceCopilot';
import { renderWithProviders } from './utils';

const MOCK_PRODUCTS: Product[] = [
  {
    id: 101,
    name: 'Acer Aspire Lite 15',
    sku: 'LAP-ACER-15',
    price: 54990,
    stockQuantity: 12,
    isActive: true,
    currency: 'BDT',
    brandName: 'Acer',
    brandSlug: 'acer',
    rowVersion: '1',
    description: 'Lightweight everyday laptop with 16GB RAM and fast SSD',
    categories: [{ id: 1, name: 'Laptops', slug: 'laptops', isPrimary: true }],
    specsJson: JSON.stringify({ Processor: 'Intel Core i5', RAM: '16GB', Storage: '512GB SSD' }),
  },
  {
    id: 102,
    name: 'Dell Inspiron 15',
    sku: 'LAP-DELL-15',
    price: 68500,
    stockQuantity: 4,
    isActive: true,
    currency: 'BDT',
    brandName: 'Dell',
    brandSlug: 'dell',
    rowVersion: '1',
    description: 'Premium business laptop with crisp Full HD screen',
    categories: [{ id: 1, name: 'Laptops', slug: 'laptops', isPrimary: true }],
    specsJson: JSON.stringify({ Processor: 'Intel Core i7', RAM: '16GB', Storage: '1TB SSD' }),
  },
  {
    id: 103,
    name: 'Apex Runner Pro Shoes',
    sku: 'SHOE-APEX-01',
    price: 3200,
    stockQuantity: 25,
    isActive: true,
    currency: 'BDT',
    brandName: 'Apex',
    brandSlug: 'apex',
    rowVersion: '1',
    description: 'Breathable lightweight running shoes with cushioned soles',
    categories: [{ id: 2, name: 'Footwear', slug: 'footwear', isPrimary: true }],
  },
  {
    id: 104,
    name: 'Vintage Mechanical Watch',
    sku: 'WATCH-VINT-01',
    price: 12500,
    stockQuantity: 0,
    isActive: true,
    currency: 'BDT',
    brandName: 'Titan',
    brandSlug: 'titan',
    rowVersion: '1',
    description: 'Classic analog watch with leather strap',
    categories: [{ id: 3, name: 'Watches', slug: 'watches', isPrimary: true }],
  },
];

const MOCK_ORDER: Order = {
  id: 501,
  customerId: 9,
  customerName: 'Customer One',
  status: 'Confirmed',
  totalAmount: 54990,
  createdAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-01T12:00:00Z',
  idempotencyKey: null,
  currency: 'BDT',
  items: [
    {
      id: 1,
      productId: 101,
      sku: 'LAP-ACER-15',
      name: 'Acer Aspire Lite 15',
      quantity: 1,
      unitPrice: 54990,
      lineTotal: 54990,
    },
  ],
};

function createMockCart(initialLines: CartLine[] = []): CartContextValue {
  let lines = [...initialLines];
  return {
    lines,
    total: lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),
    currency: 'BDT',
    mixedCurrencies: false,
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
    add: vi.fn((product, quantity) => {
      lines.push({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        unitPrice: product.price,
        quantity,
        available: product.stockQuantity,
      });
    }),
    setQuantity: vi.fn((productId, quantity) => {
      lines = lines.map(l => (l.productId === productId ? { ...l, quantity } : l));
    }),
    remove: vi.fn(productId => {
      lines = lines.filter(l => l.productId !== productId);
    }),
    clear: vi.fn(() => {
      lines = [];
    }),
    reconcile: vi.fn(),
  };
}

describe('AI Commerce Agent: Core Tools & Search Engine', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('searches products by natural language query and ranks relevant matches', () => {
    const results = searchProducts(MOCK_PRODUCTS, { query: 'Aspire laptop' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].sku).toBe('LAP-ACER-15');
    expect(results[0].price).toBe(54990);
  });

  it('filters by category, budget limit and stock status accurately', () => {
    const under60k = searchProducts(MOCK_PRODUCTS, {
      category: 'laptops',
      maxPrice: 60000,
      inStockOnly: true,
    });
    expect(under60k).toHaveLength(1);
    expect(under60k[0].name).toContain('Acer Aspire');

    const outOfStockExcluded = searchProducts(MOCK_PRODUCTS, {
      query: 'Watch',
      inStockOnly: true,
    });
    expect(outOfStockExcluded).toHaveLength(0);
  });

  it('constructs side-by-side comparison tables with spec breakdown and recommendation', () => {
    const comparison = compareProducts(MOCK_PRODUCTS, [101, 102]);
    expect(comparison).not.toBeNull();
    expect(comparison!.products).toHaveLength(2);
    expect(comparison!.specs.some(s => s.feature === 'Price')).toBe(true);
    expect(comparison!.specs.some(s => s.feature === 'Availability')).toBe(true);
    expect(comparison!.summary).toContain('Acer Aspire Lite 15');
    expect(comparison!.recommendedProductId).toBe(101);
  });

  it('tracks order progress step and human-readable status correctly', () => {
    const tracking = formatOrderTracking(MOCK_ORDER);
    expect(tracking.progressStep).toBe(2);
    expect(tracking.statusLabel).toBe('Confirmed & Processing');
    expect(tracking.formattedDate).toBeDefined();
  });
});

describe('AI Commerce Agent: Shopper Memory & Personalization', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists shopper memory across turns and sessions in localStorage', () => {
    let memory = loadShopperMemory();
    expect(memory.preferredCategories).toHaveLength(0);

    memory = updateShopperMemoryFromInteraction(memory, {
      category: 'laptops',
      budget: 70000,
      brand: 'Acer',
      query: 'lightweight laptop',
    });

    expect(memory.preferredCategories).toContain('laptops');
    expect(memory.preferredBrands).toContain('Acer');
    expect(memory.budgetRange?.max).toBe(70000);
    expect(memory.lastSearchQueries).toContain('lightweight laptop');

    // Reload from storage to verify serialization
    const reloaded = loadShopperMemory();
    expect(reloaded.preferredCategories).toContain('laptops');
    expect(reloaded.preferredBrands).toContain('Acer');

    clearShopperMemory();
    const wiped = loadShopperMemory();
    expect(wiped.preferredCategories).toHaveLength(0);
  });
});

describe('AI Commerce Agent: Conversational Intent & Grounded Actions', () => {
  let cart: CartContextValue;
  let toolbox: CommerceToolbox;
  let context: ShoppingContext;
  let memory: ShopperPreferenceMemory;

  beforeEach(() => {
    localStorage.clear();
    cart = createMockCart();
    toolbox = {
      allProducts: MOCK_PRODUCTS,
      cart,
      orders: [MOCK_ORDER],
      onValidateCoupon: vi.fn(async (code: string) => {
        if (code === 'SALE10') {
          return { isValid: true, discountAmount: 500 };
        }
        return { isValid: false, discountAmount: 0, reason: 'Invalid or expired code.' };
      }),
    };
    context = { turnCount: 0, focusedProductIds: [] };
    memory = loadShopperMemory();
  });

  it('handles search intent and suggests contextual follow-up quick prompts', async () => {
    const res = await processCommerceUserMessage('show me laptops under 70000', toolbox, context, memory);
    expect(res.actionTaken).toBe('search_products');
    expect(res.reply).toContain('Found');
    expect(res.reply).toContain('Acer Aspire Lite 15');
    expect(res.card?.type).toBe('products');
    expect(res.card?.products).toHaveLength(2);
    expect(res.updatedContext.activeCategory).toBe('laptop');
    expect(res.updatedContext.activeBudget).toBe(70000);
  });

  it('executes 1-click grounded Add-to-Cart actions with stock safeguards', async () => {
    const res = await processCommerceUserMessage('add Acer Aspire to cart', toolbox, context, memory);
    expect(res.actionTaken).toBe('add_to_cart');
    expect(cart.add).toHaveBeenCalledTimes(1);
    expect(res.reply).toContain('Added');
    expect(res.card?.type).toBe('cart');

    // Attempt to add out-of-stock product
    const outOfStockRes = await processCommerceUserMessage('add Vintage Mechanical Watch to cart', toolbox, context, memory);
    expect(outOfStockRes.reply).toContain('out of stock');
    expect(cart.add).toHaveBeenCalledTimes(1); // Not called again
  });

  it('supports conversational product comparisons with side-by-side matrices', async () => {
    const res = await processCommerceUserMessage('compare Acer Aspire with Dell Inspiron', toolbox, context, memory);
    expect(res.actionTaken).toBe('compare_products');
    expect(res.card?.type).toBe('comparison');
    expect(res.card?.comparison?.products).toHaveLength(2);
    expect(res.reply).toContain('Acer Aspire Lite 15');
  });

  it('tracks order statuses and returns order timeline cards', async () => {
    const res = await processCommerceUserMessage('where is my order #501', toolbox, context, memory);
    expect(res.actionTaken).toBe('track_order');
    expect(res.card?.type).toBe('order');
    expect(res.card?.order?.order.id).toBe(501);
    expect(res.card?.order?.statusLabel).toBe('Confirmed & Processing');
  });

  it('validates coupons and reports exact grounded savings', async () => {
    const res = await processCommerceUserMessage('apply coupon SALE10', toolbox, context, memory);
    expect(res.actionTaken).toBe('apply_coupon');
    expect(toolbox.onValidateCoupon).toHaveBeenCalledWith('SALE10');
    expect(res.reply).toContain('SALE10');
    expect(res.reply).toContain('is valid');
    expect(res.reply).toContain('500');
  });

  it('resets memory on user request', async () => {
    saveShopperMemory({
      preferredCategories: ['laptops'],
      preferredBrands: ['Acer'],
      lastSearchQueries: ['laptop'],
      purchasedCategories: [],
      updatedAt: Date.now(),
    });

    const res = await processCommerceUserMessage('clear memory', toolbox, context, memory);
    expect(res.reply).toContain('reset your shopping preferences');
    expect(res.updatedMemory.preferredCategories).toHaveLength(0);
  });

  it('triggers visual search analysis when attachedImage is provided', async () => {
    const res = await processCommerceUserMessage(
      'Can you find something similar to this?',
      toolbox,
      context,
      memory,
      { dataUrl: 'data:image/png;base64,mock', name: 'acer-laptop-photo.png' }
    );

    expect(res.actionTaken).toBe('visual_search');
    expect(res.reply).toContain('Visual Search Analysis');
    expect(res.reply).toContain('acer-laptop-photo.png');
    expect(res.card?.type).toBe('products');
    expect(res.card?.products?.[0]?.name).toBe('Acer Aspire Lite 15');
  });
});

describe('AI Commerce Agent: Copilot UI Component & Keyboard Shortcut', () => {
  it('renders launcher button and expands assistant on click', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CommerceAgentProvider>
        <CommerceCopilot />
      </CommerceAgentProvider>
    );

    const launcher = screen.getByRole('button', { name: /Open AI Shopping Copilot/i });
    expect(launcher).toBeInTheDocument();
    expect(launcher).toHaveTextContent('Copilot');
    expect(launcher).toHaveTextContent('Ctrl+J');

    await user.click(launcher);
    expect(await screen.findByRole('dialog', { name: /AI Shopping Copilot/i })).toBeInTheDocument();
    expect(screen.getByText('NineCube Copilot')).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/Ask anything, compare specs/i);
    expect(input).toBeInTheDocument();

    // Verify presence of camera attachment button
    const attachBtn = screen.getByRole('button', { name: /Attach image/i });
    expect(attachBtn).toBeInTheDocument();
  });
});
