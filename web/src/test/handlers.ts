import { http, HttpResponse } from 'msw';
import type { Address, AdminUser, Brand, BulkItemResult, BulkProductAction, BrandLines, ChatAssistantMatch, ChatConversationSummary, ChatMessage, Dashboard, Notification, Order, Product, ProductImage, Profile, Tag, UserSummary } from '../api/types';

export const API = 'http://localhost:5080';

export const brands: Brand[] = [
  { id: 1, name: 'Apple', slug: 'apple', productCount: 3 },
  { id: 2, name: 'Samsung', slug: 'samsung', productCount: 1 },
  { id: 3, name: 'Walton', slug: 'walton', productCount: 0 }
];

export const brandLines: Record<string, BrandLines> = {
  apple: { id: 1, name: 'Apple', slug: 'apple', productCount: 3, lines: [
    { id: 11, name: 'iPhone 17', slug: 'iphone-17', sortOrder: 1, productCount: 2 },
    { id: 12, name: 'iPhone 16', slug: 'iphone-16', sortOrder: 2, productCount: 1 }
  ] },
  samsung: { id: 2, name: 'Samsung', slug: 'samsung', productCount: 1, lines: [
    { id: 21, name: 'Galaxy S25', slug: 'galaxy-s25', sortOrder: 1, productCount: 1 }
  ] },
  walton: { id: 3, name: 'Walton', slug: 'walton', productCount: 0, lines: [] }
};

/**
 * Tag counts mirror the products below: the sidebar renders them beside each checkbox, so a
 * fixture whose counts disagree with the catalogue would hide a broken count in the UI.
 * "Brand: Apple" is the plumbing tag the importer writes, and the tag list must never show it.
 */
export const tags: Tag[] = [
  { id: 1, name: 'Featured', productCount: 2, inStockCount: 2 },
  { id: 2, name: 'New arrival', productCount: 2, inStockCount: 2 },
  { id: 3, name: '5G', productCount: 2, inStockCount: 2 },
  { id: 4, name: 'Best seller', productCount: 1, inStockCount: 1 },
  { id: 5, name: 'Brand: Apple', productCount: 3, inStockCount: 3 }
];

export const products: Product[] = [
  { id: 1, sku: 'NC-1001', name: 'Espresso Machine Pro', price: 249, stockQuantity: 12, isActive: true, rowVersion: null },
  { id: 2, sku: 'NC-1002', name: 'Milk Frother', price: 39.9, stockQuantity: 4, isActive: true, rowVersion: null },
  { id: 3, sku: 'NC-1003', name: 'Burr Coffee Grinder', price: 89.5, stockQuantity: 0, isActive: true, rowVersion: null },
  { id: 4, sku: 'NC-1004', name: 'Retired Tamper', price: 10, stockQuantity: 20, isActive: false, rowVersion: null },
  {
    id: 5, sku: 'NC-1005', name: 'Apple iPhone 17 Pro 256GB, Black (83170042)', price: 1_499, stockQuantity: 3, isActive: true,
    rowVersion: null, brandId: 1, brandName: 'Apple', brandSlug: 'apple', productLineId: 11, productLineName: 'iPhone 17', productLineSlug: 'iphone-17',
    categories: [{ id: 40, name: 'Mobiles & Tablets', slug: 'mobiles', isPrimary: true }], tags: ['Featured', 'New arrival', '5G', 'Best seller'],
    imageUrl: '/uploads/apple-iphone-17.png', images: [{ id: 90, url: '/uploads/apple-iphone-17.png', isPrimary: true, altText: 'Apple iPhone 17 Pro' }]
  },
  {
    id: 6, sku: 'NC-1006', name: 'Apple iPhone 17 Air 512GB, Sky Blue (83170099)', price: 1_699, stockQuantity: 1, isActive: true,
    rowVersion: null, brandId: 1, brandName: 'Apple', brandSlug: 'apple', productLineId: 11, productLineName: 'iPhone 17', productLineSlug: 'iphone-17',
    categories: [{ id: 40, name: 'Mobiles & Tablets', slug: 'mobiles', isPrimary: true }], tags: ['5G'], imageUrl: null, images: []
  },
  {
    id: 7, sku: 'NC-1007', name: 'Apple iPhone 16 128GB, Black (83170123)', price: 999, stockQuantity: 6, isActive: true,
    rowVersion: null, brandId: 1, brandName: 'Apple', brandSlug: 'apple', productLineId: 12, productLineName: 'iPhone 16', productLineSlug: 'iphone-16',
    categories: [{ id: 40, name: 'Mobiles & Tablets', slug: 'mobiles', isPrimary: true }], tags: ['New arrival'], imageUrl: null, images: []
  },
  {
    id: 8, sku: 'NC-1008', name: 'Samsung Galaxy S25 256GB, Silver', price: 1_099, stockQuantity: 2, isActive: true,
    rowVersion: null, brandId: 2, brandName: 'Samsung', brandSlug: 'samsung', productLineId: 21, productLineName: 'Galaxy S25', productLineSlug: 'galaxy-s25',
    categories: [{ id: 40, name: 'Mobiles & Tablets', slug: 'mobiles', isPrimary: true }], tags: ['Featured'], imageUrl: null, images: []
  }
];

export const productImages: ProductImage[] = [
  { id: 90, url: '/uploads/apple-iphone-17.png', isPrimary: true, altText: 'Apple iPhone 17 Pro' },
  { id: 91, url: '/uploads/apple-iphone-17-back.png', isPrimary: false, altText: 'Back view' }
];

export const customerUser: UserSummary = { id: 10, email: 'customer@ninecube.demo', role: 'Customer', customerId: 1 };
export const staffUser: UserSummary = { id: 11, email: 'staff@ninecube.demo', role: 'Staff', customerId: null };
export const inventoryUser: UserSummary = { id: 12, email: 'inventory@ninecube.demo', role: 'InventoryManager', customerId: null };
export const adminUser: UserSummary = { id: 13, email: 'admin@ninecube.demo', role: 'Administrator', customerId: null };

export const order: Order = {
  id: 500,
  customerId: 1,
  customerName: 'Demo Customer',
  status: 'Pending',
  totalAmount: 288.9,
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:00:00Z',
  idempotencyKey: null,
  items: [
    { id: 1, productId: 1, sku: 'NC-1001', name: 'Espresso Machine Pro', quantity: 1, unitPrice: 249, lineTotal: 249 },
    { id: 2, productId: 2, sku: 'NC-1002', name: 'Milk Frother', quantity: 1, unitPrice: 39.9, lineTotal: 39.9 }
  ]
};

export let demoCoupons: Array<{
  id: number;
  code: string;
  discountType: 'Percentage' | 'FixedAmount';
  discountValue: number;
  minOrderAmount: number;
  maxDiscountCap?: number | null;
  targetType?: string;
  targetId?: number | null;
  minEligibleAmount?: number;
  scopeMatch?: string;
  exclusivity?: string;
  scopeRules?: Array<{ attribute: string; polarity: string; entityIds: number[]; entityNames: string[] }> | null;
  startsAt?: string | null;
  expiresAt: string | null;
  usageLimit: number | null;
  usageCount: number;
  isActive: boolean;
  isAutomatic?: boolean;
  campaignTitle?: string | null;
  isBannerPromoted?: boolean;
  approvalState?: 'NotRequired' | 'Pending' | 'Approved' | 'Rejected';
  submittedByEmail?: string | null;
  reviewedByEmail?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
}> = [
  { id: 1, code: 'SAVE10', discountType: 'Percentage', discountValue: 10, minOrderAmount: 0, maxDiscountCap: 1500, targetType: 'Order', expiresAt: null, usageLimit: null, usageCount: 2, isActive: true, isBannerPromoted: true, campaignTitle: '⚡ Welcome Deal: 10% OFF Storewide with code SAVE10', createdAt: '2026-10-15T08:00:00Z' },
  { id: 2, code: 'WELCOME50', discountType: 'FixedAmount', discountValue: 50, minOrderAmount: 0, targetType: 'Order', expiresAt: null, usageLimit: null, usageCount: 0, isActive: true, isBannerPromoted: false, createdAt: '2026-10-15T08:00:00Z' },
  { id: 3, code: 'NINECUBE', discountType: 'FixedAmount', discountValue: 500, minOrderAmount: 2000, targetType: 'Order', expiresAt: null, usageLimit: null, usageCount: 1, isActive: true, isBannerPromoted: false, createdAt: '2026-10-15T08:00:00Z' },
  { id: 4, code: 'EID2026', discountType: 'Percentage', discountValue: 15, minOrderAmount: 1000, maxDiscountCap: 2500, targetType: 'Category', targetId: 1, expiresAt: null, usageLimit: null, usageCount: 0, isActive: true, isBannerPromoted: true, campaignTitle: '🌙 Eid Mega Festival: 15% OFF Footwear with code EID2026', createdAt: '2026-10-15T08:00:00Z' },
    { id: 7, code: 'DURAMO25', discountType: 'Percentage', discountValue: 25, minOrderAmount: 0, maxDiscountCap: 3000, targetType: 'Product', targetId: 1, expiresAt: null, usageLimit: null, usageCount: 0, isActive: true, isBannerPromoted: true, campaignTitle: '👟 Duramo Special: 25% OFF Duramo SL Shoes with code DURAMO25', createdAt: '2026-10-15T08:00:00Z' },
{ id: 6, code: 'APEX15', discountType: 'Percentage', discountValue: 15, minOrderAmount: 500, maxDiscountCap: 1500, targetType: 'Brand', targetId: 1, expiresAt: null, usageLimit: null, usageCount: 0, isActive: true, isBannerPromoted: true, campaignTitle: '🏷️ Apex Exclusive: 15% OFF All Apex Shoes with code APEX15', createdAt: '2026-10-15T08:00:00Z' },
  { id: 5, code: 'AUTO2000', discountType: 'Percentage', discountValue: 10, minOrderAmount: 2000, maxDiscountCap: 2000, targetType: 'Order', isAutomatic: true, isActive: true, isBannerPromoted: true, campaignTitle: '⚡ Auto-Promo: 10% OFF on BDT 2,000+ orders', createdAt: '2026-10-15T08:00:00Z', usageLimit: null, usageCount: 0, expiresAt: null }
];

/** The registry as the fixtures declare it, so a test that creates or signs off a coupon can undo it. */
const baseCoupons = structuredClone(demoCoupons);

/**
 * The shop's own discount limits and the giveaway they have already paid for. The stub keeps them in
 * module state so a test can save a policy and watch the builder refuse or queue the next coupon;
 * `resetCommerceFixtures` puts them back, because Vitest reuses this module across a file.
 */
const emptyPolicy = {
  maxPercentageOff: 0,
  maxAmountPerOrder: 0,
  maxShareOfOrder: 0,
  weeklySpendCap: 0,
  approvalAbovePercentage: 0,
  approvalAboveAmount: 0
};

export let demoDiscountPolicy = { ...emptyPolicy };

export let demoPromoSpendLast7Days = 350;

/** Who is at the keyboard in a stubbed run: the review dialog compares this with a coupon's writer. */
export let demoSessionEmail = 'writer@ninecube.demo';

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

/**
 * Past orders the replay endpoint measures. Line prices are snapshots, exactly as the real rows store
 * them, so a scoped coupon can be checked against products the catalogue has since moved on from.
 */
type ReplayOrder = {
  createdAt: string;
  subTotal: number;
  status: string;
  discountAmount: number;
  lines: Array<{ productId: number; quantity: number; unitPrice: number }>;
};

const baseOrderHistory: ReplayOrder[] = [
  { createdAt: daysAgo(3), subTotal: 1499, status: 'Delivered', discountAmount: 150, lines: [{ productId: 5, quantity: 1, unitPrice: 1499 }] },
  { createdAt: daysAgo(5), subTotal: 1578.8, status: 'Delivered', discountAmount: 0, lines: [{ productId: 5, quantity: 1, unitPrice: 1499 }, { productId: 2, quantity: 2, unitPrice: 39.9 }] },
  { createdAt: daysAgo(9), subTotal: 288.9, status: 'Shipped', discountAmount: 0, lines: [{ productId: 1, quantity: 1, unitPrice: 249 }, { productId: 2, quantity: 1, unitPrice: 39.9 }] },
  { createdAt: daysAgo(12), subTotal: 1699, status: 'Delivered', discountAmount: 200, lines: [{ productId: 6, quantity: 1, unitPrice: 1699 }] },
  { createdAt: daysAgo(20), subTotal: 1088.5, status: 'Cancelled', discountAmount: 0, lines: [{ productId: 7, quantity: 1, unitPrice: 999 }, { productId: 3, quantity: 1, unitPrice: 89.5 }] },
  { createdAt: daysAgo(45), subTotal: 1499, status: 'Delivered', discountAmount: 0, lines: [{ productId: 5, quantity: 1, unitPrice: 1499 }] }
];

export let demoOrderHistory: ReplayOrder[] = [...baseOrderHistory];

/**
 * Sign the stub API in as another administrator. The real server takes the second signature from the
 * caller's token, so a test that swaps the session it sends to /api/auth/me has to move this too.
 */
export function setDemoSessionEmail(email: string) {
  demoSessionEmail = email;
}

/** Back to "no limits, nothing queued, the shop has orders" between tests in one file. */
export function resetCommerceFixtures() {
  demoDiscountPolicy = { ...emptyPolicy };
  demoPromoSpendLast7Days = 350;
  demoSessionEmail = 'writer@ninecube.demo';
  demoOrderHistory = [...baseOrderHistory];
  demoCoupons = structuredClone(baseCoupons);
}

/** A shop with no order history at all: the replay must say so instead of showing a figure. */
export function clearDemoOrderHistory() {
  demoOrderHistory = [];
}

/** A shop that has already written its own limits, so a test can start from a guarded store. */
export function seedDiscountPolicy(over: Partial<typeof emptyPolicy> = {}) {
  demoDiscountPolicy = { ...emptyPolicy, ...over };
}

/** Queue one coupon by hand, the way a policy over the approval threshold would. */
export function seedPendingCoupon(over: Record<string, unknown> = {}) {
  demoCoupons.push({
    id: 20, code: 'BOLD40', discountType: 'Percentage', discountValue: 40, minOrderAmount: 0,
    maxDiscountCap: null, targetType: 'Order', expiresAt: null, usageLimit: null, usageCount: 0,
    isActive: false, campaignTitle: null, isBannerPromoted: false, minEligibleAmount: 0,
    scopeMatch: 'Any', exclusivity: 'BestOnly', scopeRules: [],
    approvalState: 'Pending', submittedByEmail: 'writer@ninecube.demo', submittedAt: daysAgo(1),
    reviewedByEmail: null, reviewedAt: null, rejectionReason: null,
    createdAt: daysAgo(1), ...over
  } as (typeof demoCoupons)[number]);
}

export let demoGiftCards: Array<{
  id: number;
  code: string;
  initialBalance: number;
  currentBalance: number;
  currency: string;
  recipientEmail: string | null;
  recipientName: string | null;
  note: string | null;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}> = [
  {
    id: 1,
    code: 'GC-WELCOME-1000',
    initialBalance: 1000,
    currentBalance: 1000,
    currency: 'BDT',
    recipientEmail: 'customer@ninecube.digital',
    recipientName: 'Valued Customer',
    note: 'Welcome to NineCube Digital! Enjoy your shopping.',
    isActive: true,
    expiresAt: '2027-10-31T00:00:00Z',
    createdAt: '2026-10-31T00:00:00Z',
    lastUsedAt: null
  },
  {
    id: 2,
    code: 'GC-EID2026-2500',
    initialBalance: 2500,
    currentBalance: 2500,
    currency: 'BDT',
    recipientEmail: null,
    recipientName: 'Eid Celebrant',
    note: 'Eid Mubarak! May your celebration be filled with joy.',
    isActive: true,
    expiresAt: '2027-10-31T00:00:00Z',
    createdAt: '2026-10-31T00:00:00Z',
    lastUsedAt: null
  },
  {
    id: 3,
    code: 'GC-VIP-5000',
    initialBalance: 5000,
    currentBalance: 3500,
    currency: 'BDT',
    recipientEmail: 'vip@ninecube.digital',
    recipientName: 'VIP Member',
    note: 'Exclusive VIP Reward Balance.',
    isActive: true,
    expiresAt: null,
    createdAt: '2026-10-31T00:00:00Z',
    lastUsedAt: '2026-10-31T02:00:00Z'
  }
];

export const adminUsers: AdminUser[] = [
  { id: 10, email: 'customer@ninecube.demo', role: 'Customer', isActive: true, customerId: 1, createdAt: '2026-09-01T09:00:00Z' },
  { id: 11, email: 'staff@ninecube.demo', role: 'Staff', isActive: true, customerId: null, createdAt: '2026-09-01T09:00:00Z' }
];

// ------------------------------------------------------------------ account fixtures

/**
 * The inbox, profile and dashboard are mutable: a test that marks everything read must see the
 * badge drop, otherwise it is only proving the mutation was sent. `resetAccountFixtures` puts the
 * seed back, so a file can call it in `beforeEach`.
 */
const inboxSeed: Notification[] = [
  { id: 1, type: 'OrderPlaced', title: 'Order #500 placed', body: 'Your order is waiting for a staff member to confirm it.', link: '/orders/500', isRead: false, createdAt: '2026-10-01T10:05:00Z', readAt: null },
  { id: 2, type: 'OrderStatusChanged', title: 'Order #500 confirmed', body: 'A staff member accepted your order.', link: '/orders/500', isRead: false, createdAt: '2026-10-02T08:30:00Z', readAt: null },
  { id: 3, type: 'OrderCancelled', title: 'Order #455 cancelled', body: 'The reserved stock was released.', link: '/orders/455', isRead: true, createdAt: '2026-09-20T12:00:00Z', readAt: '2026-09-20T12:10:00Z' }
];

/**
 * Chat threads are mutable for the same reason the inbox is: a test that sends a message has to see
 * it come back on the next poll, otherwise it only proves the request left the browser.
 * `resetAccountFixtures` restores the seed.
 */
const chatConversationSeed: ChatConversationSummary[] = [
  {
    id: 1, subject: 'Delivery in Sylhet', status: 'open',
    createdAt: '2026-10-28T09:00:00Z', updatedAt: '2026-10-28T09:40:00Z',
    lastMessage: { body: 'We deliver to Sylhet in 2-3 working days.', authorKind: 'staff', createdAt: '2026-10-28T09:40:00Z' },
    unreadCount: 1
  }
];

const chatMessageSeed: ChatMessage[] = [
  { id: 1, conversationId: 1, authorKind: 'customer', authorName: 'Demo Customer', body: 'Do you deliver to Sylhet?', createdAt: '2026-10-28T09:00:00Z' },
  { id: 2, conversationId: 1, authorKind: 'staff', authorName: 'NineCube Support', body: 'We deliver to Sylhet in 2-3 working days.', createdAt: '2026-10-28T09:40:00Z' }
];

let chatConversations = chatConversationSeed.map(entry => ({ ...entry }));
let chatMessages = chatMessageSeed.map(entry => ({ ...entry }));

const addressSeed: Address[] = [
  { id: 7, label: 'Home', division: 'Dhaka', district: 'Dhaka', upazila: 'Dhanmondi', addressLine: 'House 12, Road 5', phone: '01712345678', isDefault: true }
];

const profileSeed: Profile = {
  id: 10, name: 'Demo Customer', email: 'customer@ninecube.demo', phone: '01712345678',
  role: 'Customer', createdAt: '2026-09-01T09:00:00Z', addresses: addressSeed
};

/**
 * Account security, mirrored on the real endpoint's contract: GET /api/me/security answers
 * { verified, mfaEnabled, sessions } and lists only a refresh token that is neither revoked nor past
 * its expiry, so every seeded session has to be a live one. The times hang off the clock at call time
 * because the page puts "Signed in 7 hours ago" beside an absolute time, and a frozen seed would
 * eventually show a session that the real endpoint would never have returned.
 */
export type SecurityFixture = { verified: boolean; mfaEnabled: boolean;
  sessions: { id: number; createdAtUtc: string; expiresAtUtc: string }[] };

function securitySeed(): SecurityFixture {
  // AuthService issues every refresh token for fourteen days from sign-in.
  const session = (id: number, signedInHoursAgo: number) => {
    const started = Date.now() - signedInHoursAgo * 3_600_000;
    return { id, createdAtUtc: new Date(started).toISOString(), expiresAtUtc: new Date(started + 14 * 86_400_000).toISOString() };
  };
  return { verified: true, mfaEnabled: false, sessions: [session(3, 7), session(2, 52), session(1, 190)] };
}

export let security = securitySeed();

/** The one challenge the stub will accept, in place of the email the real API writes to a table. */
const VERIFY_TOKEN = 'verify-204816';
const SIGNIN_CODE = '204816';
let securityCode = '';

/** What the last issued challenge was, so a test can fill the field with the value that works. */
export function issuedSecurityCode(kind: 'verification' | 'signin') {
  return kind === 'verification' ? VERIFY_TOKEN : SIGNIN_CODE;
}

/** Where the account's security state stands now, read rather than assumed from a live binding. */
export function securityState(): SecurityFixture {
  return security;
}

export let inbox = inboxSeed.map(entry => ({ ...entry }));
export let profile: Profile = { ...profileSeed, addresses: addressSeed.map(entry => ({ ...entry })) };

export function resetAccountFixtures() {
  inbox = inboxSeed.map(entry => ({ ...entry }));
  profile = { ...profileSeed, addresses: addressSeed.map(entry => ({ ...entry })) };
  security = securitySeed();
  securityCode = '';
  chatConversations = chatConversationSeed.map(entry => ({ ...entry }));
  chatMessages = chatMessageSeed.map(entry => ({ ...entry }));
}

/** Put the account in a state the real endpoint could answer: an unverified email, two-step on, no devices. */
export function seedSecurity(over: Partial<Pick<SecurityFixture, 'verified' | 'mfaEnabled'>> & { sessions?: number } = {}) {
  security = {
    verified: over.verified ?? security.verified,
    mfaEnabled: over.mfaEnabled ?? security.mfaEnabled,
    sessions: securitySeed().sessions.slice(0, over.sessions ?? 3)
  };
}

/** Derived, so the dashboard totals can never drift from the order fixture. */
function dashboardFixture(): Dashboard {
  const active = [order];
  return {
    totalOrders: active.length,
    ordersByStatus: (['Pending', 'Confirmed', 'Shipped', 'Cancelled', 'Rejected'] as const).map(status => ({
      status,
      count: active.filter(entry => entry.status === status).length
    })),
    totalSpent: active.reduce((total, entry) => total + entry.totalAmount, 0),
    currency: 'BDT',
    totalItems: active.reduce((total, entry) => total + entry.items.reduce((sum, line) => sum + line.quantity, 0), 0),
    recentOrders: active.map(entry => ({
      id: entry.id, status: entry.status, totalAmount: entry.totalAmount, currency: 'BDT',
      createdAt: entry.createdAt, itemCount: entry.items.reduce((sum, line) => sum + line.quantity, 0)
    })),
    recentNotifications: inbox.slice(0, 5),
    unreadNotifications: inbox.filter(entry => !entry.isRead).length
  };
}

const paged = <T,>(items: T[], totalCount = items.length) => ({  items,
  page: 1,
  pageSize: 20,
  totalCount,
  totalPages: Math.ceil(totalCount / 20) || 0,
  hasNext: false,
  hasPrevious: false
});

export const problem = (
  status: number,
  code: string,
  title: string,
  detail: string,
  extra: Record<string, unknown> = {}
) => ({ type: `https://ninecube.digital/problems/${code}`, title, status, detail, code, correlationId: 'test-correlation-id', ...extra });

/**
 * Mirrors the catalogue filtering contract the API implements, including its error codes, so a UI
 * test that forgets to send a parameter cannot pass.
 */
function catalogueResponse(url: URL): HttpResponse {
  const min = url.searchParams.get('minPrice');
  const max = url.searchParams.get('maxPrice');
  const numeric = [min, max].filter(v => v !== null && v !== '').map(Number);
  if (numeric.some(Number.isNaN) || (min && max && Number(min) > Number(max))) {
    return HttpResponse.json(problem(400, 'invalid_request', 'Bad request.', 'Use a nonnegative price range with minimum no greater than maximum.'), { status: 400 });
  }

  let items = baseFilters(url);

  // Unknown brand or series is a 404, and a series from another brand can never match: 400.
  const wantedBrands = url.searchParams.getAll('brand').filter(Boolean);
  const wantedLines = url.searchParams.getAll('line').filter(Boolean);
  const unknownBrand = wantedBrands.find(slug => !brands.some(b => b.slug === slug));
  if (unknownBrand) return HttpResponse.json(problem(404, 'not_found', 'Not found.', 'This brand is unavailable.'), { status: 404 });
  const unknownLine = wantedLines.find(slug => !Object.values(brandLines).some(entry => entry.lines.some(line => line.slug === slug)));
  if (unknownLine) return HttpResponse.json(problem(404, 'not_found', 'Not found.', 'This series is unavailable.'), { status: 404 });
  const crossBrand = wantedLines.find(slug =>
    !Object.entries(brandLines).some(([bSlug, entry]) => wantedBrands.includes(bSlug) && entry.lines.some(line => line.slug === slug)));
  if (wantedBrands.length > 0 && crossBrand) {
    return HttpResponse.json(problem(400, 'invalid_request', 'Bad request.', 'A series can only be combined with the brand it belongs to.'), { status: 400 });
  }

  if (wantedBrands.length > 0) items = items.filter(p => p.brandSlug && wantedBrands.includes(p.brandSlug));
  if (wantedLines.length > 0) items = items.filter(p => p.productLineSlug && wantedLines.includes(p.productLineSlug));

  const sort = url.searchParams.get('sort');
  if (sort === 'price') items.sort((a, b) => a.price - b.price);
  else if (sort === 'stock') items.sort((a, b) => b.stockQuantity - a.stockQuantity);
  else items.sort((a, b) => a.name.localeCompare(b.name));

  const pageSize = Number(url.searchParams.get('pageSize')) || 20;
  const page = Number(url.searchParams.get('page')) || 1;
  return HttpResponse.json(paged(items.slice((page - 1) * pageSize, page * pageSize), items.length));
}

/** Everything except the brand/line selection, which is exactly what the facet endpoints count over. */
function baseFilters(url: URL): Product[] {
  let items = [...products];
  const min = url.searchParams.get('minPrice');
  const max = url.searchParams.get('maxPrice');
  const q = url.searchParams.get('q');
  if (q) items = items.filter(product => product.name.includes(q) || product.sku.includes(q));

  const category = url.searchParams.get('categorySlug');
  if (category) items = items.filter(product => product.categories?.some(c => c.slug === category));

  // Comma separated tags are OR-ed inside the facet, exactly like the brand facet.
  const wantedTags = (url.searchParams.get('tag') ?? '').split(',').map(value => value.trim()).filter(Boolean);
  if (wantedTags.length > 0) items = items.filter(product => product.tags?.some(tag => wantedTags.includes(tag)));

  if (url.searchParams.get('inStock') === 'true') items = items.filter(product => product.isActive && product.stockQuantity > 0);
  if (min) items = items.filter(product => product.price >= Number(min));
  if (max) items = items.filter(product => product.price <= Number(max));
  return items;
}

function brandFacet(url: URL): HttpResponse {
  const counts = new Map<string, number>();
  for (const product of baseFilters(url)) {
    if (product.brandSlug) counts.set(product.brandSlug, (counts.get(product.brandSlug) ?? 0) + 1);
  }
  return HttpResponse.json(brands.map(brand => ({ ...brand, productCount: counts.get(brand.slug) ?? 0 })).filter(brand => brand.productCount > 0));
}

/**
 * Coupon scope, read the way the API reads it: rule by rule against the catalogue, exclusions last.
 * The preview endpoint and the stored-scope echo both go through here so a test cannot disagree with
 * itself about what a scope reaches.
 */
type ScopeRuleLike = { attribute: string; polarity?: string; entityIds: number[] };

const money = (value: number) => Number(value.toFixed(2));

const seriesNames = Object.values(brandLines).flatMap(brand => brand.lines);

const scopeName = (attribute: string, id: number): string => {
  if (attribute === 'Product') return products.find(p => p.id === id)?.name ?? `Product ${id}`;
  if (attribute === 'Brand') return brands.find(b => b.id === id)?.name ?? `Brand ${id}`;
  if (attribute === 'Tag') return tags.find(g => g.id === id)?.name ?? `Tag ${id}`;
  if (attribute === 'ProductLine') return seriesNames.find(l => l.id === id)?.name ?? `Series ${id}`;
  return products.flatMap(p => p.categories ?? []).find(c => c.id === id)?.name ?? `Category ${id}`;
};

const withScopeNames = (rules: ScopeRuleLike[] = []) => rules.map(rule => ({
  attribute: rule.attribute,
  polarity: rule.polarity ?? 'Is',
  entityIds: rule.entityIds,
  entityNames: rule.entityIds.map(id => scopeName(rule.attribute, id))
}));

const ruleHits = (product: Product, rule: ScopeRuleLike): boolean => {
  if (rule.attribute === 'Brand') return product.brandId != null && rule.entityIds.includes(product.brandId);
  if (rule.attribute === 'ProductLine') return product.productLineId != null && rule.entityIds.includes(product.productLineId);
  if (rule.attribute === 'Tag') {
    const names = rule.entityIds.map(id => tags.find(g => g.id === id)?.name);
    return (product.tags ?? []).some(name => names.includes(name));
  }
  if (rule.attribute === 'Product') return rule.entityIds.includes(product.id);
  return (product.categories ?? []).some(c => rule.entityIds.includes(c.id));
};

const matchScope = (product: Product, rules: ScopeRuleLike[], match: string): boolean => {
  if (rules.length === 0) return true;
  if (rules.some(r => r.polarity === 'IsNot' && ruleHits(product, r))) return false;
  const admits = rules.filter(r => (r.polarity ?? 'Is') === 'Is');
  if (admits.length === 0) return true;
  return match === 'All' ? admits.every(r => ruleHits(product, r)) : admits.some(r => ruleHits(product, r));
};

/** The rules a stored coupon holds, including the pre-rule targetType/targetId columns. */
const couponRules = (coupon: (typeof demoCoupons)[number]): ScopeRuleLike[] => {
  if (coupon.scopeRules?.length) return coupon.scopeRules;
  if (!coupon.targetId || !coupon.targetType || coupon.targetType === 'Order') return [];
  return [{ attribute: coupon.targetType, entityIds: [coupon.targetId] }];
};

type CouponMoney = {
  discountType?: 'Percentage' | 'FixedAmount';
  discountValue?: number;
  maxDiscountCap?: number | null;
  minOrderAmount?: number;
};

/** The biggest taka one coupon could ever take off a single order. */
const worstPerOrder = (body: CouponMoney): number => {
  const value = Number(body.discountValue ?? 0);
  const cap = body.maxDiscountCap ? Number(body.maxDiscountCap) : null;
  if (body.discountType === 'FixedAmount') return Math.min(value, cap ?? value);
  return cap ?? Number.MAX_SAFE_INTEGER;
};

const taka = (value: number) => `BDT ${Math.round(value).toLocaleString('en-US')}`;
const pct = (value: number) => `${Number(value.toFixed(2))}%`;

/**
 * The save-time refusal the API returns when a coupon breaks one of the shop's limits. The sentences are
 * copied from `DiscountPolicyGuard.RefusalFor` in the same order it checks them, because the operator has
 * to read the same refusal in a stubbed run as on the live shop.
 */
const policyRefusal = (body: CouponMoney): string | null => {
  const policy = demoDiscountPolicy;
  const value = Number(body.discountValue ?? 0);
  const isRate = (body.discountType ?? 'Percentage') === 'Percentage';
  const minOrder = Number(body.minOrderAmount ?? 0);

  if (policy.maxPercentageOff > 0 && isRate && value > policy.maxPercentageOff) {
    return `Your policy allows at most ${pct(policy.maxPercentageOff)} off. This coupon gives ${pct(value)}.`;
  }

  const ceiling = policy.maxAmountPerOrder;
  if (ceiling > 0) {
    if (isRate && !body.maxDiscountCap) {
      if (value > 0) {
        const breachingOrder = Math.ceil(ceiling / (value / 100));
        if (minOrder >= breachingOrder) {
          return `At this coupon's own minimum order of ${taka(minOrder)}, ${pct(value)} off is ` +
                 `${taka((value * minOrder) / 100)}. Your policy caps one discount at ${taka(ceiling)}.`;
        }

        return `A ${pct(value)} coupon passes your ${taka(ceiling)} ceiling once an order reaches ` +
               `${taka(breachingOrder)}. Set this coupon's maximum discount to ${taka(ceiling)} or less.`;
      }
    } else if (worstPerOrder(body) > ceiling) {
      return isRate
        ? `This coupon's maximum discount of ${taka(Number(body.maxDiscountCap))} is above your policy ceiling of ${taka(ceiling)}.`
        : `This coupon takes ${taka(worstPerOrder(body))} off one order. Your policy caps one discount at ${taka(ceiling)}.`;
    }
  }

  const share = policy.maxShareOfOrder;
  if (share > 0) {
    if (isRate) {
      return value > share
        ? `A ${pct(value)} coupon takes ${pct(value)} of the order it applies to. Your policy allows ${pct(share)}.`
        : null;
    }

    const worst = worstPerOrder(body);
    if (worst > 0) {
      if (minOrder > 0) {
        const taken = Math.round((worst / minOrder) * 1000) / 10;
        return taken > share
          ? `This gives ${taka(worst)} off a ${taka(minOrder)} order — ${pct(taken)} of it. Your policy allows ${pct(share)}.`
          : null;
      }

      const floor = Math.ceil(worst / (share / 100));
      return `${taka(worst)} off is more than ${pct(share)} of any order under ${taka(floor)}. ` +
             `Give the coupon a minimum order of at least ${taka(floor)}, or lower the amount.`;
    }
  }

  return null;
};

/** The refusal that blocks a new campaign while the week's giveaway already sits at or above the budget. */
const campaignCapRefusal = (): string | null => {
  const cap = demoDiscountPolicy.weeklySpendCap;
  if (cap <= 0 || demoPromoSpendLast7Days < cap) return null;

  return `Orders in the last 7 days already used ${taka(demoPromoSpendLast7Days)} of discounts, and your policy ` +
         `allows ${taka(cap)} a week. No campaign can go live until that figure falls under the cap, so an older ` +
         `day drops out of the window.`;
};


/** The refusal's reason clause, with one sentence mark however the reviewer wrote it (as on the server). */
const refusalClause = (reason: string | null | undefined): string =>
  !reason || !reason.trim() ? '. ' : `: ${reason.trim().replace(/[.!?]+$/, '')}. `;

/** Past either approval threshold the coupon waits for a different administrator to sign it off. */
const needsSecondSignature = (body: CouponMoney): boolean => {
  const value = Number(body.discountValue ?? 0);
  const isRate = (body.discountType ?? 'Percentage') === 'Percentage';

  if (isRate) {
    if (demoDiscountPolicy.approvalAbovePercentage > 0 && value > demoDiscountPolicy.approvalAbovePercentage) return true;
    return demoDiscountPolicy.approvalAboveAmount > 0 &&
      !!body.maxDiscountCap && Number(body.maxDiscountCap) > demoDiscountPolicy.approvalAboveAmount;
  }

  return demoDiscountPolicy.approvalAboveAmount > 0 && worstPerOrder(body) > demoDiscountPolicy.approvalAboveAmount;
};

/**
 * Default handlers describe the signed-out, healthy API. Individual tests override the
 * interesting endpoints with server.use(...).
 */
export const handlers = [
  http.get(`${API}/api/checkout/options`, () => HttpResponse.json({ onlinePaymentsEnabled: true })),
  http.post(`${API}/api/checkout/quote`, async ({ request }) => {
    const body = await request.json() as { items: { productId: number; quantity: number }[] };
    const subTotal = body.items.reduce((sum, item) => sum + (products.find(p => p.id === item.productId)?.price ?? 0) * item.quantity, 0);
    const shippingAmount = subTotal < 2500 ? 60 : 0;
    return HttpResponse.json({ subTotal, discountAmount: 0, shippingAmount, giftCardAmount: 0,
      totalAmount: subTotal + shippingAmount, currency: 'BDT', freeShippingThreshold: 2500, couponCode: null });
  }),
  http.get(`${API}/api/restock-subscriptions`, () => HttpResponse.json([])),
  http.post(`${API}/api/restock-subscriptions/:id`, () => HttpResponse.json({ message: 'Saved' })),
  http.get(`${API}/api/categories`, () => HttpResponse.json([])),
  http.get(`${API}/api/tags`, () => HttpResponse.json(tags)),
  http.get(`${API}/api/auth/me`, () =>
    HttpResponse.json(problem(401, 'unauthenticated', 'Authentication required.', 'No token.'), { status: 401 })
  ),

  http.post(`${API}/api/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };
    if (body.password === 'wrong') {
      return HttpResponse.json(problem(401, 'unauthorized', 'Not authenticated.', 'Invalid email or password.'), { status: 401 });
    }
    return HttpResponse.json({
      accessToken: 'test-token',
      expiresAtUtc: new Date(Date.now() + 3_600_000).toISOString(),
      user: customerUser
    });
  }),

  http.post(`${API}/api/auth/register`, () =>
    HttpResponse.json(
      {
        accessToken: 'test-token',
        expiresAtUtc: new Date(Date.now() + 3_600_000).toISOString(),
        user: customerUser
      },
      { status: 201 }
    )
  ),

  // The showcase reads its nine card images from a manifest generated into public/assets. The
  // wildcard origin keeps the handler independent of the jsdom origin the request resolves against.
  http.get('*/assets/assets.json', () =>
    HttpResponse.json({
      generatedBy: 'test',
      count: 9,
      files: Array.from({ length: 9 }, (_, index) => `work-${String(index + 1).padStart(2, '0')}.svg`)
    })
  ),

  http.get(`${API}/api/products/low-stock-threshold`, () => HttpResponse.json({ lowStockThreshold: 5 })),

  http.get(`${API}/api/products`, ({ request }) => catalogueResponse(new URL(request.url))),

  http.get(`${API}/api/brands`, ({ request }) => brandFacet(new URL(request.url))),

  http.get(`${API}/api/brands/:slug/lines`, ({ params }) => {
    const lines = brandLines[String(params.slug)];
    return lines
      ? HttpResponse.json(lines)
      : HttpResponse.json(problem(404, 'not_found', 'Not found.', 'This brand is unavailable.'), { status: 404 });
  }),

  http.get(`${API}/api/products/:id/images`, ({ params }) =>
    HttpResponse.json(Number(params.id) === 5 ? productImages : [])
  ),

  http.post(`${API}/api/products/:id/images`, () =>
    HttpResponse.json({ id: 92, url: '/uploads/uploaded.png', isPrimary: false, altText: 'Uploaded' }, { status: 201 })
  ),

  http.put(`${API}/api/products/:id/images/:imageId/primary`, ({ params }) =>
    HttpResponse.json({ ...products.find(item => item.id === Number(params.id))!, imageUrl: productImages.find(image => image.id === Number(params.imageId))!.url })
  ),

  http.delete(`${API}/api/products/:id/images/:imageId`, () => HttpResponse.json(products[4]!)),

  http.get(`${API}/api/products/:id`, ({ params }) => {
    const product = products.find((item) => item.id === Number(params.id));
    return product
      ? HttpResponse.json(product)
      : HttpResponse.json(problem(404, 'not_found', 'Not found.', 'Missing.'), { status: 404 });
  }),

  http.get(`${API}/api/orders`, () => HttpResponse.json(paged([order]))),

  http.get(`${API}/api/orders/:id`, ({ params }) =>
    Number(params.id) === order.id
      ? HttpResponse.json(order)
      : HttpResponse.json(problem(404, 'not_found', 'Not found.', 'Order was not found.'), { status: 404 })
  ),

  http.get(`${API}/api/orders/:id/invoice`, () =>
    HttpResponse.json({
      orderId: order.id,
      orderDate: order.createdAt,
      status: 'Pending',
      customerName: 'Demo Customer',
      customerEmail: 'customer@ninecube.demo',
      lines: order.items,
      subtotal: order.totalAmount,
      total: order.totalAmount
    })
  ),

  // ---------------------------------------------------------------- account area

  http.get(`${API}/api/notifications`, ({ request }) => {
    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
    const page = Number(url.searchParams.get('page')) || 1;
    const pageSize = Number(url.searchParams.get('pageSize')) || 20;
    const rows = unreadOnly ? inbox.filter(entry => !entry.isRead) : inbox;
    return HttpResponse.json(paged(rows.slice((page - 1) * pageSize, page * pageSize), rows.length));
  }),

  http.get(`${API}/api/notifications/unread-count`, () => HttpResponse.json({ count: inbox.filter(entry => !entry.isRead).length })),

  http.post(`${API}/api/notifications/read-all`, () => {
    inbox = inbox.map(entry => ({ ...entry, isRead: true, readAt: entry.readAt ?? '2026-10-15T09:00:00Z' }));
    return HttpResponse.json({ count: 0 });
  }),

  http.post(`${API}/api/notifications/:id/read`, ({ params }) => {
    const found = inbox.find(entry => entry.id === Number(params.id));
    if (!found) return HttpResponse.json(problem(404, 'not_found', 'Not found.', 'Notification was not found.'), { status: 404 });
    found.isRead = true;
    found.readAt = '2026-10-15T09:00:00Z';
    return HttpResponse.json(found);
  }),

  http.delete(`${API}/api/notifications/:id`, ({ params }) => {
    const before = inbox.length;
    inbox = inbox.filter(entry => entry.id !== Number(params.id));
    return inbox.length === before
      ? HttpResponse.json(problem(404, 'not_found', 'Not found.', 'Notification was not found.'), { status: 404 })
      : new HttpResponse(null, { status: 204 });
  }),

  http.get(`${API}/api/me`, () => HttpResponse.json(profile)),

  http.put(`${API}/api/me`, async ({ request }) => {
    const body = (await request.json()) as { name: string; phone?: string | null };
    if (!body.name || body.name.trim().length === 0) {
      return HttpResponse.json(problem(400, 'invalid_request', 'Bad request.', 'Name is required.', { errors: { name: ['Name is required and must be at most 200 characters.'] } }), { status: 400 });
    }
    if (body.phone && !/^[\d\s+-]{6,20}$/.test(body.phone)) {
      return HttpResponse.json(problem(400, 'invalid_request', 'Bad request.', 'Phone number is not valid.', { errors: { phone: ['Phone number is not valid.'] } }), { status: 400 });
    }
    profile = { ...profile, name: body.name.trim(), phone: body.phone ?? null };
    return HttpResponse.json(profile);
  }),

  http.put(`${API}/api/me/password`, async ({ request }) => {
    const body = (await request.json()) as { currentPassword: string; newPassword: string };
    if (body.currentPassword !== 'correct horse battery staple') {
      return HttpResponse.json(problem(400, 'invalid_request', 'Bad request.', 'The current password is not correct.', { errors: { currentPassword: ['The current password is not correct.'] } }), { status: 400 });
    }
    if (body.newPassword.length < 8) {
      return HttpResponse.json(problem(400, 'invalid_request', 'Bad request.', 'A new password must be between 8 and 128 characters.', { errors: { newPassword: ['Use at least 8 characters.'] } }), { status: 400 });
    }
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${API}/api/me/dashboard`, () => HttpResponse.json(dashboardFixture())),

  // Account security. Same shapes and same consequences as AccountSecurityEndpoints.cs: a challenge
  // is issued for one use, turning two-step on or off revokes every refresh token, and so does
  // signing out everywhere.
  http.get(`${API}/api/me/security`, () => HttpResponse.json(security)),

  http.post(`${API}/api/me/security/verification`, () => {
    if (!security.verified) securityCode = VERIFY_TOKEN;
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${API}/api/me/security/verification/confirm`, async ({ request }) => {
    const body = (await request.json()) as { code: string };
    if (security.verified || body.code !== securityCode) {
      return HttpResponse.json(problem(400, 'invalid_request', 'Bad request.', 'Verification token is invalid or expired.'), { status: 400 });
    }
    securityCode = '';
    security = { ...security, verified: true };
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${API}/api/auth/signin-code`, async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string };
    if (body.password === 'correct horse battery staple') securityCode = SIGNIN_CODE;
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${API}/api/me/security/mfa`, async ({ request }) => {
    const body = (await request.json()) as { enabled: boolean; password: string; code?: string };
    if (body.password !== 'correct horse battery staple' || !security.verified || body.code !== securityCode) {
      return HttpResponse.json(problem(400, 'invalid_request', 'Bad request.', 'Verify your email and enter your current password first.'), { status: 400 });
    }
    securityCode = '';
    security = { ...security, mfaEnabled: body.enabled, sessions: [] };
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${API}/api/me/security/revoke-sessions`, () => {
    security = { ...security, sessions: [] };
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${API}/api/me/addresses`, () => HttpResponse.json(profile.addresses)),

  http.post(`${API}/api/me/addresses`, async ({ request }) => {
    const body = (await request.json()) as Omit<Address, 'id'>;
    const invalid = addressProblems(body);
    if (invalid) return invalid;
    const address: Address = { ...body, id: Math.max(0, ...profile.addresses.map(entry => entry.id)) + 1 };
    if (address.isDefault) profile = { ...profile, addresses: [...profile.addresses.map(entry => ({ ...entry, isDefault: false })), address] };
    else profile = { ...profile, addresses: [...profile.addresses, address] };
    return HttpResponse.json(address, { status: 201 });
  }),

  http.put(`${API}/api/me/addresses/:id`, async ({ params, request }) => {
    const id = Number(params.id);
    const body = (await request.json()) as Omit<Address, 'id'>;
    const invalid = addressProblems(body);
    if (invalid) return invalid;
    if (!profile.addresses.some(entry => entry.id === id)) {
      return HttpResponse.json(problem(404, 'not_found', 'Not found.', `Address ${id} was not found.`), { status: 404 });
    }
    const updated: Address = { ...body, id };
    profile = { ...profile, addresses: profile.addresses.map(entry => entry.id === id ? updated : body.isDefault ? { ...entry, isDefault: false } : entry) };
    return HttpResponse.json(updated);
  }),

  http.delete(`${API}/api/me/addresses/:id`, ({ params }) => {
    const id = Number(params.id);
    if (!profile.addresses.some(entry => entry.id === id)) {
      return HttpResponse.json(problem(404, 'not_found', 'Not found.', `Address ${id} was not found.`), { status: 404 });
    }
    profile = { ...profile, addresses: profile.addresses.filter(entry => entry.id !== id) };
    return new HttpResponse(null, { status: 204 });
  }),

  /**
   * The bulk endpoint answers with a per-item result list and rejects a request whose parameters do
   * not fit the action, so the fake mirrors both rules instead of always reporting success.
   */
  http.post(`${API}/api/products/bulk`, async ({ request }) => {
    const body = (await request.json()) as BulkRequest;
    const invalid = bulkProblems(body);
    if (invalid) return invalid;

    const rows = products.filter(product => body.ids.includes(product.id));
    const missing = body.ids.filter(id => !rows.some(row => row.id === id));

    const unchanged = (row: Product): boolean => {
      const params = body.params ?? {};
      switch (body.action) {
        case 'activate': return row.isActive;
        case 'deactivate': return !row.isActive;
        case 'add-tags': return (params.tags ?? []).every(tag => row.tags?.includes(tag));
        case 'remove-tags': return (params.tags ?? []).every(tag => !(row.tags ?? []).includes(tag));
        case 'set-category': return row.categories?.some(category => category.isPrimary && category.id === params.categoryId) ?? false;
        default: return row.brandId === params.brandId && (row.productLineId ?? null) === (params.productLineId ?? null);
      }
    };

    const items: BulkItemResult[] = [
      ...rows.map(row => (unchanged(row)
        ? { id: row.id, sku: row.sku, name: row.name, result: 'skipped' as const, reason: 'Already set.' }
        : { id: row.id, sku: row.sku, name: row.name, result: 'updated' as const, reason: null })),
      ...missing.map(id => ({ id, sku: null, name: null, result: 'failed' as const, reason: 'Product not found.' }))
    ];

    return HttpResponse.json({
      action: body.action,
      requested: body.ids.length,
      updated: items.filter(item => item.result === 'updated').length,
      skipped: items.filter(item => item.result === 'skipped').length,
      failed: items.filter(item => item.result === 'failed').length,
      items
    });
  }),

  http.get(`${API}/api/admin/users`, () => HttpResponse.json(paged(adminUsers))),
  http.get(`${API}/api/admin/audit-logs`, () => HttpResponse.json(paged([]))),
  http.get(`${API}/api/admin/settings`, () => HttpResponse.json({ lowStockThreshold: 5 })),

  http.get(`${API}/api/admin/discount-policy`, () =>
    HttpResponse.json({ policy: demoDiscountPolicy, promoSpendLast7Days: demoPromoSpendLast7Days })),

  http.put(`${API}/api/admin/discount-policy`, async ({ request }) => {
    const body = (await request.json()) as Record<string, number>;
    const next = { ...demoDiscountPolicy };
    for (const key of Object.keys(next) as Array<keyof typeof next>) {
      if (body[key] !== undefined) next[key] = Number(body[key]) || 0;
    }

    // Mirrors the server's own guard: a threshold above the hard limit could never be reached.
    if (next.approvalAbovePercentage > 0 && next.maxPercentageOff > 0 && next.approvalAbovePercentage > next.maxPercentageOff) {
      return HttpResponse.json({
        title: 'Bad Request',
        detail: `The approval threshold of ${pct(next.approvalAbovePercentage)} is above the maximum rate of ${pct(next.maxPercentageOff)}, so no coupon could ever reach it. Set the threshold at or below the maximum.`
      }, { status: 400 });
    }

    if (next.approvalAboveAmount > 0 && next.maxAmountPerOrder > 0 && next.approvalAboveAmount > next.maxAmountPerOrder) {
      return HttpResponse.json({
        title: 'Bad Request',
        detail: `The approval threshold of ${taka(next.approvalAboveAmount)} is above the maximum discount of ${taka(next.maxAmountPerOrder)}, so no coupon could ever reach it. Set the threshold at or below the maximum.`
      }, { status: 400 });
    }

    demoDiscountPolicy = next;
    return HttpResponse.json({ policy: next, promoSpendLast7Days: demoPromoSpendLast7Days });
  }),

  // Enterprise endpoints
  http.post(`${API}/api/coupons/validate`, async ({ request }) => {
    const body = (await request.json()) as { code: string; subTotal: number };
    if (body.code.toUpperCase() === 'SAVE10') {
      return HttpResponse.json({
        isValid: true,
        reason: null,
        discountAmount: Math.round(body.subTotal * 0.1),
        code: 'SAVE10'
      });
    }
    if (body.code.toUpperCase() === 'WELCOME50') {
      return HttpResponse.json({
        isValid: true,
        reason: null,
        discountAmount: Math.min(body.subTotal, 50),
        code: 'WELCOME50'
      });
    }
    if (body.code.toUpperCase() === 'NINECUBE') {
      if (body.subTotal < 2000) {
        return HttpResponse.json({
          isValid: false,
          reason: 'Order total must be at least BDT 2,000 to use this coupon.',
          discountAmount: 0,
          code: null
        });
      }
      return HttpResponse.json({
        isValid: true,
        reason: null,
        discountAmount: Math.min(body.subTotal, 500),
        code: 'NINECUBE'
      });
    }
    return HttpResponse.json({
      isValid: false,
      reason: 'Invalid or expired coupon code.',
      discountAmount: 0,
      code: null
    });
  }),

  http.post(`${API}/api/coupons/evaluate-cart`, async ({ request }) => {
    const body = (await request.json()) as { subTotal: number; manualCouponCode?: string };
    const subTotal = Number(body.subTotal || 0);
    const freeShippingThreshold = 2500;
    const qualifiesForFreeShipping = subTotal >= freeShippingThreshold;
    const amountNeededForFreeShipping = qualifiesForFreeShipping ? 0 : Math.max(0, freeShippingThreshold - subTotal);

    let autoDiscount = null;
    if (subTotal >= 2000) {
      autoDiscount = {
        isValid: true,
        reason: null,
        discountAmount: Math.min(2000, Math.round(subTotal * 0.1)),
        code: 'AUTO2000',
        campaignTitle: '⚡ Auto-Promo: 10% OFF on BDT 2,000+ orders',
        targetType: 'Order'
      };
    }

    let manualDiscount = null;
    if (body.manualCouponCode) {
      const code = body.manualCouponCode.toUpperCase();
      if (code === 'SAVE10') {
        manualDiscount = { isValid: true, reason: null, discountAmount: Math.round(subTotal * 0.1), code: 'SAVE10' };
      } else if (code === 'WELCOME50') {
        manualDiscount = { isValid: true, reason: null, discountAmount: Math.min(subTotal, 50), code: 'WELCOME50' };
      } else if (code === 'NINECUBE') {
        if (subTotal >= 2000) {
          manualDiscount = { isValid: true, reason: null, discountAmount: Math.min(subTotal, 500), code: 'NINECUBE' };
        } else {
          manualDiscount = { isValid: false, reason: 'Order total must be at least BDT 2,000 to use this coupon.', discountAmount: 0, code: null };
        }
      }
    }

    const effective = (manualDiscount?.isValid && manualDiscount.discountAmount >= (autoDiscount?.discountAmount || 0))
      ? manualDiscount
      : (autoDiscount || manualDiscount);

    return HttpResponse.json({
      automaticDiscount: autoDiscount,
      manualDiscount: manualDiscount,
      effectiveDiscount: effective?.isValid ? effective : null,
      totalDiscountAmount: effective?.isValid ? effective.discountAmount : 0,
      activeCampaignHeadline: autoDiscount?.campaignTitle || '⚡ Spring Deals: Free Shipping on BDT 2,500+',
      freeShippingThreshold,
      qualifiesForFreeShipping,
      amountNeededForFreeShipping
    });
  }),

  http.get(`${API}/api/coupons`, () => HttpResponse.json(demoCoupons)),
  http.get(`${API}/api/coupons/available`, () => HttpResponse.json(demoCoupons.filter(c => c.isActive))),
  http.get(`${API}/api/coupons/campaigns`, () => HttpResponse.json(demoCoupons.filter(c => c.isActive && c.isBannerPromoted))),

  http.post(`${API}/api/coupons/scope-preview`, async ({ request }) => {
    const body = (await request.json()) as {
      scopeRules?: ScopeRuleLike[];
      scopeMatch?: string;
      discountType: 'Percentage' | 'FixedAmount';
      discountValue: number;
      maxDiscountCap?: number | null;
    };

    const rules = body.scopeRules ?? [];
    const active = products.filter(p => p.isActive);
    const matched = active.filter(p => matchScope(p, rules, body.scopeMatch ?? 'Any'));

    const units = matched.reduce((sum, p) => sum + p.stockQuantity, 0);
    const exposed = matched.reduce((sum, p) => sum + p.price * p.stockQuantity, 0);
    const average = matched.length ? matched.reduce((sum, p) => sum + p.price, 0) / matched.length : 0;
    const raw = body.discountType === 'Percentage' ? average * (body.discountValue / 100) : Math.min(average, body.discountValue);
    const forecast = matched.length === 0
      ? 0
      : money(body.maxDiscountCap && body.maxDiscountCap > 0 ? Math.min(raw, body.maxDiscountCap) : raw);

    const conflicts = demoCoupons
      .filter(c => c.isActive)
      .map(c => ({
        code: c.code,
        campaignTitle: c.campaignTitle ?? null,
        overlappingProducts: matched.filter(p => matchScope(p, couponRules(c), 'Any')).length,
        isAutomatic: !!c.isAutomatic
      }))
      .filter(c => c.overlappingProducts > 0)
      .sort((a, b) => b.overlappingProducts - a.overlappingProducts)
      .slice(0, 5);

    return HttpResponse.json({
      totalActiveProducts: active.length,
      matchedProducts: matched.length,
      matchedUnits: units,
      exposedStockValue: money(exposed),
      averageQualifyingValue: money(average),
      valueBasis: matched.length ? 'AverageProductPrice' : 'NotEstimated',
      forecastDiscount: forecast,
      sampleProducts: matched.slice(0, 3).map(p => p.name),
      conflicts
    });
  }),

  http.post(`${API}/api/coupons`, async ({ request }) => {
    const payload = (await request.json()) as any;

    const refusal = policyRefusal(payload) ?? campaignCapRefusal();
    if (refusal) return HttpResponse.json({ title: 'Bad Request', detail: refusal }, { status: 400 });

    const queued = needsSecondSignature(payload);
    const newCoupon = {
      id: demoCoupons.length + 1,
      code: String(payload.code).toUpperCase(),
      discountType: payload.discountType,
      discountValue: Number(payload.discountValue),
      minOrderAmount: Number(payload.minOrderAmount || 0),
      maxDiscountCap: payload.maxDiscountCap ? Number(payload.maxDiscountCap) : null,
      targetType: payload.targetType || 'Order',
      targetId: payload.targetId ? Number(payload.targetId) : null,
      startsAt: payload.startsAt || null,
      expiresAt: payload.expiresAt || null,
      isAutomatic: payload.isAutomatic || false,
      campaignTitle: payload.campaignTitle || null,
      isBannerPromoted: payload.isBannerPromoted || false,
      usageLimit: payload.usageLimit ? Number(payload.usageLimit) : null,
      usageCount: 0,
      isActive: !queued,
      minEligibleAmount: Number(payload.minEligibleAmount || 0),
      scopeMatch: payload.scopeMatch || 'Any',
      exclusivity: payload.exclusivity || 'BestOnly',
      scopeRules: withScopeNames(payload.scopeRules),
      approvalState: (queued ? 'Pending' : 'NotRequired') as 'Pending' | 'NotRequired',
      submittedByEmail: queued ? demoSessionEmail : null,
      submittedAt: queued ? new Date().toISOString() : null,
      reviewedByEmail: null,
      reviewedAt: null,
      rejectionReason: null,
      createdAt: new Date().toISOString()
    };
    demoCoupons.push(newCoupon);
    return HttpResponse.json(newCoupon, { status: 201 });
  }),

  /** The coupon run against the shop's own order history, the way the replay endpoint measures it. */
  http.post(`${API}/api/coupons/order-replay`, async ({ request }) => {
    const body = (await request.json()) as {
      scopeRules?: ScopeRuleLike[];
      scopeMatch?: string;
      discountType: 'Percentage' | 'FixedAmount';
      discountValue: number;
      maxDiscountCap?: number | null;
      minOrderAmount?: number;
      minEligibleAmount?: number;
      days?: number;
    };

    const days = Number(body.days ?? 30);
    const since = Date.now() - days * 86_400_000;
    const inWindow = demoOrderHistory.filter(o => new Date(o.createdAt).getTime() >= since);
    const released = (status: string) => status === 'Cancelled' || status === 'Rejected';
    const standing = inWindow.filter(o => !released(o.status));
    const actualGiveaway = standing.reduce((sum, o) => sum + o.discountAmount, 0);
    const rules = body.scopeRules ?? [];
    const notes: string[] = [];

    if (standing.length < inWindow.length) {
      notes.push(`${inWindow.length - standing.length} of those orders were cancelled or rejected, so their discounts were never given and are left out of this replay.`);
    }

    if (standing.length === 0) {
      notes.push(inWindow.length === 0
        ? `There are no orders at all in the last ${days} days, so there is nothing here to measure.`
        : `Every order in the last ${days} days was cancelled or rejected.`);

      return HttpResponse.json({
        daysLookedBack: days,
        ordersInWindow: inWindow.length,
        ordersQualified: 0,
        totalGiveaway: 0,
        averageGiveawayPerOrder: 0,
        shareOfOrderValuePercent: 0,
        actualGiveawayInWindow: money(actualGiveaway),
        hasOrders: false,
        topProducts: [],
        notes
      });
    }

    const minOrder = Number(body.minOrderAmount ?? 0);
    const scopeFloor = Number(body.minEligibleAmount ?? 0);
    const perProduct = new Map<number, { times: number; units: number; giveaway: number }>();
    let total = 0, qualifyingRevenue = 0, belowMinimum = 0, outOfScope = 0, belowFloor = 0, qualified = 0;

    for (const order of standing) {
      if (order.subTotal < minOrder) { belowMinimum++; continue; }

      const lines = order.lines.filter(l => {
        const product = products.find(p => p.id === l.productId);
        return product ? matchScope(product, rules, body.scopeMatch ?? 'Any') : rules.length === 0;
      });
      const eligible = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

      if (eligible <= 0) { outOfScope++; continue; }
      if (scopeFloor > 0 && eligible < scopeFloor) { belowFloor++; continue; }

      const raw = body.discountType === 'Percentage'
        ? eligible * (Number(body.discountValue) / 100)
        : Math.min(Number(body.discountValue), eligible);
      const giveaway = Math.min(body.maxDiscountCap ? Math.min(raw, Number(body.maxDiscountCap)) : raw, order.subTotal);
      if (giveaway <= 0) continue;

      total += giveaway;
      qualifyingRevenue += order.subTotal;
      qualified++;

      for (const line of lines) {
        const share = giveaway * (line.quantity * line.unitPrice) / eligible;
        const current = perProduct.get(line.productId) ?? { times: 0, units: 0, giveaway: 0 };
        perProduct.set(line.productId, { times: current.times + 1, units: current.units + line.quantity, giveaway: current.giveaway + share });
      }
    }

    if (qualified === 0) {
      if (belowMinimum === standing.length) {
        notes.push(`Every order in the window is under this coupon's own minimum order of ${taka(minOrder)}.`);
      } else if (outOfScope > 0) {
        notes.push(`None of the ${outOfScope} order(s) whose size qualifies carry a product this scope reaches.`);
      } else if (belowFloor > 0) {
        notes.push(`${belowFloor} order(s) reached the scope but not its in-scope spend of ${taka(scopeFloor)}.`);
      }
    }

    const topProducts = [...perProduct.entries()]
      .sort((a, b) => b[1].giveaway - a[1].giveaway)
      .slice(0, 5)
      .map(([productId, impact]) => ({
        productName: products.find(p => p.id === productId)?.name ?? `Product ${productId}`,
        timesDiscounted: impact.times,
        units: impact.units,
        giveaway: money(impact.giveaway)
      }));

    return HttpResponse.json({
      daysLookedBack: days,
      ordersInWindow: inWindow.length,
      ordersQualified: qualified,
      totalGiveaway: money(total),
      averageGiveawayPerOrder: qualified ? money(total / qualified) : 0,
      shareOfOrderValuePercent: qualifyingRevenue ? Math.round(((total / qualifyingRevenue) * 100) * 10) / 10 : 0,
      actualGiveawayInWindow: money(actualGiveaway),
      // The window had orders to measure, even when none of them qualified — the panel then shows zeros
      // beside the note that says why, rather than claiming the shop has no history.
      hasOrders: standing.length > 0,
      topProducts,
      notes
    });
  }),

  http.put(`${API}/api/coupons/:id`, async ({ params, request }) => {
    const id = Number(params.id);
    const body = (await request.json()) as any;
    const idx = demoCoupons.findIndex(c => c.id === id);
    if (idx === -1) return new HttpResponse(null, { status: 404 });

    const stored = demoCoupons[idx];
    const money = { ...stored, ...body };
    const refusal = policyRefusal(money);
    if (refusal) return HttpResponse.json({ title: 'Bad Request', detail: refusal }, { status: 400 });

    // An edit that crosses the approval threshold sends the coupon back for a second signature;
    // an edit that comes back under it releases it again. A coupon that never needed approval keeps
    // whatever switch position it already had.
    const queued = needsSecondSignature(money);
    const released = !queued && stored.approvalState !== 'NotRequired';

    demoCoupons[idx] = {
      ...stored,
      ...body,
      ...(body.scopeRules ? { scopeRules: withScopeNames(body.scopeRules) } : null),
      approvalState: (queued ? 'Pending' : 'NotRequired') as 'Pending' | 'NotRequired',
      isActive: queued ? false : released ? true : stored.isActive,
      ...(queued && stored.approvalState !== 'Pending'
        ? { submittedByEmail: demoSessionEmail, submittedAt: new Date().toISOString(), reviewedByEmail: null, reviewedAt: null }
        : null),
      ...(!queued ? { rejectionReason: null } : null)
    };
    return HttpResponse.json(demoCoupons[idx]);
  }),

  http.put(`${API}/api/coupons/:id/approve`, ({ params }) => {
    const found = demoCoupons.find(c => c.id === Number(params.id));
    if (!found) return new HttpResponse(null, { status: 404 });

    if (found.approvalState !== 'Pending') {
      return HttpResponse.json({ title: 'Conflict', detail: `${found.code} is not waiting for approval.` }, { status: 409 });
    }

    if (found.submittedByEmail?.toLowerCase() === demoSessionEmail.toLowerCase()) {
      return HttpResponse.json({
        title: 'Conflict',
        code: 'self_approval',
        detail: `You wrote ${found.code}, so a second administrator has to approve it.`
      }, { status: 409 });
    }

    const capped = campaignCapRefusal();
    if (capped) return HttpResponse.json({ title: 'Bad Request', detail: capped }, { status: 400 });

    found.approvalState = 'Approved';
    found.isActive = true;
    found.reviewedByEmail = demoSessionEmail;
    found.reviewedAt = new Date().toISOString();
    found.rejectionReason = null;
    return HttpResponse.json(found);
  }),

  http.put(`${API}/api/coupons/:id/reject`, async ({ params, request }) => {
    const found = demoCoupons.find(c => c.id === Number(params.id));
    if (!found) return new HttpResponse(null, { status: 404 });

    if (found.approvalState !== 'Pending') {
      return HttpResponse.json({ title: 'Conflict', detail: `${found.code} is not waiting for approval.` }, { status: 409 });
    }

    const body = (await request.json()) as { reason?: string };
    const reason = String(body.reason ?? '').trim();
    if (reason.length < 5) {
      return HttpResponse.json({
        title: 'Bad Request',
        detail: 'Say why in a few words, so the writer can act on it.'
      }, { status: 400 });
    }

    found.approvalState = 'Rejected';
    found.isActive = false;
    found.rejectionReason = reason;
    found.reviewedByEmail = demoSessionEmail;
    found.reviewedAt = new Date().toISOString();
    return HttpResponse.json(found);
  }),
  http.delete(`${API}/api/coupons/:id`, ({ params }) => {
    const id = Number(params.id);
    demoCoupons = demoCoupons.filter(c => c.id !== id);
    return HttpResponse.json({ success: true, id });
  }),
  http.put(`${API}/api/gift-cards/:id`, async ({ params, request }) => {
    const id = Number(params.id);
    const body = (await request.json()) as any;
    const idx = demoGiftCards.findIndex(g => g.id === id);
    if (idx !== -1) {
      demoGiftCards[idx] = { ...demoGiftCards[idx], ...body };
      return HttpResponse.json(demoGiftCards[idx]);
    }
    return new HttpResponse(null, { status: 404 });
  }),
  http.delete(`${API}/api/gift-cards/:id`, ({ params }) => {
    const id = Number(params.id);
    demoGiftCards = demoGiftCards.filter(g => g.id !== id);
    return HttpResponse.json({ success: true, id });
  }),

  http.put(`${API}/api/coupons/:id/status`, ({ params, request }) => {
    const url = new URL(request.url);
    const isActive = url.searchParams.get('isActive') !== 'false';
    const found = demoCoupons.find((c) => c.id === Number(params.id));
    if (!found) return new HttpResponse(null, { status: 404 });

    if (isActive && found.approvalState === 'Pending') {
      return HttpResponse.json({
        title: 'Bad Request',
        detail: `${found.code} is waiting for a second administrator to approve it, so it cannot go live yet.`
      }, { status: 400 });
    }

    if (isActive && found.approvalState === 'Rejected') {
      return HttpResponse.json({
        title: 'Bad Request',
        detail: `${found.code} was refused${refusalClause(found.rejectionReason)}Edit it and it goes back for approval.`
      }, { status: 400 });
    }

    if (isActive) {
      const capped = campaignCapRefusal();
      if (capped) return HttpResponse.json({ title: 'Bad Request', detail: capped }, { status: 400 });
    }

    found.isActive = isActive;
    return HttpResponse.json({ success: true, isActive });
  }),

  // Gift Card endpoints
  http.get(`${API}/api/gift-cards`, () => HttpResponse.json(demoGiftCards)),

  http.post(`${API}/api/gift-cards`, async ({ request }) => {
    const payload = (await request.json()) as any;
    const code = payload.code || `GC-DEMO-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const newCard = {
      id: demoGiftCards.length + 1,
      code,
      initialBalance: Number(payload.initialBalance),
      currentBalance: Number(payload.initialBalance),
      currency: 'BDT',
      recipientEmail: payload.recipientEmail || null,
      recipientName: payload.recipientName || null,
      note: payload.note || null,
      isActive: true,
      expiresAt: payload.expiresAt || null,
      createdAt: new Date().toISOString(),
      lastUsedAt: null
    };
    demoGiftCards.unshift(newCard);
    return HttpResponse.json(newCard, { status: 201 });
  }),

  http.put(`${API}/api/gift-cards/:id/status`, ({ params }) => {
    const found = demoGiftCards.find((g) => g.id === Number(params.id));
    if (found) found.isActive = !found.isActive;
    return HttpResponse.json(found);
  }),

  http.put(`${API}/api/gift-cards/:id/balance`, async ({ params, request }) => {
    const body = (await request.json()) as any;
    const found = demoGiftCards.find((g) => g.id === Number(params.id));
    if (found) found.currentBalance = Number(body.newBalance);
    return HttpResponse.json(found);
  }),

  http.post(`${API}/api/gift-cards/validate`, async ({ request }) => {
    const body = (await request.json()) as { code: string };
    const code = (body.code || '').trim().toUpperCase();
    const found = demoGiftCards.find((g) => g.code === code);
    if (!found) {
      return HttpResponse.json({ isValid: false, code: null, currentBalance: 0, currency: 'BDT', recipientName: null, reason: 'Gift card code not found.' });
    }
    if (!found.isActive) {
      return HttpResponse.json({ isValid: false, code: found.code, currentBalance: 0, currency: found.currency, recipientName: found.recipientName, reason: 'This gift card has been disabled.' });
    }
    if (found.currentBalance <= 0) {
      return HttpResponse.json({ isValid: false, code: found.code, currentBalance: 0, currency: found.currency, recipientName: found.recipientName, reason: 'This gift card has zero remaining balance.' });
    }
    return HttpResponse.json({ isValid: true, code: found.code, currentBalance: found.currentBalance, currency: found.currency, recipientName: found.recipientName, reason: null });
  }),

  http.post(`${API}/api/payments/process`, async ({ request }) => {
    const body = (await request.json()) as { orderId: number; provider: string };
    return HttpResponse.json({
      id: 999,
      orderId: body.orderId,
      amount: 100,
      currency: 'BDT',
      provider: body.provider,
      transactionReference: `TX-MOCK-${Date.now()}`,
      status: 'Paid',
      createdAt: new Date().toISOString()
    });
  }),

  http.get(`${API}/api/reviews/products/:id`, () =>
    HttpResponse.json({
      averageRating: 4.8,
      totalReviews: 2,
      recentReviews: [
        {
          id: 1,
          productId: 1,
          customerId: 10,
          customerName: 'Rahim Ahmed',
          rating: 5,
          comment: 'Excellent build quality and reliable performance!',
          isVerifiedBuyer: true,
          createdAt: new Date().toISOString()
        }
      ]
    })
  ),

  http.post(`${API}/api/reviews/products/:id`, async ({ params, request }) => {
    const body = (await request.json()) as { rating: number; comment?: string };
    return HttpResponse.json({
      id: Math.floor(Math.random() * 1000) + 1,
      productId: Number(params.id),
      customerId: 10,
      customerName: 'Customer',
      rating: body.rating,
      comment: body.comment ?? null,
      isVerifiedBuyer: true,
      createdAt: new Date().toISOString()
    }, { status: 201 });
  }),

  http.get(`${API}/api/wishlist`, () => HttpResponse.json([])),

  http.post(`${API}/api/wishlist/:id/toggle`, () =>
    HttpResponse.json({ inWishlist: true })
  ),

  http.post(`${API}/api/auth/forgot-password`, async ({ request }) => {
    void (await request.json());
    return HttpResponse.json({
      message: 'Password reset token generated.'
    });
  }),

  http.post(`${API}/api/auth/reset-password`, () =>
    HttpResponse.json({ success: true, message: 'Password has been successfully reset.' })
  ),

  http.post(`${API}/api/auth/refresh`, () =>
    HttpResponse.json({
      accessToken: 'MOCK-REFRESHED-JWT',
      expiresAtUtc: new Date(Date.now() + 3600000).toISOString(),
      user: { id: 1, email: 'customer@ninecube.demo', role: 'Customer', customerId: 10 },
      refreshToken: 'MOCK-ROTATED-REFRESH-TOKEN'
    })
  ),

  http.post(`${API}/api/auth/logout`, () =>
    HttpResponse.json({ success: true })
  ),

  // Chat: the assistant answers from the seeded products, the support thread is a real conversation row.
  http.get(`${API}/api/chat/conversations`, () => HttpResponse.json(chatConversations)),

  http.post(`${API}/api/chat/conversations`, async ({ request }) => {
    const body = (await request.json()) as { subject?: string; message?: string };
    if (!body.message?.trim()) {
      return HttpResponse.json(problem(400, 'invalid_request', 'Bad request.', 'Write a message first.'), { status: 400 });
    }
    const id = chatConversations.length + 1;
    const now = new Date().toISOString();
    chatConversations.push({
      id,
      subject: body.subject?.slice(0, 200) || 'Support chat',
      status: 'open',
      createdAt: now,
      updatedAt: now,
      lastMessage: { body: body.message, authorKind: 'customer', createdAt: now },
      unreadCount: 0
    });
    chatMessages.push({ id: chatMessages.length + 1, conversationId: id, authorKind: 'customer', authorName: 'Customer', body: body.message, createdAt: now });
    return HttpResponse.json({ id });
  }),

  http.get(`${API}/api/chat/conversations/:id/messages`, ({ params }) => {
    const id = Number(params.id);
    return HttpResponse.json(chatMessages.filter(message => message.conversationId === id));
  }),

  http.post(`${API}/api/chat/conversations/:id/messages`, async ({ params, request }) => {
    const body = (await request.json()) as { body?: string };
    if (!body.body?.trim()) {
      return HttpResponse.json(problem(400, 'invalid_request', 'Bad request.', 'Write a message first.'), { status: 400 });
    }
    const conversationId = Number(params.id);
    const message: ChatMessage = {
      id: chatMessages.length + 1,
      conversationId,
      authorKind: 'customer',
      authorName: 'Customer',
      body: body.body,
      createdAt: new Date().toISOString()
    };
    chatMessages.push(message);
    return HttpResponse.json({ message });
  }),

  http.post(`${API}/api/chat/assistant`, async ({ request }) => {
    const body = (await request.json()) as { question?: string; conversationId?: number };
    const question = body.question?.trim() ?? '';
    if (!question) {
      return HttpResponse.json(problem(400, 'invalid_request', 'Bad request.', 'Ask a question first.'), { status: 400 });
    }
    const conversationId = body.conversationId ?? 0;
    if (conversationId) {
      chatMessages.push({ id: chatMessages.length + 1, conversationId, authorKind: 'customer', authorName: 'Customer', body: question, createdAt: new Date().toISOString() });
    }
    const lower = question.toLowerCase();
    const matches: ChatAssistantMatch[] = products
      .filter(product => lower.split(/\s+/).some(word => word.length > 2 && product.name.toLowerCase().includes(word)))
      .slice(0, 3)
      .map(product => ({ kind: 'product' as const, id: product.id, title: product.name, detail: `৳${product.price}`, link: `/products/${product.id}` }));
    const reply = lower.includes('order')
      ? 'Your orders are listed on the orders page with their current status.'
      : lower.includes('return') || lower.includes('policy')
        ? 'Returns are accepted within the store return window; the full text is on the policies page.'
        : matches.length
          ? `Here is what the catalogue has for "${question}".`
          : `I could not find "${question}" in the live catalogue. Try another word, or write to the support team.`;
    if (lower.includes('return') || lower.includes('policy')) {
      matches.length = 0;
      matches.push({ kind: 'policy', title: 'Returns', detail: 'Store return policy', link: '/policies/returns' });
    }
    if (lower.includes('order')) {
      matches.length = 0;
      matches.push({ kind: 'order', title: 'My orders', detail: 'Every order and its status', link: '/orders' });
    }
    const persisted: ChatMessage = {
      id: conversationId ? chatMessages.length + 1 : 0,
      conversationId,
      authorKind: 'assistant',
      authorName: 'NineCube Assistant',
      body: reply,
      createdAt: new Date().toISOString()
    };
    if (conversationId) chatMessages.push(persisted);
    return HttpResponse.json({ reply: persisted, matches });
  })
];

/** Same required-field rule the API applies before it writes an address row. */
function addressProblems(body: Omit<Address, 'id'>): Response | null {
  const required = ['label', 'division', 'district', 'upazila', 'addressLine'] as const;
  const missing = required.filter(key => !String(body[key] ?? '').trim());
  if (missing.length === 0) return null;
  return HttpResponse.json(problem(400, 'invalid_request', 'Bad request.', 'The address is incomplete.', {
    errors: Object.fromEntries(missing.map(key => [key, [`${key} is required.`]]))
  }), { status: 400 });
}

type BulkRequest = {
  ids: number[];
  action: BulkProductAction;
  params?: { categoryId?: number; tags?: string[]; brandId?: number; productLineId?: number };
};

/** The server-side guard rails: a maximum of 200 ids, and parameters that fit the chosen action. */
function bulkProblems(body: BulkRequest): Response | null {
  const errors: Record<string, string[]> = {};
  const params = body.params ?? {};

  if (!Array.isArray(body.ids) || body.ids.length === 0) errors['ids'] = ['Select at least one product.'];
  else if (body.ids.length > 200) errors['ids'] = ['A bulk request covers at most 200 products.'];

  if (body.action === 'set-category' && !params.categoryId) errors['params.categoryId'] = ['Choose a category.'];
  if ((body.action === 'add-tags' || body.action === 'remove-tags') && (params.tags ?? []).length === 0) {
    errors['params.tags'] = ['Enter at least one tag.'];
  }
  if (body.action === 'assign-brand' && !params.brandId && !params.productLineId) {
    errors['params.brandId'] = ['Choose a brand or a series.'];
  }

  if (Object.keys(errors).length > 0) {
    return HttpResponse.json(problem(400, 'invalid_request', 'Bad request.', 'The bulk request is incomplete.', { errors }), { status: 400 });
  }
  return null;
}
