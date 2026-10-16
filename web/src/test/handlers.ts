import { http, HttpResponse } from 'msw';
import type { Address, AdminUser, Brand, BulkItemResult, BulkProductAction, BrandLines, Dashboard, Notification, Order, Product, ProductImage, Profile, Tag, UserSummary } from '../api/types';

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

const addressSeed: Address[] = [
  { id: 7, label: 'Home', division: 'Dhaka', district: 'Dhaka', upazila: 'Dhanmondi', addressLine: 'House 12, Road 5', phone: '01712345678', isDefault: true }
];

const profileSeed: Profile = {
  id: 10, name: 'Demo Customer', email: 'customer@ninecube.demo', phone: '01712345678',
  role: 'Customer', createdAt: '2026-09-01T09:00:00Z', addresses: addressSeed
};

export let inbox = inboxSeed.map(entry => ({ ...entry }));
export let profile: Profile = { ...profileSeed, addresses: addressSeed.map(entry => ({ ...entry })) };

export function resetAccountFixtures() {
  inbox = inboxSeed.map(entry => ({ ...entry }));
  profile = { ...profileSeed, addresses: addressSeed.map(entry => ({ ...entry })) };
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
 * Default handlers describe the signed-out, healthy API. Individual tests override the
 * interesting endpoints with server.use(...).
 */
export const handlers = [
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
  http.get(`${API}/api/admin/settings`, () => HttpResponse.json({ lowStockThreshold: 5 }))
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
