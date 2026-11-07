/**
 * NineCube.Digital - AI Commerce Intelligence Engine
 * Grounded commerce reasoning, multi-turn state tracking, tool execution, and shopper personalization.
 */

import type { Product, Order } from '../api/types';
import type { CartContextValue } from '../state/CartContext';

export interface AgentProductMatch {
  product: Product;
  relevanceScore: number;
  highlightReason?: string;
  isBestMatch?: boolean;
}

export interface ComparisonSpec {
  feature: string;
  values: Record<number, string>;
  winnerProductId?: number;
}

export interface ProductComparisonData {
  products: Product[];
  specs: ComparisonSpec[];
  summary: string;
  recommendedProductId?: number;
}

export interface CartCardData {
  items: {
    productId: number;
    sku: string;
    name: string;
    price: number;
    quantity: number;
  }[];
  total: number;
  currency: string;
  couponCode?: string;
  discountAmount?: number;
  itemCount: number;
}

export interface OrderTrackingData {
  order: Order;
  progressStep: number; // 1: Placed, 2: Confirmed, 3: Shipped, 4: Delivered
  statusLabel: string;
  formattedDate: string;
}

export interface AgentCardContent {
  type: 'products' | 'comparison' | 'cart' | 'order' | 'support' | 'memory';
  products?: Product[];
  comparison?: ProductComparisonData;
  cart?: CartCardData;
  order?: OrderTrackingData;
  supportTopic?: string;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  card?: AgentCardContent;
  actionTaken?: string;
  quickPrompts?: string[];
  imageUrl?: string;
  imageName?: string;
}

export interface ShopperPreferenceMemory {
  preferredCategories: string[];
  preferredBrands: string[];
  budgetRange?: { min?: number; max?: number };
  lastSearchQueries: string[];
  purchasedCategories: string[];
  updatedAt: number;
}

export interface ShoppingContext {
  activeCategory?: string;
  activeBudget?: number;
  activeBrand?: string;
  focusedProductIds: number[];
  lastAction?: string;
  turnCount: number;
}

const MEMORY_KEY = 'ninecube:ai-shopper-memory';

export function loadShopperMemory(): ShopperPreferenceMemory {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) return createDefaultMemory();
    const parsed = JSON.parse(raw);
    return {
      preferredCategories: Array.isArray(parsed.preferredCategories) ? parsed.preferredCategories : [],
      preferredBrands: Array.isArray(parsed.preferredBrands) ? parsed.preferredBrands : [],
      budgetRange: parsed.budgetRange ?? undefined,
      lastSearchQueries: Array.isArray(parsed.lastSearchQueries) ? parsed.lastSearchQueries.slice(-10) : [],
      purchasedCategories: Array.isArray(parsed.purchasedCategories) ? parsed.purchasedCategories : [],
      updatedAt: parsed.updatedAt ?? Date.now(),
    };
  } catch {
    return createDefaultMemory();
  }
}

export function saveShopperMemory(memory: ShopperPreferenceMemory): void {
  try {
    memory.updatedAt = Date.now();
    localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
  } catch {
    // LocalStorage quota or access error handled gracefully
  }
}

export function clearShopperMemory(): void {
  try {
    localStorage.removeItem(MEMORY_KEY);
  } catch {
    // Ignore
  }
}

function createDefaultMemory(): ShopperPreferenceMemory {
  return {
    preferredCategories: [],
    preferredBrands: [],
    lastSearchQueries: [],
    purchasedCategories: [],
    updatedAt: Date.now(),
  };
}

export function updateShopperMemoryFromInteraction(
  current: ShopperPreferenceMemory,
  intent: { category?: string; brand?: string; budget?: number; query?: string }
): ShopperPreferenceMemory {
  const updated = { ...current };

  if (intent.category && !updated.preferredCategories.includes(intent.category)) {
    updated.preferredCategories = [intent.category, ...updated.preferredCategories].slice(0, 5);
  }

  if (intent.brand && !updated.preferredBrands.includes(intent.brand)) {
    updated.preferredBrands = [intent.brand, ...updated.preferredBrands].slice(0, 5);
  }

  if (intent.budget) {
    updated.budgetRange = {
      min: updated.budgetRange?.min,
      max: intent.budget,
    };
  }

  if (intent.query && intent.query.trim().length > 1) {
    updated.lastSearchQueries = [
      intent.query.trim(),
      ...updated.lastSearchQueries.filter(q => q.toLowerCase() !== intent.query!.toLowerCase()),
    ].slice(0, 8);
  }

  saveShopperMemory(updated);
  return updated;
}

// ----------------------------------------------------------------------------
// Commerce Tools Execution
// ----------------------------------------------------------------------------

export interface CommerceToolbox {
  allProducts: Product[];
  cart: CartContextValue;
  orders: Order[];
  onValidateCoupon?: (code: string) => Promise<{ isValid: boolean; discountAmount: number; reason?: string }>;
}

export function searchProducts(
  catalog: Product[],
  options: {
    query?: string;
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    inStockOnly?: boolean;
    brand?: string;
    limit?: number;
  }
): Product[] {
  let list = catalog.filter(p => p.isActive);

  if (options.inStockOnly) {
    list = list.filter(p => p.stockQuantity > 0);
  }

  if (options.minPrice !== undefined) {
    list = list.filter(p => p.price >= options.minPrice!);
  }

  if (options.maxPrice !== undefined) {
    list = list.filter(p => p.price <= options.maxPrice!);
  }

  if (options.category) {
    const catLower = options.category.toLowerCase();
    list = list.filter(p =>
      p.categories?.some(c => c.slug?.toLowerCase().includes(catLower) || c.name?.toLowerCase().includes(catLower))
    );
  }

  if (options.brand) {
    const brandLower = options.brand.toLowerCase();
    list = list.filter(p =>
      p.brandName?.toLowerCase().includes(brandLower) || p.brandSlug?.toLowerCase().includes(brandLower)
    );
  }

  if (options.query && options.query.trim()) {
    const q = options.query.trim().toLowerCase();
    const words = q.split(/\s+/).filter(w => w.length > 1);

    list = list
      .map(p => {
        let score = 0;
        const name = p.name.toLowerCase();
        const sku = p.sku.toLowerCase();
        const desc = (p.description ?? '').toLowerCase();
        const brand = (p.brandName ?? '').toLowerCase();
        const cats = (p.categories ?? []).map(c => c.name.toLowerCase()).join(' ');

        if (name === q) score += 100;
        else if (name.startsWith(q)) score += 60;
        else if (name.includes(q)) score += 40;

        if (sku === q) score += 100;

        for (const w of words) {
          if (name.includes(w)) score += 15;
          if (brand.includes(w)) score += 12;
          if (cats.includes(w)) score += 10;
          if (desc.includes(w)) score += 3;
        }

        // Prioritize in-stock products only if they matched the search terms
        if (score > 0 && p.stockQuantity > 0) score += 5;

        return { product: p, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.product);
  }

  return list.slice(0, options.limit ?? 8);
}

export function compareProducts(catalog: Product[], productIds: number[]): ProductComparisonData | null {
  const products = catalog.filter(p => productIds.includes(p.id));
  if (products.length < 2) return null;

  const specs: ComparisonSpec[] = [
    {
      feature: 'Price',
      values: Object.fromEntries(products.map(p => [p.id, `${p.currency ?? 'BDT'} ${p.price.toLocaleString()}`])),
      winnerProductId: [...products].sort((a, b) => a.price - b.price)[0]?.id,
    },
    {
      feature: 'Availability',
      values: Object.fromEntries(
        products.map(p => [
          p.id,
          p.stockQuantity > 0 ? `In Stock (${p.stockQuantity} units)` : 'Out of Stock',
        ])
      ),
      winnerProductId: [...products].sort((a, b) => b.stockQuantity - a.stockQuantity)[0]?.id,
    },
    {
      feature: 'Brand',
      values: Object.fromEntries(products.map(p => [p.id, p.brandName ?? 'NineCube'])),
    },
    {
      feature: 'SKU',
      values: Object.fromEntries(products.map(p => [p.id, p.sku])),
    },
  ];

  // Try to parse specsJson if present
  const allParsedSpecs: Record<number, Record<string, string>> = {};
  for (const p of products) {
    if (p.specsJson) {
      try {
        allParsedSpecs[p.id] = JSON.parse(p.specsJson);
      } catch {
        // Ignore JSON error
      }
    }
  }

  // Find common spec keys
  const extraKeys = new Set<string>();
  for (const pId of Object.keys(allParsedSpecs)) {
    for (const key of Object.keys(allParsedSpecs[Number(pId)] || {})) {
      extraKeys.add(key);
    }
  }

  for (const key of Array.from(extraKeys).slice(0, 4)) {
    specs.push({
      feature: key,
      values: Object.fromEntries(products.map(p => [p.id, allParsedSpecs[p.id]?.[key] ?? 'N/A'])),
    });
  }

  // Determine overall value recommendation (highest stock + competitive price)
  const sortedByValue = [...products].sort((a, b) => {
    const aStockScore = a.stockQuantity > 0 ? 1 : 0;
    const bStockScore = b.stockQuantity > 0 ? 1 : 0;
    if (aStockScore !== bStockScore) return bStockScore - aStockScore;
    return a.price - b.price;
  });

  const winner = sortedByValue[0];
  const summary = `Between ${products.map(p => p.name).join(' and ')}, **${winner.name}** offers the best balance of availability (${winner.stockQuantity} in stock) and price (${winner.currency ?? 'BDT'} ${winner.price.toLocaleString()}).`;

  return {
    products,
    specs,
    summary,
    recommendedProductId: winner.id,
  };
}

export function formatOrderTracking(order: Order): OrderTrackingData {
  let progressStep = 1;
  let statusLabel = 'Order Placed';

  switch (order.status) {
    case 'Pending':
      progressStep = 1;
      statusLabel = 'Pending Confirmation';
      break;
    case 'Confirmed':
      progressStep = 2;
      statusLabel = 'Confirmed & Processing';
      break;
    case 'Shipped':
      progressStep = 3;
      statusLabel = 'Shipped & In Transit';
      break;
    case 'Delivered':
      progressStep = 4;
      statusLabel = 'Delivered Successfully';
      break;
    case 'Cancelled':
      progressStep = 0;
      statusLabel = 'Order Cancelled';
      break;
    case 'Rejected':
      progressStep = 0;
      statusLabel = 'Order Rejected';
      break;
    case 'DeliveryFailed':
      progressStep = 3;
      statusLabel = 'Delivery Attempt Failed';
      break;
  }

  return {
    order,
    progressStep,
    statusLabel,
    formattedDate: new Date(order.createdAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
  };
}

// ----------------------------------------------------------------------------
// Multi-turn Intent Recognition & Response Generator
// ----------------------------------------------------------------------------

export async function processCommerceUserMessage(
  userInput: string,
  toolbox: CommerceToolbox,
  context: ShoppingContext,
  memory: ShopperPreferenceMemory,
  attachedImage?: { dataUrl: string; name: string }
): Promise<{
  reply: string;
  card?: AgentCardContent;
  actionTaken?: string;
  quickPrompts?: string[];
  updatedContext: ShoppingContext;
  updatedMemory: ShopperPreferenceMemory;
}> {
  const normalized = userInput.trim().toLowerCase();
  const nextContext: ShoppingContext = { ...context, turnCount: context.turnCount + 1 };
  let nextMemory: ShopperPreferenceMemory = { ...memory };

  // 0. VISUAL SEARCH & IMAGE INPUT REASONING
  if (attachedImage) {
    const rawClean = attachedImage.name.replace(/[-_.]/g, ' ').toLowerCase();
    const queryHints = `${normalized} ${rawClean}`.trim();
    const matchedProducts = searchProducts(toolbox.allProducts, {
      query: queryHints || 'laptop',
      limit: 4,
    });

    if (matchedProducts.length > 0) {
      const top = matchedProducts[0]!;
      const categoryName = top.categories?.[0]?.name || 'Catalog';
      return {
        reply: `📷 **Visual Search Analysis:** I analyzed your uploaded image *"${attachedImage.name}"* and found matching verified products in our **${categoryName}** collection:`,
        card: {
          type: 'products',
          products: matchedProducts,
        },
        actionTaken: 'visual_search',
        quickPrompts: [
          `Compare ${top.name.slice(0, 20)}`,
          `Check stock of ${top.name.slice(0, 20)}`,
          'View my cart',
        ],
        updatedContext: {
          ...nextContext,
          focusedProductIds: matchedProducts.map(m => m.id),
          activeCategory: categoryName,
        },
        updatedMemory: updateShopperMemoryFromInteraction(nextMemory, {
          category: categoryName,
          brand: top.brandName || undefined,
          query: queryHints,
        }),
      };
    }
  }

  // 1. CLEAR MEMORY INTENT
  if (
    normalized.includes('clear memory') ||
    normalized.includes('reset memory') ||
    normalized.includes('forget my preferences') ||
    normalized.includes('clear history')
  ) {
    clearShopperMemory();
    nextMemory = createDefaultMemory();
    return {
      reply: "I've reset your shopping preferences and browsing memory. We're starting with a fresh slate! What are you shopping for today?",
      quickPrompts: ['Show trending products', 'Browse Laptops', 'View my cart'],
      updatedContext: { turnCount: 0, focusedProductIds: [] },
      updatedMemory: nextMemory,
    };
  }

  // 2. CART INTENT: VIEW CART
  if (
    normalized === 'cart' ||
    normalized === 'view cart' ||
    normalized === 'show cart' ||
    normalized.includes('what is in my cart') ||
    normalized.includes('my cart items') ||
    normalized.includes('check cart')
  ) {
    const cartData: CartCardData = {
      items: toolbox.cart.lines.map(l => ({
        productId: l.productId,
        sku: l.sku,
        name: l.name,
        price: l.unitPrice,
        quantity: l.quantity,
      })),
      total: toolbox.cart.total,
      currency: toolbox.cart.currency,
      itemCount: toolbox.cart.itemCount,
    };

    if (toolbox.cart.lines.length === 0) {
      return {
        reply: "Your cart is currently empty. Would you like me to recommend top-selling products or search for something specific?",
        quickPrompts: ['Trending Electronics', 'Best Laptops under 80k', 'Gift Cards'],
        updatedContext: nextContext,
        updatedMemory: nextMemory,
      };
    }

    return {
      reply: `You have **${toolbox.cart.itemCount} items** in your cart totaling **${toolbox.cart.currency} ${toolbox.cart.total.toLocaleString()}**. Would you like to proceed to checkout or look for additional items?`,
      card: {
        type: 'cart',
        cart: cartData,
      },
      actionTaken: 'view_cart',
      quickPrompts: ['Proceed to Checkout', 'Apply coupon code', 'Clear cart'],
      updatedContext: nextContext,
      updatedMemory: nextMemory,
    };
  }

  // 3. CART INTENT: CLEAR CART
  if (normalized.includes('clear cart') || normalized.includes('empty cart') || normalized.includes('remove all items')) {
    toolbox.cart.clear();
    return {
      reply: 'Your cart has been completely cleared. What can I help you find next?',
      actionTaken: 'clear_cart',
      quickPrompts: ['Browse Laptops', 'Trending Shoes', 'Show deals'],
      updatedContext: nextContext,
      updatedMemory: nextMemory,
    };
  }

  // 4. CART INTENT: ADD TO CART
  const addMatch = normalized.match(
    /(?:add|put|buy)\s+(?:the\s+)?(?:(\d+)\s+)?(.*?)(?:\s+to\s+(?:the\s+)?cart)?$/i
  );
  if (
    (normalized.startsWith('add ') || normalized.startsWith('buy ') || normalized.includes('to cart')) &&
    !normalized.includes('coupon')
  ) {
    const qty = addMatch && addMatch[1] ? Math.max(1, parseInt(addMatch[1], 10)) : 1;
    let targetTerm = (addMatch && addMatch[2] ? addMatch[2] : normalized)
      .replace(/add\s+|buy\s+|to\s+cart|into\s+cart|please|the\s+/gi, '')
      .trim();

    let targetProduct: Product | undefined;

    // Check if target is a number (e.g. "add 1 to cart" or referencing a focused product)
    if (/^\d+$/.test(targetTerm) && nextContext.focusedProductIds.length > 0) {
      const idx = parseInt(targetTerm, 10) - 1;
      const targetId = nextContext.focusedProductIds[idx] ?? nextContext.focusedProductIds[0];
      targetProduct = toolbox.allProducts.find(p => p.id === targetId);
    } else if (targetTerm.length > 1) {
      const results = searchProducts(toolbox.allProducts, { query: targetTerm, limit: 1 });
      targetProduct = results[0];
    } else if (nextContext.focusedProductIds.length > 0) {
      targetProduct = toolbox.allProducts.find(p => p.id === nextContext.focusedProductIds[0]);
    }

    if (targetProduct) {
      if (targetProduct.stockQuantity < 1) {
        return {
          reply: `I checked live inventory for **${targetProduct.name}**, but it is currently **out of stock**. Would you like me to recommend similar in-stock alternatives?`,
          quickPrompts: [`Alternatives for ${targetProduct.name}`, 'Browse Catalogue'],
          updatedContext: nextContext,
          updatedMemory: nextMemory,
        };
      }

      const safeQty = Math.min(qty, targetProduct.stockQuantity);
      toolbox.cart.add(targetProduct, safeQty);

      const cartData: CartCardData = {
        items: toolbox.cart.lines.map(l => ({
          productId: l.productId,
          sku: l.sku,
          name: l.name,
          price: l.unitPrice,
          quantity: l.quantity,
        })),
        total: toolbox.cart.total,
        currency: toolbox.cart.currency,
        itemCount: toolbox.cart.itemCount,
      };

      return {
        reply: `Added **${safeQty}x ${targetProduct.name}** to your cart! Your updated subtotal is **${toolbox.cart.currency} ${toolbox.cart.total.toLocaleString()}**.`,
        card: {
          type: 'cart',
          cart: cartData,
        },
        actionTaken: 'add_to_cart',
        quickPrompts: ['Proceed to Checkout', 'View my cart', 'Compare similar products'],
        updatedContext: {
          ...nextContext,
          lastAction: 'added_to_cart',
          focusedProductIds: [targetProduct.id],
        },
        updatedMemory: updateShopperMemoryFromInteraction(nextMemory, {
          category: targetProduct.categories?.[0]?.slug,
          brand: targetProduct.brandName ?? undefined,
        }),
      };
    }
  }

  // 5. COUPON & DISCOUNT INTENT
  const isCouponIntent = normalized.includes('discount') || normalized.includes('coupon') || normalized.includes('promo') || normalized.includes('voucher') || normalized.startsWith('apply ');
  if (isCouponIntent) {
    const tokens = normalized.split(/\s+/);
    let code = '';
    const couponKeywordIdx = tokens.findIndex(t => ['coupon', 'code', 'promo', 'voucher'].includes(t));
    if (couponKeywordIdx >= 0 && tokens[couponKeywordIdx + 1]) {
      code = tokens[couponKeywordIdx + 1].toUpperCase();
    } else {
      const applyMatch = normalized.match(/(?:apply|use|try)\s+([a-zA-Z0-9_-]{3,20})/i);
      if (applyMatch && !['coupon', 'code', 'discount', 'promo'].includes(applyMatch[1].toLowerCase())) {
        code = applyMatch[1].toUpperCase();
      }
    }

    if (code && toolbox.onValidateCoupon) {
      try {
        const valResult = await toolbox.onValidateCoupon(code);
        if (valResult.isValid) {
          return {
            reply: `Coupon **${code}** is valid! You're saving **${toolbox.cart.currency} ${valResult.discountAmount.toLocaleString()}** on this purchase.`,
            actionTaken: 'apply_coupon',
            quickPrompts: ['Proceed to Checkout', 'View Cart'],
            updatedContext: nextContext,
            updatedMemory: nextMemory,
          };
        } else {
          return {
            reply: `Coupon **${code}** could not be applied: ${valResult.reason ?? 'It is either expired or does not meet the minimum cart total'}. You can try storewide codes like **SALE10** or **WELCOME**.`,
            quickPrompts: ['Apply SALE10', 'View Cart'],
            updatedContext: nextContext,
            updatedMemory: nextMemory,
          };
        }
      } catch {
        return {
          reply: `I tried applying **${code}**, but could not verify it with the server right now. You can also enter it directly at checkout!`,
          quickPrompts: ['View Cart', 'Browse Deals'],
          updatedContext: nextContext,
          updatedMemory: nextMemory,
        };
      }
    } else {
      return {
        reply: "You can apply promotional coupon codes like **SALE10** (10% OFF storewide) or **WELCOME**. Just say *“Apply SALE10”* or tap the button below!",
        quickPrompts: ['Apply SALE10', 'Apply WELCOME', 'View my cart'],
        updatedContext: nextContext,
        updatedMemory: nextMemory,
      };
    }
  }

  // 6. ORDER TRACKING INTENT
  const orderNumMatch = normalized.match(/(?:order\s+#?|track\s+#?)(\d+)/i);
  if (orderNumMatch || normalized.includes('track') || normalized.includes('where is my order') || normalized.includes('order status')) {
    const orderId = orderNumMatch ? parseInt(orderNumMatch[1], 10) : undefined;

    if (orderId) {
      const matchOrder = toolbox.orders.find(o => o.id === orderId);
      if (matchOrder) {
        const tracking = formatOrderTracking(matchOrder);
        return {
          reply: `Here is the live status for **Order #${matchOrder.id}**: **${tracking.statusLabel}**. Total amount: **${matchOrder.currency ?? 'BDT'} ${matchOrder.totalAmount.toLocaleString()}**.`,
          card: {
            type: 'order',
            order: tracking,
          },
          actionTaken: 'track_order',
          quickPrompts: ['View order invoice', 'Browse more products'],
          updatedContext: nextContext,
          updatedMemory: nextMemory,
        };
      } else {
        return {
          reply: `I couldn't find an order with ID **#${orderId}** in your account history. Please check the order number or view your recent orders.`,
          quickPrompts: ['View all my orders', 'Help with support'],
          updatedContext: nextContext,
          updatedMemory: nextMemory,
        };
      }
    } else if (toolbox.orders.length > 0) {
      const latestOrder = toolbox.orders[0];
      const tracking = formatOrderTracking(latestOrder);
      return {
        reply: `Your most recent order is **Order #${latestOrder.id}** (${tracking.statusLabel}), placed on ${tracking.formattedDate}.`,
        card: {
          type: 'order',
          order: tracking,
        },
        actionTaken: 'track_recent_order',
        quickPrompts: [`Track #${latestOrder.id}`, 'View all my orders'],
        updatedContext: nextContext,
        updatedMemory: nextMemory,
      };
    } else {
      return {
        reply: "You don't have any placed orders yet. Once you place an order, I can give you real-time tracking updates, shipping alerts, and fulfillment progress right here!",
        quickPrompts: ['Browse Products', 'View Trending'],
        updatedContext: nextContext,
        updatedMemory: nextMemory,
      };
    }
  }

  // 7. COMPARISON INTENT
  const isCompare =
    normalized.startsWith('compare ') ||
    normalized.includes('vs ') ||
    normalized.includes('versus ') ||
    normalized.includes('difference between') ||
    normalized.includes('which is better');

  if (isCompare) {
    let candidateIds: number[] = [];

    // Extract product names or IDs
    const terms = normalized
      .replace(/compare|vs|versus|difference between|which is better|and|with/gi, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2);

    for (const term of terms) {
      const matches = searchProducts(toolbox.allProducts, { query: term, limit: 1 });
      if (matches[0] && !candidateIds.includes(matches[0].id)) {
        candidateIds.push(matches[0].id);
      }
    }

    if (candidateIds.length < 2 && nextContext.focusedProductIds.length >= 2) {
      candidateIds = nextContext.focusedProductIds.slice(0, 3);
    } else if (candidateIds.length === 1 && nextContext.focusedProductIds.length > 0) {
      const otherId = nextContext.focusedProductIds.find(id => id !== candidateIds[0]);
      if (otherId) candidateIds.push(otherId);
    }

    if (candidateIds.length >= 2) {
      const comparison = compareProducts(toolbox.allProducts, candidateIds);
      if (comparison) {
        return {
          reply: comparison.summary,
          card: {
            type: 'comparison',
            comparison,
          },
          actionTaken: 'compare_products',
          quickPrompts: [
            `Add ${comparison.products[0].name.slice(0, 15)} to cart`,
            `Add ${comparison.products[1].name.slice(0, 15)} to cart`,
          ],
          updatedContext: {
            ...nextContext,
            focusedProductIds: candidateIds,
          },
          updatedMemory: nextMemory,
        };
      }
    }

    // Fallback if not enough products identified
    const sampleProducts = toolbox.allProducts.filter(p => p.isActive).slice(0, 2);
    if (sampleProducts.length >= 2) {
      const sampleComparison = compareProducts(toolbox.allProducts, sampleProducts.map(p => p.id));
      if (sampleComparison) {
        return {
          reply: `To compare specific products, please mention their names or select them. Here is a sample comparison between **${sampleProducts[0].name}** and **${sampleProducts[1].name}**:`,
          card: {
            type: 'comparison',
            comparison: sampleComparison,
          },
          quickPrompts: [
            `Compare ${sampleProducts[0].name.slice(0, 15)} with another`,
            'Search Laptops',
          ],
          updatedContext: nextContext,
          updatedMemory: nextMemory,
        };
      }
    }
  }

  // 8. BUDGET DETECTION & MULTI-TURN REFINEMENT
  const budgetMatch = normalized.match(/(?:under|below|less than|max|budget)\s+(?:bdt\s*)?(\d+[\d,]*)/i);
  let detectedBudget: number | undefined;
  if (budgetMatch) {
    detectedBudget = parseInt(budgetMatch[1].replace(/,/g, ''), 10);
    nextContext.activeBudget = detectedBudget;
  }

  // Category detection
  const categories = ['laptop', 'electronics', 'shoe', 'clothing', 'grocery', 'home', 'furniture', 'watch'];
  let detectedCategory: string | undefined;
  for (const cat of categories) {
    if (normalized.includes(cat)) {
      detectedCategory = cat;
      nextContext.activeCategory = cat;
      break;
    }
  }

  // If user says "under 50000" or "show cheaper ones" after searching laptops, maintain context
  const searchCategory = detectedCategory ?? nextContext.activeCategory;
  const searchBudget = detectedBudget ?? nextContext.activeBudget;

  // 9. PRODUCT SEARCH & RECOMMENDATION INTENT
  let searchQuery = normalized
    .replace(/(?:show|find|recommend|search|looking for|give me|browse|best|cheap|good)\s+/gi, '')
    .replace(/(?:under|below|less than|max|budget)\s+(?:bdt\s*)?\d+[\d,]*/gi, '')
    .trim();

  // If query is "for me" or "recommended", use shopper memory
  const isPersonalized = normalized.includes('for me') || normalized.includes('my style') || normalized.includes('recommend');
  if (isPersonalized && memory.preferredCategories.length > 0 && !searchCategory) {
    searchQuery = memory.preferredCategories[0];
  }

  const results = searchProducts(toolbox.allProducts, {
    query: searchQuery.length > 1 ? searchQuery : undefined,
    category: searchCategory,
    maxPrice: searchBudget,
    inStockOnly: true,
    limit: 6,
  });

  if (results.length > 0) {
    const productNames = results.slice(0, 3).map(p => p.name).join(', ');
    const budgetNote = searchBudget ? ` under BDT ${searchBudget.toLocaleString()}` : '';
    const categoryNote = searchCategory ? ` in **${searchCategory}**` : '';

    nextMemory = updateShopperMemoryFromInteraction(nextMemory, {
      category: searchCategory,
      budget: searchBudget,
      query: searchQuery,
    });

    return {
      reply: `Found **${results.length} available items**${categoryNote}${budgetNote}, including **${productNames}**. Which one would you like to explore or add to your cart?`,
      card: {
        type: 'products',
        products: results,
      },
      actionTaken: 'search_products',
      quickPrompts: [
        results.length >= 2 ? `Compare top 2 choices` : 'Add first item to cart',
        'Show under 50k',
        'View Cart',
      ],
      updatedContext: {
        ...nextContext,
        focusedProductIds: results.map(p => p.id),
      },
      updatedMemory: nextMemory,
    };
  }

  // 10. HONEST SAFE COMMERCE FALLBACK
  const topAvailable = toolbox.allProducts.filter(p => p.isActive && p.stockQuantity > 0).slice(0, 4);
  return {
    reply: `I couldn't find an exact match for "${userInput}". Here are some of our popular in-stock products, or let me know what category, price range, or brand you're seeking!`,
    card: {
      type: 'products',
      products: topAvailable,
    },
    quickPrompts: ['Laptops under 80k', 'Trending Shoes', 'View Cart', 'Track my order'],
    updatedContext: nextContext,
    updatedMemory: nextMemory,
  };
}
