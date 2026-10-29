import { t, useLanguage } from '../i18n/language';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useOrder, useOrderAction, useOrders } from '../api/hooks';
import type { Order, OrderStatus } from '../api/types';
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

const STATUS_FILTERS: (OrderStatus | '')[] = ['', 'Pending', 'Confirmed', 'Shipped', 'Rejected', 'Cancelled'];

/**
 * Status timeline. A cancelled or rejected order is shown as its own terminal step rather than
 * pretending it passed through Confirmed/Shipped.
 */
export function OrderTimeline({ order }: { order: Order }) {
  useLanguage();
  const happyPath: OrderStatus[] = ['Pending', 'Confirmed', 'Shipped'];

  if (order.status === 'Rejected' || order.status === 'Cancelled') {
    return (
      <ul className="timeline" aria-label={t("Order status timeline")}>
        <li data-done={true}>
          <span aria-hidden="true">{t("◔")}</span> {t(" Pending")}</li>
        <li data-failed={true}>
          <span aria-hidden="true">{t(orderStatusMeta[order.status].glyph)}</span> {t(orderStatusMeta[order.status].label)}
        </li>
      </ul>
    );
  }

  const reachedIndex = happyPath.indexOf(order.status);

  return (
    <ul className="timeline" aria-label={t("Order status timeline")}>
      {happyPath.map((status, index) => (
        <li key={status} data-done={index <= reachedIndex} aria-current={index === reachedIndex ? 'step' : undefined}>
          <span aria-hidden="true">{t(orderStatusMeta[status].glyph)}</span> {t(status)}
        </li>
      ))}
    </ul>
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
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [page, setPage] = useState(1);

  const ordersQuery = useOrders({ status, page, pageSize: 10 });

  return (
    <div className="page container">
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
              setStatus(event.target.value as OrderStatus | '');
              setPage(1);
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
    </div>
  );
}

export function OrderDetailPage() {
  useLanguage();
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, hasRole } = useAuth();
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
            {t("Placed ")}{t(formatDateTime(order.createdAt))} {t(" · last updated ")}{t(formatDateTime(order.updatedAt))}
          </p>
        </div>
        <div className="row">
          <StatusBadge status={order.status} />
          <Link className="btn btn--sm" to={`/orders/${order.id}/invoice`}>
            {t("Printable invoice")}</Link>
        </div>
      </header>

      <OrderTimeline order={order} />
      <p className="muted">{t(orderStatusMeta[order.status].description)}</p>

      <section className="table-surface" aria-labelledby="order-lines-heading">
        <div className="table-scroll">
          <table>
            <caption id="order-lines-heading">{t("Order lines")}</caption>
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
                    {t(item.name)} <span className="mono muted">{t(item.sku)}</span>
                  </td>
                  <td className="num">{t(item.quantity)}</td>
                  <td className="num">{t(formatMoney(item.unitPrice, order.currency))}</td>
                  <td className="num">{t(formatMoney(item.lineTotal, order.currency))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
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

      <div className="row">
        <button type="button" className="btn btn--ghost" onClick={() => navigate(-1)}>
          {t("Back")}</button>

        {cancellable ? (
          <button type="button" className="btn btn--danger" onClick={cancel} disabled={action.isPending}>
            {t(action.isPending ? 'Cancelling…' : 'Cancel order')}
          </button>
        ) : (
          <span className="muted">
            {t(order.status === 'Shipped'
              ? 'Shipped orders cannot be cancelled.'
              : 'This order cannot be cancelled by you.')}
          </span>
        )}
      </div>
    </div>
  );
}
