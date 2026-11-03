/**
 * Mirrors the backend contracts (NineCube.Application.Contracts). Enums travel as strings.
 */

export type UserRole = 'Customer' | 'Staff' | 'InventoryManager' | 'Administrator';

export type OrderStatus = 'Pending' | 'Confirmed' | 'Shipped' | 'Rejected' | 'Cancelled' | 'Delivered' | 'DeliveryFailed';

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface UserSummary {
  id: number;
  email: string;
  role: UserRole;
  customerId: number | null;
}

export interface AuthResponse {
  accessToken: string;
  expiresAtUtc: string;
  user: UserSummary;
  refreshToken?: string | null;
}

export interface ProductImage {
  id: number;
  /** Rooted path such as /uploads/3f2a.png; resolve with resolveAssetUrl before rendering. */
  url: string;
  isPrimary: boolean;
  altText: string | null;
}

export interface Product {
  specsJson?: string | null;
  parentProductId?: number | null; variantLabel?: string | null; hasVariants?: boolean;
  slug?: string; needsReview?: boolean; priceBasis?: string; priceVerifiedAt?: string | null; sourceName?: string | null; sourceUrl?: string | null;
  currency?: string;
  categories?: ProductCategory[];
  tags?: string[];
  id: number;
  sku: string;
  name: string;
  price: number;
  stockQuantity: number;
  isActive: boolean;
  rowVersion: string | null;
  description?: string | null;
  imageUrl?: string | null;
  brandId?: number | null;
  brandName?: string | null;
  brandSlug?: string | null;
  productLineId?: number | null;
  productLineName?: string | null;
  productLineSlug?: string | null;
  images?: ProductImage[] | null;
  compareAtPrice?: number | null;
}

export interface ProductCategory { id: number; name: string; slug: string; isPrimary: boolean }
export interface Brand { id: number; name: string; slug: string; productCount: number }
export interface ProductLine { id: number; name: string; slug: string; sortOrder: number; productCount: number }
export interface BrandLines { id: number; name: string; slug: string; productCount: number; lines: ProductLine[] }
export interface CategoryCrumb { id: number; name: string; slug: string }
export interface Category extends CategoryCrumb {
  parentId: number | null; path: string; depth: number; sortOrder: number; isActive: boolean;
  productCount: number; directProductCount: number; inStockCount: number; directInStockCount: number; lowStockCount: number;
  breadcrumb: CategoryCrumb[]; children: Category[];
}
/** Counts let the sidebar show a number that agrees with the result list in both stock modes. */
export interface Tag { id: number; name: string; productCount: number; inStockCount: number }
export interface ProductFilters { q: string; page: number; pageSize: number; isActive?: boolean; categorySlug?: string; includeDescendants?: boolean; tag?: string; inStock?: boolean; minPrice?: string; maxPrice?: string; sort?: string; brands?: string[]; lines?: string[] }
/** Facet endpoints take the same filters without paging; brand/line selections are excluded server side. */
export type FacetFilters = Omit<ProductFilters, 'page' | 'pageSize' | 'brands' | 'lines'>;

export interface InventoryMovement {
  id: number;
  productId: number;
  orderId: number | null;
  delta: number;
  reason: string;
  createdByUserId: number | null;
  createdByEmail: string | null;
  createdAt: string;
}

export interface OrderItem {
  primaryCategoryName?: string | null;
  id: number;
  productId: number;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export type PaymentStatus = 'Unpaid' | 'Pending' | 'Paid' | 'Failed' | 'Refunded';
export type PaymentMethod = 'CashOnDelivery' | 'Card' | 'MobileFinancialService';
export type DiscountType = 'Percentage' | 'FixedAmount';

export interface Order {
  currency?: string;
  id: number;
  customerId: number;
  customerName: string | null;
  status: OrderStatus;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
  idempotencyKey: string | null;
  items: OrderItem[];
  subTotal?: number;
  discountAmount?: number;
  couponCode?: string | null;
  giftCardCode?: string | null;
  giftCardAmount?: number;
  shippingAmount?: number;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  trackingNumber?: string | null;
  carrier?: string | null;
  deliveryAddressJson?: string | null;
  deliveryInstructions?: string | null;
}

export interface Invoice {
  currency?: string;
  orderId: number;
  orderDate: string;
  status: string;
  customerName: string;
  customerEmail: string;
  lines: OrderItem[];
  subtotal: number;
  total: number;
  discountAmount?: number;
  couponCode?: string | null;
  giftCardAmount?: number;
  giftCardCode?: string | null;
  shippingAmount?: number;
}

export interface SalesByStatus {
  status: string;
  orderCount: number;
  revenue: number;
  percentage: number;
}

export interface SalesSummary {
  orderValue?: number;
  collectedPayments?: number;
  refundedPayments?: number;
  outstandingCod?: number;
  giftCreditUsed?: number;
  giftCreditRestored?: number;
  currency?: string;
  from: string;
  to: string;
  totalOrders: number;
  totalRevenue: number;
  byStatus: SalesByStatus[];
}

export interface AdminUser {
  id: number;
  email: string;
  role: UserRole;
  isActive: boolean;
  customerId: number | null;
  createdAt: string;
}

export interface AuditLogEntry {
  id: number;
  userId: number | null;
  userEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  details: string | null;
}

export interface Settings {
  lowStockThreshold: number;
}

// ------------------------------------------------------------------ account area

export type NotificationType = 'OrderPlaced' | 'OrderStatusChanged' | 'OrderCancelled' | 'NewOrder' | 'LowStock';

export interface Notification {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
}

export interface Address {
  countryCode?: string;
  recipientName?: string | null;
  company?: string | null;
  addressLine2?: string | null;
  landmark?: string | null;
  postalCode?: string | null;
  deliveryInstructions?: string | null;
  id: number;
  label: string;
  division: string;
  district: string;
  upazila: string;
  addressLine: string;
  phone: string | null;
  isDefault: boolean;
}

/** Email is the login identity, so the API never accepts a change to it. */
export interface Profile {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  createdAt: string;
  addresses: Address[];
}

export interface DashboardStatusCount {
  status: string;
  count: number;
}

export interface DashboardOrder {
  id: number;
  status: OrderStatus;
  totalAmount: number;
  currency: string;
  createdAt: string;
  itemCount: number;
}

export interface Dashboard {
  spendingByCurrency?: { currency: string; amount: number }[];
  totalOrders: number;
  ordersByStatus: DashboardStatusCount[];
  totalSpent: number;
  currency: string;
  totalItems: number;
  recentOrders: DashboardOrder[];
  recentNotifications: Notification[];
  unreadNotifications: number;
}

export type BulkProductAction =
  | 'set-category' | 'add-tags' | 'remove-tags' | 'activate' | 'deactivate' | 'assign-brand';

export interface BulkItemResult {
  id: number;
  sku: string | null;
  name: string | null;
  result: 'updated' | 'skipped' | 'failed';
  reason: string | null;
}

export interface BulkProductResult {
  action: string;
  requested: number;
  updated: number;
  skipped: number;
  failed: number;
  items: BulkItemResult[];
}

/** RFC 7807 problem, extended with the fields this API always adds. */
export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  code?: string;
  correlationId?: string;
  errors?: Record<string, string[]>;
  shortItems?: ShortItem[];
  currentStatus?: string;
  attemptedStatus?: string;
}

export interface ShortItem {
  productId: number;
  sku: string;
  name: string;
  requested: number;
  available: number;
}


export type CouponTargetType = 'Order' | 'Category' | 'Brand' | 'Product';

/** What a scope rule can point at. Mirrors the server's ScopeAttribute. */
export type ScopeAttribute = 'Category' | 'Brand' | 'ProductLine' | 'Tag' | 'Product';
export type ScopePolarity = 'Is' | 'IsNot';
export type ScopeMatch = 'Any' | 'All';
export type DiscountExclusivity = 'BestOnly' | 'StackByScope' | 'Exclusive';
export type PreviewValueBasis = 'OrderHistory' | 'AverageProductPrice' | 'NotEstimated';

/** Where a coupon sits in the second-signature queue. Mirrors the server's CouponApprovalState. */
export type CouponApprovalState = 'NotRequired' | 'Pending' | 'Approved' | 'Rejected';

/** A rule exactly as the builder holds it: ids only, names resolved for display. */
export interface CouponScopeRuleDraft {
  attribute: ScopeAttribute;
  polarity: ScopePolarity;
  entityIds: number[];
}

export interface CouponScopeRuleView extends CouponScopeRuleDraft {
  entityNames: string[];
}

export interface Coupon {
  id: number;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  minOrderAmount: number;
  maxDiscountCap?: number | null;
  targetType?: CouponTargetType;
  targetId?: number | null;
  startsAt?: string | null;
  expiresAt: string | null;
  usageLimit: number | null;
  usageCount: number;
  isActive: boolean;
  isAutomatic?: boolean;
  campaignTitle?: string | null;
  isBannerPromoted?: boolean;
  minEligibleAmount?: number;
  scopeMatch?: ScopeMatch;
  exclusivity?: DiscountExclusivity;
  scopeRules?: CouponScopeRuleView[];
  approvalState?: CouponApprovalState;
  submittedByEmail?: string | null;
  reviewedByEmail?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
}

export interface CouponValidationResult {
  isValid: boolean;
  reason: string | null;
  discountAmount: number;
  code: string | null;
  campaignTitle?: string | null;
  targetType?: CouponTargetType;
  maxDiscountCap?: number | null;
  eligibleAmount?: number;
  scopeSummary?: string | null;
  exclusivity?: DiscountExclusivity;
}

export interface ScopeConflict {
  code: string;
  campaignTitle?: string | null;
  overlappingProducts: number;
  isAutomatic: boolean;
}

export interface CouponScopePreview {
  totalActiveProducts: number;
  matchedProducts: number;
  matchedUnits: number;
  exposedStockValue: number;
  averageQualifyingValue: number;
  valueBasis: PreviewValueBasis;
  forecastDiscount: number;
  sampleProducts: string[];
  conflicts: ScopeConflict[];
}

export interface CouponScopePreviewRequest {
  scopeRules: CouponScopeRuleDraft[];
  scopeMatch: ScopeMatch;
  discountType: DiscountType;
  discountValue: number;
  maxDiscountCap?: number | null;
  minEligibleAmount?: number;
}

export interface CreateCouponPayload {
  code: string;
  discountType: DiscountType;
  discountValue: number;
  minOrderAmount: number;
  maxDiscountCap?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  usageLimit?: number | null;
  isAutomatic?: boolean;
  campaignTitle?: string | null;
  isBannerPromoted?: boolean;
  minEligibleAmount?: number;
  scopeMatch?: ScopeMatch;
  exclusivity?: DiscountExclusivity;
  scopeRules?: CouponScopeRuleDraft[];
}

/** Scope fields are optional on an edit: leaving them out tells the server to keep what is stored. */
export interface UpdateCouponPayload {
  discountValue: number;
  minOrderAmount: number;
  maxDiscountCap?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  usageLimit?: number | null;
  isAutomatic?: boolean;
  campaignTitle?: string | null;
  isBannerPromoted?: boolean;
  minEligibleAmount?: number;
  scopeMatch?: ScopeMatch;
  exclusivity?: DiscountExclusivity;
  scopeRules?: CouponScopeRuleDraft[];
}

/** The store's own limits on giving money away. Every field is 0 when the shop has not set it, meaning "no limit". */
export interface DiscountPolicy {
  maxPercentageOff: number;
  maxAmountPerOrder: number;
  maxShareOfOrder: number;
  weeklySpendCap: number;
  approvalAbovePercentage: number;
  approvalAboveAmount: number;
}

/** The limits plus what the giveaway actually cost in the last seven days. */
export interface DiscountPolicyView {
  policy: DiscountPolicy;
  promoSpendLast7Days: number;
}

/** A coupon's scope and money, sent to be replayed against the shop's own past orders. */
export interface CouponOrderReplayRequest {
  scopeRules?: CouponScopeRuleDraft[] | null;
  scopeMatch: ScopeMatch;
  targetType?: CouponTargetType;
  targetId?: number | null;
  discountType: DiscountType;
  discountValue: number;
  maxDiscountCap?: number | null;
  minOrderAmount: number;
  minEligibleAmount?: number;
  days: number;
}

export interface ReplayProductImpact {
  productName: string;
  timesDiscounted: number;
  units: number;
  giveaway: number;
}

export interface CouponOrderReplayResult {
  daysLookedBack: number;
  ordersInWindow: number;
  ordersQualified: number;
  totalGiveaway: number;
  averageGiveawayPerOrder: number;
  shareOfOrderValuePercent: number;
  actualGiveawayInWindow: number;
  hasOrders: boolean;
  topProducts: ReplayProductImpact[];
  notes: string[];
}

export interface PaymentTransaction {
  redirectUrl?: string | null;
  id: number;
  orderId: number;
  amount: number;
  currency: string;
  provider: PaymentMethod;
  transactionReference: string;
  status: PaymentStatus;
  createdAt: string;
}

export interface ProductReview {
  merchantResponse?: string | null;
  id: number;
  productId: number;
  customerId: number;
  customerName: string;
  rating: number;
  comment: string | null;
  isVerifiedBuyer: boolean;
  createdAt: string;
}

export interface ProductRatingSummary {
  averageRating: number;
  totalReviews: number;
  recentReviews: ProductReview[];
}

export interface WishlistItem {
  id: number;
  productId: number;
  productName: string;
  sku: string;
  price: number;
  imageUrl: string | null;
  inStock: boolean;
  addedAt: string;
}

export interface ForgotPasswordResponse {
  message: string;
}


export interface GiftCard {
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
}

export interface CreateGiftCardInput {
  initialBalance: number;
  code?: string;
  recipientEmail?: string;
  recipientName?: string;
  note?: string;
  expiresAt?: string | null;
}

export interface AdjustGiftCardBalanceInput {
  newBalance: number;
  reason?: string;
}

export interface ValidateGiftCardResult {
  isValid: boolean;
  code: string | null;
  currentBalance: number;
  currency: string;
  recipientName: string | null;
  reason: string | null;
}


export interface EvaluateCartPromotionsRequest {
  subTotal: number;
  items?: { productId: number; quantity: number; unitPrice: number; categoryId?: number | null; brandId?: number | null }[];
  manualCouponCode?: string | null;
}

export interface CartPromotionsEvaluationResult {
  automaticDiscount: CouponValidationResult | null;
  manualDiscount: CouponValidationResult | null;
  effectiveDiscount: CouponValidationResult | null;
  totalDiscountAmount: number;
  activeCampaignHeadline: string | null;
  freeShippingThreshold: number;
  qualifiesForFreeShipping: boolean;
  amountNeededForFreeShipping: number;
  appliedDiscounts?: CouponValidationResult[] | null;
}
