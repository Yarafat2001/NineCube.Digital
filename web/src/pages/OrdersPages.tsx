import { apiRequest } from '../api/client';
import { OrderAftercare } from '../components/OrderAftercare';
import { PaymentOutcomeBanner } from '../components/PaymentOutcomeBanner';
import { t, useLanguage } from '../i18n/language';
import { useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useOrder, useOrderAction, useOrders } from '../api/hooks';
import type { Product, Order, OrderStatus } from '../api/types';
import {
  EmptyState,
  ErrorState,
  LiveRegion,
  LoadingBlock,
  Pager,
  StatusBadge,
  useToast
} from '../components/ui';
import { formatDateTime, formatMoney, orderStatusMeta } from '../lib/helpers';
import { useAuth } from '../state/AuthContext';
import { useCart } from '../state/CartContext';
import { PaymentActions } from '../components/PaymentActions';
import { DeliveryManagement } from '../components/DeliveryManagement';
import { AccountSection } from '../components/AccountNav';
import { RequireRole } from '../components/guards';

const STATUS_FILTERS: (OrderStatus | '')[] = ['', 'Pending', 'Confirmed', 'Shipped', 'Delivered', 'DeliveryFailed', 'Rejected', 'Cancelled'];

/**
 * Status timeline. A cancelled or rejected order is shown as its own terminal step rather than
 * pretending it passed through Confirmed/Shipped.
 */
export function OrderTimeline({ order }: { order: Order }) {
  useLanguage();
  const happyPath: OrderStatus[] = ['Pending', 'Confirmed', 'Shipped', 'Delivered'];

  if (order.status === 'Rejected' || order.status === 'Cancelled') {
    return (
      <ul className="timeline" aria-label={t("Order status timeline")}>
        <li data-done={true}>
          <span aria-hidden="true">{t("â—”")}</span> {t(" Pending")}</li>
        <li data-failed={true}>
          <span aria-hidden="true">{t(orderStatusMeta[order.status].glyph)}</span> {t(orderStatusMeta[order.status].label)}
        </li>
      </ul>
    );
  }

  const reachedIndex = order.status === 'DeliveryFailed' ? 2 : happyPath.indexOf(order.status);
  const createdDate = order.createdAt ? new Date(order.createdAt) : new Date();
  const estDeliveryMin = new Date(createdDate.getTime() + 2 * 24 * 60 * 60 * 1000);
  const estDeliveryMax = new Date(createdDate.getTime() + 4 * 24 * 60 * 60 * 1000);
  const estDateStr = `${estDeliveryMin.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} â€“ ${estDeliveryMax.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <div className="order-timeline-wrap">
      <ul className="timeline" aria-label={t("Order status timeline")}>
        {happyPath.map((status, index) => (
          <li key={status} data-done={index <= reachedIndex} aria-current={index === reachedIndex ? 'step' : undefined}>
            <span aria-hidden="true">{t(orderStatusMeta[status].glyph)}</span> {t(status)}
          </li>
        ))}
      </ul>
      <div className="order-delivery-est card-glass" aria-label={t("Estimated Delivery")}>
        <span aria-hidden="true">ðŸšš</span>
        <span>{t("Estimated Delivery:")} <strong>{estDateStr}</strong> ({t("Standard Fulfillment")})</span>

      </div>
    </div>
  );
}

/**
 * Mirrors the server rule: an owner may cancel while Pending/Confirmed, staff may cancel any order
 * that has not shipped. Note the id spaces: Order.customerId is a Customer id, which is NOT the
 * same as the logged-in User id.
 */
export function canCustomerCancel(order: Order, role: string | undefined, customerId: number | null | undefined): boolean {
  if (order.status !== 'Pending' && order.status !== 'Confirmed') return false;
  if (role === 'Staff') return true;
  return role === 'Customer' && customerId != null && order.customerId === customerId;
}

export function MyOrdersPage() {
  useLanguage();
  const navigate = useNavigate();

  const { reorder: handleReorder, busy: reordering } = useReorder();
  // The status lives in the URL so the account hub's status shortcuts, a shared link and the
  // browser back button all agree with the filter select.
  const [params, setParams] = useSearchParams();
  const requested = params.get('status') as OrderStatus | '' | null;
  const status: OrderStatus | '' = requested && STATUS_FILTERS.includes(requested) ? requested : '';
  const [page, setPage] = useState(1);

  const changeStatus = (next: OrderStatus | '') => {
    setPage(1);
    setParams(next ? { status: next } : {}, { replace: true });
  };

  const ordersQuery = useOrders({ status, page, pageSize: 10 });

  return (
    <div className="page container">
      <AccountSection>
      <header className="page-header">
        <div>
          <h1>{t("My orders")}</h1>
          <p>{t("Every order you have placed, with its current status and the printable invoice.")}</p>
        </div>

        <div className="field">
          <label htmlFor="order-status-filter">{t("Filter by status")}</label>
          <select
            id="order-status-filter"
            value={status}
            onChange={(event) => {
              changeStatus(event.target.value as OrderStatus | '');
            }}
          >
            {STATUS_FILTERS.map((value) => (
              <option key={value || 'all'} value={value}>
                {t(value === '' ? 'All statuses' : value)}
              </option>
            ))}
          </select>
        </div>
      </header>

      <LiveRegion
        message={
          t(ordersQuery.data
            ? `${ordersQuery.data.totalCount} order${ordersQuery.data.totalCount === 1 ? '' : 's'} found.`
            : 'Loading orders')
        }
      />

      {ordersQuery.isLoading ? <LoadingBlock label={t("Loading your orders")} variant="tile" count={4} /> : null}

      {ordersQuery.isError ? <ErrorState error={ordersQuery.error} onRetry={() => ordersQuery.refetch()} /> : null}

      {ordersQuery.data && ordersQuery.data.items.length === 0 ? (
        <EmptyState
          title={t("No orders yet")}
          description={t("Orders you place will appear here with their live status.")}
          action={
            <Link className="btn btn--primary" to="/products">
              {t("Browse products")}</Link>
          }
        />
      ) : null}

      {ordersQuery.data && ordersQuery.data.items.length > 0 ? (
        <div className="table-surface">
          <div className="table-scroll">
            <table>
              <caption className="visually-hidden">{t("Your orders")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("Order")}</th>
                  <th scope="col">{t("Placed")}</th>
                  <th scope="col">{t("Items")}</th>
                  <th scope="col" className="num">
                    {t("Total")}</th>
                  <th scope="col">{t("Status")}</th>
                  <th scope="col">{t("Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {ordersQuery.data.items.map((order) => (
                  <tr key={order.id}>
                    <td className="mono nowrap">{t(`#${order.id}`)}</td>
                    <td className="nowrap">{t(formatDateTime(order.createdAt))}</td>
                    <td>{t(order.items.reduce((sum, item) => sum + item.quantity, 0))}</td>
                    <td className="num">{t(formatMoney(order.totalAmount, order.currency))}</td>
                    <td>
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="actions">
                      <div className="row" style={{ gap: 'var(--space-2)' }}>
                        <button
                          type="button"
                          className="btn btn--sm"
                          onClick={() => navigate(`/orders/${order.id}`)}
                        >
                          {t("View")}</button>
                        <button
                          type="button"
                          className="btn btn--sm btn--outline"
                          disabled={reordering}
                          onClick={() => void handleReorder(order)}
                          title={t("Add all items back to cart")}
                        >
                          ðŸ”„ {t("Buy again")}</button>
                        <Link className="link-button" to={`/orders/${order.id}/invoice`}>
                          {t("Invoice")}</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pager
            page={ordersQuery.data.page}
            totalPages={ordersQuery.data.totalPages}
            totalCount={ordersQuery.data.totalCount}
            pageSize={ordersQuery.data.pageSize}
            onPageChange={setPage}
          />
        </div>
      ) : null}
      </AccountSection>
    </div>
  );
}

export function OrderDetailPage() {
  useLanguage();
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, hasRole } = useAuth();

  const { reorder: handleReorder, busy: reordering } = useReorder();
  const orderId = Number(id);
  const orderQuery = useOrder(Number.isFinite(orderId) ? orderId : null);
  const action = useOrderAction();

  const cancel = async () => {
    try {
      await action.mutateAsync({ orderId, action: 'cancel' });
      toast.push('success', `Order #${orderId} cancelled and the stock released.`);
    } catch (caught) {
      toast.pushError(caught);
    }
  };

  if (orderQuery.isLoading) return <div className="page container"><LoadingBlock label={t("Loading the order")} variant="tile" count={3} /></div>;

  if (orderQuery.isError) {
    return (
      <div className="page container">
        <ErrorState error={orderQuery.error} onRetry={() => orderQuery.refetch()} />
        <p>
          <Link to={hasRole('Customer') ? '/orders' : '/staff'}>{t("Back to orders")}</Link>
        </p>
      </div>
    );
  }

  const order = orderQuery.data;
  if (!order) return null;

  const cancellable = canCustomerCancel(order, user?.role, user?.customerId);

  return (
    <div className="page container">
      <header className="page-header">
        <div>
          <h1>{t("Order #")}{t(order.id)}</h1>
          <p>
            {t("Placed ")}{t(formatDateTime(order.createdAt))} {t("· last updated")} {t(formatDateTime(order.updatedAt))}
          </p>
        </div>
        <div className="row">
          <StatusBadge status={order.status} />
          <Link className="btn btn--sm" to={`/orders/${order.id}/invoice`}>
            {t("Printable invoice")}</Link>
        </div>
      </header>

      <PaymentOutcomeBanner />
      <OrderTimeline order={order} />
      <DeliveryManagement order={order} />
      <OrderAftercare order={order} />
      <Link to={`/help?order=${order.id}`}>{t('Get help with this order')}</Link>
      {hasRole('Customer') ? <PaymentActions order={order} /> : null}
      <p className="muted">{t(orderStatusMeta[order.status].description)}</p>

      {/* Payment & Delivery Metadata Tiles */}
      <div className="grid-tiles" style={{ margin: 'var(--space-5) 0' }}>
        <div className="card-glass" style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md, 8px)' }}>
          <span className="muted" style={{ fontSize: 'var(--text-xs)', display: 'block' }}>{t("Payment Method")}</span>
          <strong style={{ fontSize: 'var(--text-sm)' }}>
            {order.paymentMethod === 'Card' ? `ðŸ’³ ${t("Card")}` : order.paymentMethod === 'MobileFinancialService' ? `ðŸ“± ${t("Mobile Banking (bKash/Nagad)")}` : `ðŸ’µ ${t("Cash on Delivery")}`}
          </strong>
        </div>

        <div className="card-glass" style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md, 8px)' }}>
          <span className="muted" style={{ fontSize: 'var(--text-xs)', display: 'block' }}>{t("Payment Status")}</span>
          <span className={`badge ${order.paymentStatus === 'Paid' ? 'badge--ok' : order.paymentStatus === 'Pending' ? 'badge--warn' : 'badge--neutral'}`} style={{ fontSize: 'var(--text-xs)', marginTop: '2px' }}>
            {t(order.paymentStatus ?? 'Unpaid')}
          </span>
        </div>

        {order.couponCode ? (
          <div className="card-glass" style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md, 8px)' }}>
            <span className="muted" style={{ fontSize: 'var(--text-xs)', display: 'block' }}>{t("Coupon Applied")}</span>
            <span style={{ color: 'var(--ok, #10b981)', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
              {order.couponCode} (-{formatMoney(order.discountAmount ?? 0, order.currency)})
            </span>
          </div>
        ) : null}

        {order.trackingNumber ? (
          <div className="card-glass" style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md, 8px)' }}>
            <span className="muted" style={{ fontSize: 'var(--text-xs)', display: 'block' }}>{t("Shipment Tracking")}</span>
            <strong style={{ fontSize: 'var(--text-sm)' }}>
              {order.carrier ? `${order.carrier}: ` : ''}{order.trackingNumber}
            </strong>
          </div>
        ) : null}
      </div>

      <h2 style={{ fontSize: 'var(--text-lg)', margin: 'var(--space-6) 0 var(--space-3)' }}>{t("Order lines")}</h2>

      <section className="table-surface" aria-label={t("Order lines")}>
        <div className="table-scroll">
          <table>
            <caption className="visually-hidden">{t("Order lines")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("Product")}</th>
                <th scope="col" className="num">
                  {t("Quantity")}</th>
                <th scope="col" className="num">
                  {t("Unit price")}</th>
                <th scope="col" className="num">
                  {t("Line total")}</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{t(item.name)}</div>
                    <small className="mono muted" style={{ fontSize: 'var(--text-xs)' }}>{t(item.sku)}</small>
                  </td>
                  <td className="num">{t(item.quantity)}</td>
                  <td className="num">{t(formatMoney(item.unitPrice, order.currency))}</td>
                  <td className="num">{t(formatMoney(item.lineTotal, order.currency))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {((order.discountAmount && order.discountAmount > 0) || (order.giftCardAmount && order.giftCardAmount > 0) || (order.shippingAmount !== undefined && order.shippingAmount > 0)) ? (
                <>
                  <tr>
                    <th scope="row" colSpan={3}>{t("Subtotal")}</th>
                    <td className="num">{t(formatMoney(order.subTotal ?? order.items.reduce((sum, item) => sum + item.lineTotal, 0), order.currency))}</td>
                  </tr>
                  {order.discountAmount && order.discountAmount > 0 ? (
                    <tr>
                      <th scope="row" colSpan={3}>{t("Discount")} {order.couponCode ? `(${order.couponCode})` : ''}</th>
                      <td className="num" style={{ color: 'var(--ok, #10b981)' }}>-{t(formatMoney(order.discountAmount, order.currency))}</td>
                    </tr>
                  ) : null}
                  {order.giftCardAmount && order.giftCardAmount > 0 ? (
                    <tr>
                      <th scope="row" colSpan={3}>{t("Gift Card")} {order.giftCardCode ? `(${order.giftCardCode})` : ''}</th>
                      <td className="num" style={{ color: 'var(--accent, #6366f1)' }}>-{t(formatMoney(order.giftCardAmount, order.currency))}</td>
                    </tr>
                  ) : null}
                  {order.shippingAmount !== undefined && order.shippingAmount > 0 ? (
                    <tr>
                      <th scope="row" colSpan={3}>{t("Delivery Fee")}</th>
                      <td className="num">{t(formatMoney(order.shippingAmount, order.currency))}</td>
                    </tr>
                  ) : null}
                </>
              ) : null}
              <tr>
                <th scope="row" colSpan={3}>
                  {t("Total")}</th>
                <td className="num">
                  <strong>{t(formatMoney(order.totalAmount, order.currency))}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <div className="row-between" style={{ marginTop: 'var(--space-6)', alignItems: 'center' }}>
        <button type="button" className="btn" onClick={() => navigate(-1)}>
          â† {t("Back")}
        </button>

        <div className="row" style={{ gap: 'var(--space-2)' }}>
          {hasRole('Customer') ? (
            <button
              type="button"
              className="btn btn--primary"
              disabled={reordering}
                          onClick={() => void handleReorder(order)}
            >
              ðŸ”„ {t("Buy again")}
            </button>
          ) : null}
          {cancellable ? (
            <button type="button" className="btn btn--danger" onClick={cancel} disabled={action.isPending}>
            {t(action.isPending ? 'Cancellingâ€¦' : 'Cancel order')}
          </button>
        ) : (hasRole('Customer') || order.status === 'Shipped') ? (
          <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
            {t(order.status === 'Shipped'
              ? 'Shipped orders cannot be cancelled.'
              : 'This order cannot be cancelled by you.')}
          </span>
        ) : null}
        </div>
      </div>
    </div>
  );
}
/**
 * Guest orders are claimed on a guest session, not a user account, so the marker check must run
 * before the role guard: an unauthenticated guest would otherwise bounce to /login.
 */
export function OrderDetailRoute() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();

  if (sessionStorage.getItem(`ninecube.guest.order.${id}`)) {
    const payment = searchParams.get('payment');
    return <Navigate replace to={`/guest/orders/${id}${payment ? `?payment=${encodeURIComponent(payment)}` : ''}`} />;
  }

  return (
    <RequireRole roles={['Customer', 'Staff', 'Administrator']}>
      <OrderDetailPage />
    </RequireRole>
  );
}


function useReorder() {
  const cart = useCart(); const toast = useToast(); const guard = useRef(false); const [busy, setBusy] = useState(false);
  const reorder = async (order: Order) => {
    if (guard.current) return;
    guard.current = true; setBusy(true);
    try {
      const results = await Promise.allSettled(order.items.map(async item => ({ item, product: await apiRequest<Product>(`/api/products/${item.productId}`) })));
      let added = 0; let skipped = 0;
      for (const result of results) {
        if (result.status === 'rejected') { skipped++; continue; }
        const { item, product } = result.value;
        const existing = cart.lines.find(l => l.productId === product.id)?.quantity ?? 0;
        const quantity = Math.max(0, Math.min(item.quantity, product.stockQuantity - existing, 1000 - existing));
        if (!product.isActive || product.hasVariants || !quantity) { skipped++; continue; }
        cart.add(product, quantity); added += quantity;
        if (quantity < item.quantity) skipped++;
      }
      toast.push(added ? 'success' : 'info', added ? t('Available items added at current prices.') : t('These items are currently unavailable.'));
      if (skipped) toast.push('info', t('Some items or quantities are unavailable and were skipped.'));
      if (added) document.dispatchEvent(new CustomEvent('ninecube:open-cart-sheet'));
    } finally { guard.current = false; setBusy(false); }
  };
  return { reorder, busy };
}
