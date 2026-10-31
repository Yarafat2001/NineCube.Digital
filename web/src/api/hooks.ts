import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, apiUpload } from './client';
import type {
  Address, Brand, BrandLines, BulkProductAction, BulkProductResult, Category, Tag, ProductFilters, FacetFilters, ProductImage,
  AdminUser,
  AuditLogEntry,
  AuthResponse,
  Dashboard,
  InventoryMovement,
  Invoice,
  Notification,
  Order,
  OrderStatus,
  PagedResult,
  Product,
  Profile,
  SalesSummary,
  Settings,
  UserRole,
  Coupon,
  CouponValidationResult,
  PaymentTransaction,
  PaymentMethod,
  ProductReview,
  ProductRatingSummary,
  WishlistItem,
  ForgotPasswordResponse,
  GiftCard,
  CreateGiftCardInput,
  ValidateGiftCardResult
} from './types';
import { useAuth } from '../state/AuthContext';

export const queryKeys = {
  me: ['me'] as const,
  products: (params: ProductFilters) =>
    ['products', params] as const,
  product: (id: number) => ['product', id] as const,
  productImages: (id: number) => ['product-images', id] as const,
  brands: (params: FacetFilters) => ['brands', params] as const,
  brandLines: (slug: string, params: FacetFilters) => ['brand-lines', slug, params] as const,
  lowStock: ['low-stock'] as const,
  lowStockThreshold: ['low-stock-threshold'] as const,
  movements: (productId: number, page: number) => ['movements', productId, page] as const,
  orders: (params: { status?: OrderStatus | ''; page: number; pageSize: number }) => ['orders', params] as const,
  order: (id: number) => ['order', id] as const,
  invoice: (id: number) => ['invoice', id] as const,
  sales: (from: string, to: string) => ['sales', from, to] as const,
  adminUsers: (params: { q: string; page: number }) => ['admin-users', params] as const,
  auditLogs: (params: { action: string; page: number }) => ['admin-audit', params] as const,
  settings: ['admin-settings'] as const,
  profile: ['me-profile'] as const,
  dashboard: ['me-dashboard'] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
  notifications: (params: { unreadOnly: boolean; page: number }) => ['notifications', params] as const,
  reviews: (productId: number) => ['reviews', productId] as const,
  wishlist: ['wishlist'] as const,
  coupons: ['coupons'] as const,
  orderPayments: (orderId: number) => ['order-payments', orderId] as const,
  giftCards: ['gift-cards'] as const
};

/** Thin wrapper so every hook uses the current access token without repeating itself. */
export function useAuthedRequest() {
  const { token } = useAuth();

  return <T,>(path: string, init: Parameters<typeof apiRequest>[1] = {}) =>
    apiRequest<T>(path, { ...init, token });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return (keys: (readonly unknown[])[]) => keys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
}

// ------------------------------------------------------------------ auth

export function useMe() {
  const request = useAuthedRequest();
  return useQuery({ queryKey: queryKeys.me, queryFn: () => request<AuthResponse['user']>('/api/auth/me') });
}

// ------------------------------------------------------------------ catalog

/**
 * One builder for every catalogue query so a filter can never be read by the grid and forgotten
 * by a facet request. Brand and series are repeatable parameters.
 */
function catalogSearchParams(params: Partial<ProductFilters>): URLSearchParams {
  const search = new URLSearchParams();
  if (params.q?.trim()) search.set('q', params.q.trim());
  if (params.isActive !== undefined) search.set('isActive', String(params.isActive));
  for (const key of ['categorySlug', 'includeDescendants', 'tag', 'inStock', 'minPrice', 'maxPrice', 'sort'] as const) {
    const value = params[key];
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  for (const [key, values] of [['brand', params.brands], ['line', params.lines]] as const) {
    (values ?? []).filter(Boolean).forEach(value => search.append(key, value));
  }
  return search;
}

export function useProducts(params: ProductFilters) {
  const request = useAuthedRequest();
  const search = catalogSearchParams(params);
  search.set('page', String(params.page));
  search.set('pageSize', String(params.pageSize));

  return useQuery({
    queryKey: queryKeys.products(params),
    queryFn: () => request<PagedResult<Product>>(`/api/products?${search.toString()}`),
    placeholderData: (previous) => previous,
    refetchInterval: 15_000
  });
}

export function useBrands(params: FacetFilters, enabled = true) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: queryKeys.brands(params),
    queryFn: () => request<Brand[]>(`/api/brands?${catalogSearchParams(params).toString()}`),
    enabled
  });
}

export function useBrandLines(brandSlug: string | null, params: FacetFilters) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: queryKeys.brandLines(brandSlug ?? '', params),
    queryFn: () => request<BrandLines>(`/api/brands/${encodeURIComponent(brandSlug ?? '')}/lines?${catalogSearchParams(params).toString()}`),
    enabled: Boolean(brandSlug)
  });
}

export function useProductImages(productId: number | null, enabled = true) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: queryKeys.productImages(productId ?? 0),
    queryFn: () => request<ProductImage[]>(`/api/products/${productId}/images`),
    enabled: productId !== null && enabled
  });
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function useCatalogInvalidation() {
  const client = useQueryClient();
  return (productId: number) => {
    client.invalidateQueries({ queryKey: ['products'] });
    client.invalidateQueries({ queryKey: queryKeys.product(productId) });
    client.invalidateQueries({ queryKey: queryKeys.productImages(productId) });
    client.invalidateQueries({ queryKey: ['low-stock'] });
  };
}

export function useUploadProductImage() {
  const { token } = useAuth();
  const invalidate = useCatalogInvalidation();

  return useMutation({
    mutationFn: ({ productId, file }: { productId: number; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      return apiUpload<ProductImage>(`/api/products/${productId}/images`, form, token);
    },
    onSuccess: (_image, variables) => invalidate(variables.productId)
  });
}

export function useSetPrimaryImage() {
  const request = useAuthedRequest();
  const invalidate = useCatalogInvalidation();

  return useMutation({
    mutationFn: ({ productId, imageId }: { productId: number; imageId: number }) =>
      request<Product>(`/api/products/${productId}/images/${imageId}/primary`, { method: 'PUT' }),
    onSuccess: (_product, variables) => invalidate(variables.productId)
  });
}

export function useDeleteProductImage() {
  const request = useAuthedRequest();
  const invalidate = useCatalogInvalidation();

  return useMutation({
    mutationFn: ({ productId, imageId }: { productId: number; imageId: number }) =>
      request<Product>(`/api/products/${productId}/images/${imageId}`, { method: 'DELETE' }),
    onSuccess: (_product, variables) => invalidate(variables.productId)
  });
}

export function useProduct(id: number | null) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: queryKeys.product(id ?? 0),
    queryFn: () => request<Product>(`/api/products/${id}`),
    enabled: id !== null
  });
}

export function useLowStockThreshold() {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: queryKeys.lowStockThreshold,
    queryFn: () => request<Settings>('/api/products/low-stock-threshold')
  });
}

export function useLowStock(enabled: boolean) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: queryKeys.lowStock,
    queryFn: () => request<Product[]>('/api/products/low-stock'),
    enabled
  });
}

export function useMovements(productId: number | null, page: number, enabled: boolean) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: queryKeys.movements(productId ?? 0, page),
    queryFn: () => request<PagedResult<InventoryMovement>>(`/api/products/${productId}/movements?page=${page}&pageSize=25`),
    enabled: enabled && productId !== null
  });
}

// ------------------------------------------------------------------ orders

export function useOrders(params: { status?: OrderStatus | ''; page: number; pageSize: number; enabled?: boolean }) {
  const request = useAuthedRequest();
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  search.set('page', String(params.page));
  search.set('pageSize', String(params.pageSize));

  return useQuery({
    queryKey: queryKeys.orders({ status: params.status, page: params.page, pageSize: params.pageSize }),
    queryFn: () => request<PagedResult<Order>>(`/api/orders?${search.toString()}`),
    enabled: params.enabled ?? true,
    placeholderData: (previous) => previous
  });
}

export function useOrder(id: number | null) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: queryKeys.order(id ?? 0),
    queryFn: () => request<Order>(`/api/orders/${id}`),
    enabled: id !== null
  });
}

export function useInvoice(id: number | null, enabled = true) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: queryKeys.invoice(id ?? 0),
    queryFn: () => request<Invoice>(`/api/orders/${id}/invoice`),
    enabled: enabled && id !== null
  });
}

export interface PlaceOrderInput {
  items: { productId: number; quantity: number }[];
  couponCode?: string;
  paymentMethod?: PaymentMethod;
  idempotencyKey: string;
  giftCardCode?: string;
}

/**
 * Placement always carries a client generated ID for the whole submission attempt. The key is
 * created once per attempt (not per click), so an accidental retry returns the original order
 * instead of reserving stock twice.
 */
export function usePlaceOrder() {
  const request = useAuthedRequest();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (input: PlaceOrderInput) => {
      const body: { items: { productId: number; quantity: number }[]; couponCode?: string; paymentMethod?: PaymentMethod; giftCardCode?: string } = {
        items: input.items
      };
      if (input.couponCode) body.couponCode = input.couponCode;
      if (input.paymentMethod) body.paymentMethod = input.paymentMethod;
      if (input.giftCardCode) body.giftCardCode = input.giftCardCode;

      return request<Order>('/api/orders', { method: 'POST', body, idempotencyKey: input.idempotencyKey });
    },
    onSuccess: () => invalidate([queryKeys.orders({ page: 1, pageSize: 20 }), ['products']])
  });
}

export function useOrderAction() {
  const request = useAuthedRequest();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: ({ orderId, action }: { orderId: number; action: 'cancel' | 'confirm' | 'reject' | 'ship' }) =>
      request<Order>(`/api/orders/${orderId}/${action}`, { method: 'POST' }),
    onSuccess: (_data, variables) =>
      invalidate([['orders'], ['order', variables.orderId], ['products'], ['low-stock'], ['sales']])
  });
}

// ------------------------------------------------------------------ reports

export function useSalesSummary(from: string, to: string, enabled: boolean, currency = 'BDT') {
  const request = useAuthedRequest();
  const search = new URLSearchParams({ from, to, currency });

  return useQuery({
    queryKey: [...queryKeys.sales(from, to), currency],
    queryFn: () => request<SalesSummary>(`/api/reports/sales?${search.toString()}`),
    enabled
  });
}

// ------------------------------------------------------------------ inventory

export function useCreateProduct() {
  const request = useAuthedRequest();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (body: { sku: string; name: string; price: number; compareAtPrice?: number | null; isActive: boolean; description?: string; imageUrl?: string; brandId?: number | null; productLineId?: number | null }) =>
      request<Product>('/api/products', { method: 'POST', body }),
    onSuccess: () => invalidate([['products'], ['low-stock']])
  });
}

export function useUpdateProduct() {
  const request = useAuthedRequest();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; name: string; price: number; compareAtPrice?: number | null; isActive: boolean; description?: string; imageUrl?: string; brandId?: number | null; productLineId?: number | null }) =>
      request<Product>(`/api/products/${id}`, { method: 'PUT', body }),
    onSuccess: () => invalidate([['products'], ['low-stock']])
  });
}

export function useAdjustStock() {
  const request = useAuthedRequest();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: ({ id, delta, reason }: { id: number; delta: number; reason: string }) =>
      request<Product>(`/api/products/${id}/stock-adjustments`, { method: 'POST', body: { delta, reason } }),
    onSuccess: () => invalidate([['products'], ['low-stock'], ['movements']])
  });
}

// ------------------------------------------------------------------ admin

export function useAdminUsers(params: { q: string; page: number }, enabled: boolean) {
  const request = useAuthedRequest();
  const search = new URLSearchParams({ page: String(params.page), pageSize: '50' });
  if (params.q.trim()) search.set('q', params.q.trim());

  return useQuery({
    queryKey: queryKeys.adminUsers(params),
    queryFn: () => request<PagedResult<AdminUser>>(`/api/admin/users?${search.toString()}`),
    enabled,
    placeholderData: (previous) => previous
  });
}

export function useCreateUser() {
  const request = useAuthedRequest();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (body: { email: string; password: string; role: UserRole; name?: string }) =>
      request<AdminUser>('/api/admin/users', { method: 'POST', body }),
    onSuccess: () => invalidate([['admin-users'], ['admin-audit']])
  });
}

export function useChangeUserRole() {
  const request = useAuthedRequest();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: ({ id, role }: { id: number; role: UserRole }) =>
      request<AdminUser>(`/api/admin/users/${id}/role`, { method: 'PUT', body: { role } }),
    onSuccess: () => invalidate([['admin-users'], ['admin-audit']])
  });
}

export function useSetUserActive() {
  const request = useAuthedRequest();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      request<AdminUser>(`/api/admin/users/${id}/active`, { method: 'PUT', body: { isActive } }),
    onSuccess: () => invalidate([['admin-users'], ['admin-audit']])
  });
}

export function useAuditLogs(params: { action: string; page: number }, enabled: boolean) {
  const request = useAuthedRequest();
  const search = new URLSearchParams({ page: String(params.page), pageSize: '50' });
  if (params.action.trim()) search.set('action', params.action.trim());

  return useQuery({
    queryKey: queryKeys.auditLogs(params),
    queryFn: () => request<PagedResult<AuditLogEntry>>(`/api/admin/audit-logs?${search.toString()}`),
    enabled,
    placeholderData: (previous) => previous
  });
}

export function useSettings(enabled: boolean) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => request<Settings>('/api/admin/settings'),
    enabled
  });
}

export function useUpdateSettings() {
  const request = useAuthedRequest();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (body: Settings) => request<Settings>('/api/admin/settings', { method: 'PUT', body }),
    onSuccess: () => invalidate([['admin-settings'], ['admin-audit'], ['low-stock'], ['products']])
  });
}

export function useCategories(includeInactive = false) {
  const request = useAuthedRequest();
  return useQuery({ queryKey: ['categories', includeInactive], queryFn: () => request<Category[]>(`/api/categories?includeInactive=${includeInactive}`), refetchInterval: 15_000 });
}
export function useTags() {
  const request = useAuthedRequest();
  return useQuery({ queryKey: ['tags'], queryFn: () => request<Tag[]>('/api/tags') });
}
export function useCategoryMutation() {
  const request = useAuthedRequest();
  const client = useQueryClient();
  return useMutation({ mutationFn: ({ path, method, body }: { path: string; method: 'POST' | 'PUT' | 'DELETE'; body?: unknown }) => request<unknown>(path, { method, body }),
    onSuccess: () => { for (const key of ['categories', 'products', 'tags', 'product']) client.invalidateQueries({ queryKey: [key] }); }
  });
}

// ------------------------------------------------------------------ bulk product edits

/**
 * One request for the whole selection: the server applies it in a single transaction and answers
 * with a per-item result, so the UI never has to loop over products and can report exactly which
 * rows were updated, skipped or failed.
 */
export function useBulkUpdateProducts() {
  const request = useAuthedRequest();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (body: { ids: number[]; action: BulkProductAction; params?: { categoryId?: number; tags?: string[]; brandId?: number; productLineId?: number } }) =>
      request<BulkProductResult>('/api/products/bulk', { method: 'POST', body }),
    onSuccess: () => invalidate([['products'], ['low-stock'], ['categories'], ['tags']])
  });
}

// ------------------------------------------------------------------ notifications

/** The badge polls only the count; the full list is fetched by the notifications page. */
export function useUnreadCount(enabled: boolean) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn: () => request<{ count: number }>('/api/notifications/unread-count'),
    enabled,
    refetchInterval: 30_000
  });
}

export function useNotifications(params: { unreadOnly: boolean; page: number }, enabled = true) {
  const request = useAuthedRequest();
  const search = new URLSearchParams({ unreadOnly: String(params.unreadOnly), page: String(params.page), pageSize: '20' });

  return useQuery({
    queryKey: queryKeys.notifications(params),
    queryFn: () => request<PagedResult<Notification>>(`/api/notifications?${search.toString()}`),
    enabled,
    placeholderData: (previous) => previous
  });
}

function useNotificationInvalidation() {
  const invalidate = useInvalidate();
  return () => invalidate([['notifications'], ['me-dashboard']]);
}

export function useMarkNotificationRead() {
  const request = useAuthedRequest();
  const invalidate = useNotificationInvalidation();

  return useMutation({
    mutationFn: (id: number) => request<Notification>(`/api/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: invalidate
  });
}

export function useMarkAllNotificationsRead() {
  const request = useAuthedRequest();
  const invalidate = useNotificationInvalidation();

  return useMutation({
    mutationFn: () => request<{ count: number }>('/api/notifications/read-all', { method: 'POST' }),
    onSuccess: invalidate
  });
}

export function useDeleteNotification() {
  const request = useAuthedRequest();
  const invalidate = useNotificationInvalidation();

  return useMutation({
    mutationFn: (id: number) => request<void>(`/api/notifications/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate
  });
}

// ------------------------------------------------------------------ profile & dashboard

export function useProfile(enabled = true) {
  const request = useAuthedRequest();
  return useQuery({ queryKey: queryKeys.profile, queryFn: () => request<Profile>('/api/me'), enabled });
}

export function useUpdateProfile() {
  const request = useAuthedRequest();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (body: { name: string; phone?: string | null }) => request<Profile>('/api/me', { method: 'PUT', body }),
    onSuccess: () => invalidate([['me-profile']])
  });
}

export function useChangePassword() {
  const request = useAuthedRequest();

  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      request<void>('/api/me/password', { method: 'PUT', body })
  });
}

/** The address form posts exactly these fields; `id` is added by the update hook. */
export type AddressInput = Omit<Address, 'id'>;

export function useCreateAddress() {
  const request = useAuthedRequest();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (body: AddressInput) => request<Address>('/api/me/addresses', { method: 'POST', body }),
    onSuccess: () => invalidate([['me-profile'], ['me-addresses']])
  });
}

export function useUpdateAddress() {
  const request = useAuthedRequest();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: ({ id, ...body }: AddressInput & { id: number }) => request<Address>(`/api/me/addresses/${id}`, { method: 'PUT', body }),
    onSuccess: () => invalidate([['me-profile'], ['me-addresses']])
  });
}

export function useDeleteAddress() {
  const request = useAuthedRequest();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (id: number) => request<void>(`/api/me/addresses/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidate([['me-profile'], ['me-addresses']])
  });
}

export function useDashboard(enabled = true) {
  const request = useAuthedRequest();
  return useQuery({ queryKey: queryKeys.dashboard, queryFn: () => request<Dashboard>('/api/me/dashboard'), enabled });
}


// ---------------------------------------------------------------- Enterprise E-Commerce Hooks

export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) =>
      apiRequest<ForgotPasswordResponse>('/api/auth/forgot-password', {
        method: 'POST',
        body: { email }
      })
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (payload: { email: string; token: string; newPassword: string }) =>
      apiRequest<{ success: boolean; message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: payload
      })
  });
}

export function useActiveCampaigns() {
  return useQuery({
    queryKey: ['campaigns', 'active'],
    queryFn: () => apiRequest<Coupon[]>('/api/coupons/campaigns'),
    staleTime: 60_000
  });
}

export function useValidateCoupon() {
  return useMutation({
    mutationFn: (payload: {
      code: string;
      subTotal: number;
      items?: { productId: number; quantity: number; unitPrice: number; categoryId?: number; brandId?: number }[];
    }) =>
      apiRequest<CouponValidationResult>('/api/coupons/validate', {
        method: 'POST',
        body: payload
      })
  });
}

export function useCoupons() {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: queryKeys.coupons,
    queryFn: () => request<Coupon[]>('/api/coupons')
  });
}

export function useCreateCoupon() {
  const request = useAuthedRequest();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (payload: {
      code: string;
      discountType: string;
      discountValue: number;
      minOrderAmount: number;
      maxDiscountCap?: number | null;
      targetType?: string;
      targetId?: number | null;
      startsAt?: string | null;
      expiresAt?: string | null;
      usageLimit?: number | null;
      isAutomatic?: boolean;
      campaignTitle?: string | null;
      isBannerPromoted?: boolean;
    }) => request<Coupon>('/api/coupons', { method: 'POST', body: payload }),
    onSuccess: () => invalidate([queryKeys.coupons, ['campaigns']])
  });
}

export function useToggleCouponStatus() {
  const request = useAuthedRequest();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      request<{ success: boolean; isActive: boolean }>(`/api/coupons/${id}/status?isActive=${isActive}`, { method: 'PUT' }),
    onSuccess: () => invalidate([queryKeys.coupons])
  });
}

export function useProcessPayment() {
  const request = useAuthedRequest();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (payload: { orderId: number; provider: PaymentMethod }) =>
      request<PaymentTransaction>('/api/payments/process', { method: 'POST', body: payload }),
    onSuccess: (_, vars) => invalidate([queryKeys.order(vars.orderId), queryKeys.orderPayments(vars.orderId)])
  });
}

export function useOrderPayments(orderId: number) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: queryKeys.orderPayments(orderId),
    queryFn: () => request<PaymentTransaction[]>(`/api/payments/order/${orderId}`),
    enabled: orderId > 0
  });
}

export function useProductReviews(productId: number) {
  return useQuery({
    queryKey: queryKeys.reviews(productId),
    queryFn: () => apiRequest<ProductRatingSummary>(`/api/reviews/products/${productId}`),
    enabled: productId > 0
  });
}

export function useAddReview(productId: number) {
  const request = useAuthedRequest();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (payload: { rating: number; comment?: string }) =>
      request<ProductReview>(`/api/reviews/products/${productId}`, { method: 'POST', body: payload }),
    onSuccess: () => invalidate([queryKeys.reviews(productId)])
  });
}

export function useWishlist() {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: queryKeys.wishlist,
    queryFn: () => request<WishlistItem[]>('/api/wishlist')
  });
}

export function useToggleWishlist() {
  const request = useAuthedRequest();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (productId: number) =>
      request<{ inWishlist: boolean }>(`/api/wishlist/${productId}/toggle`, { method: 'POST' }),
    onSuccess: () => invalidate([queryKeys.wishlist])
  });
}


export function useGiftCards() {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: queryKeys.giftCards,
    queryFn: () => request<GiftCard[]>('/api/gift-cards')
  });
}

export function useCreateGiftCard() {
  const request = useAuthedRequest();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (payload: CreateGiftCardInput) => request<GiftCard>('/api/gift-cards', { method: 'POST', body: payload }),
    onSuccess: () => invalidate([queryKeys.giftCards])
  });
}

export function useToggleGiftCardStatus() {
  const request = useAuthedRequest();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id }: { id: number }) => request<GiftCard>(`/api/gift-cards/${id}/status`, { method: 'PUT' }),
    onSuccess: () => invalidate([queryKeys.giftCards])
  });
}

export function useAdjustGiftCardBalance() {
  const request = useAuthedRequest();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, newBalance, reason }: { id: number; newBalance: number; reason?: string }) =>
      request<GiftCard>(`/api/gift-cards/${id}/balance`, { method: 'PUT', body: { newBalance, reason } }),
    onSuccess: () => invalidate([queryKeys.giftCards])
  });
}

export function useValidateGiftCard() {
  return useMutation({
    mutationFn: (code: string) =>
      apiRequest<ValidateGiftCardResult>('/api/gift-cards/validate', { method: 'POST', body: { code } })
  });
}
