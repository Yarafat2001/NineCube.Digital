import { t, useLanguage } from '../i18n/language';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { Icon } from '../components/Icon';
import { SalesCharts } from '../components/SalesCharts';
import { CategoryManager } from '../components/CategoryManager';
import { useInvoice, useOrderAction, useOrders, useSalesSummary } from '../api/hooks';
import type { Order, OrderStatus } from '../api/types';
import {
  EmptyState,
  ErrorState,
  LiveRegion,
  LoadingBlock,
  Pager,
  Modal,
  StatusBadge,
  useToast
} from '../components/ui';
import { defaultReportRange, formatDateTime, formatMoney } from '../lib/helpers';
import { useAuth } from '../state/AuthContext';
import { OrderTimeline, canCustomerCancel } from './OrdersPages';

type OrderAction = 'confirm' | 'reject' | 'ship' | 'cancel';
const ORDER_ACTION_LABELS: Record<OrderAction, string> = { confirm: 'Confirm order', reject: 'Reject order', ship: 'Mark as shipped', cancel: 'Cancel order' };

const STATUS_FILTERS: (OrderStatus | '')[] = ['', 'Pending', 'Confirmed', 'Shipped', 'Rejected', 'Cancelled'];
const pastTense = { confirm: 'confirmed', reject: 'rejected', ship: 'shipped', cancel: 'cancelled' } as const;

/** Staff console: view every order, move it through the lifecycle, and print an invoice. */
export function StaffPage() {
  useLanguage();
  const toast = useToast();
  const { user } = useAuth();
  const canManageOrders = user?.role === 'Staff';
  const [section, setSection] = useState<'orders' | 'categories'>('orders');
  const [queue, setQueue] = useState<'confirm' | 'ship' | 'invoices'>(canManageOrders ? 'confirm' : 'invoices');
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [page, setPage] = useState(1);

  const ordersQuery = useOrders({ status: queue === 'confirm' ? 'Pending' : queue === 'ship' ? 'Confirmed' : status, page, pageSize: 10 });
  const action = useOrderAction();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkAction, setBulkAction] = useState<OrderAction | ''>('');
  const [review, setReview] = useState<{ orders: Order[]; action: OrderAction } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [bulkResults, setBulkResults] = useState<{ id: number; ok: boolean; message: string }[]>([]);
  const bulkLock = useRef(false);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const visibleOrders = (ordersQuery.data?.items ?? []).filter(o => queue === 'invoices' || o.status === (queue === 'confirm' ? 'Pending' : 'Confirmed'));
  const selectable = !canManageOrders || queue === 'invoices' ? [] : visibleOrders;
  const selectedOrders = selectable.filter(o => selectedIds.includes(o.id));
  const allSelected = selectable.length > 0 && selectable.every(o => selectedIds.includes(o.id));
  const options: OrderAction[] = selectedOrders.length ? [
    ...(selectedOrders.every(o => o.status === 'Pending') ? ['confirm', 'reject'] as OrderAction[] : []),
    ...(selectedOrders.every(o => o.status === 'Confirmed') ? ['ship'] as OrderAction[] : []),
    ...(selectedOrders.every(o => canCustomerCancel(o, user?.role, user?.customerId)) ? ['cancel'] as OrderAction[] : [])
  ] : [];
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selectedOrders.length > 0 && !allSelected;
  }, [selectedOrders.length, allSelected]);
  useEffect(() => {
    if (!ordersQuery.data || bulkBusy) return;
    setSelectedIds(ids => ids.filter(id => ordersQuery.data.items.some(o => o.id === id && (o.status === 'Pending' || o.status === 'Confirmed'))));
  }, [ordersQuery.data, bulkBusy]);
  const clearSelection = () => { setSelectedIds([]); setBulkAction(''); };
  const changeQueue = (value: typeof queue) => { setQueue(value); setPage(1); setSelectedIds([]); setBulkAction(value === 'invoices' ? '' : value); setBulkResults([]); };
  const applyBulk = async () => {
    if (!canManageOrders || !review || bulkLock.current) return;
    bulkLock.current = true; setBulkBusy(true); setProgress(0); setBulkResults([]);
    const results: { id: number; ok: boolean; message: string }[] = [];
    try {
      for (const order of review.orders) {
        try { await action.mutateAsync({ orderId: order.id, action: review.action }); results.push({ id: order.id, ok: true, message: 'Updated' }); }
        catch (caught) { results.push({ id: order.id, ok: false, message: caught instanceof Error ? caught.message : 'Could not update this order.' }); }
        setProgress(results.length);
      }
      setBulkResults(results); setSelectedIds(results.filter(r => !r.ok).map(r => r.id)); setBulkAction(''); setReview(null);
    } finally { bulkLock.current = false; setBulkBusy(false); }
  };


  const run = async (orderId: number, verb: 'confirm' | 'reject' | 'ship' | 'cancel') => {
    if (!canManageOrders) return;
    try {
      await action.mutateAsync({ orderId, action: verb });
      // The API verb is not an English past participle: "shiped" and "cancel" are what a naive
      // concatenation put in front of the person processing the order.
      toast.push('success', `Order #${orderId} ${pastTense[verb]}.`);
    } catch (caught) {
      toast.pushError(caught);
    }
  };

  return (
    <div className="page container">
      <header className="page-header">
        <div>
          <h1>{t("Order console")}</h1>
        </div>

        <div className="staff-toolbar">
          <div className="field" hidden={queue !== 'invoices' || section !== 'orders'}>
            <label htmlFor="staff-status-filter">{t("Filter by status")}</label>
            <select
              id="staff-status-filter"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as OrderStatus | '');
                setPage(1); clearSelection();
              }}
            >
              {STATUS_FILTERS.map((value) => (
                <option key={value || 'all'} value={value}>
                  {t(value === '' ? 'All statuses' : value)}
                </option>
              ))}
            </select>
          </div>
          <Link className="btn" to="/staff/sales">
            {t("Sales summary")}</Link>
          <button type="button" className="btn" onClick={() => setSection('categories')}>{t("Manage categories")}</button>
        </div>
      </header>


      <nav className="staff-sections" aria-label={t("Staff sections")}>
        <button className={`btn ${section === 'orders' ? 'btn--primary' : ''}`} type="button" aria-pressed={section === 'orders'} onClick={() => setSection('orders')}>{t("Orders")}</button>
        <button className={`btn ${section === 'categories' ? 'btn--primary' : ''}`} type="button" aria-pressed={section === 'categories'} onClick={() => setSection('categories')}>{t("Categories & products")}</button>
      </nav>
      <div className="staff-orders stack" hidden={section !== 'orders'}>
      <LiveRegion
        message={t(ordersQuery.data ? `${ordersQuery.data.totalCount} orders match the current filter.` : 'Loading orders')}
      />

      {!canManageOrders && <p className="card-glass order-role-notice" role="note">{t("Administrator order access is read-only. Use a Staff account to confirm, reject, ship or cancel orders. Invoice viewing, sales reports and category management remain available.")}</p>}
      <nav className="order-queues" aria-label={t("Order queues")}>
        <button className="btn" type="button" aria-pressed={queue === 'confirm'} onClick={() => changeQueue('confirm')}>{t("To confirm")}</button>
        <button className="btn" type="button" aria-pressed={queue === 'ship'} onClick={() => changeQueue('ship')}>{t("To ship")}</button>
        <button className="btn" type="button" aria-pressed={queue === 'invoices'} onClick={() => changeQueue('invoices')}>{t("Invoices & history")}</button>
      </nav>
      {bulkResults.length > 0 && <section className="card-glass stack" aria-label={t("Bulk order results")}>
        <p role="status">{t(bulkResults.filter(r => r.ok).length)} {t(" updated; ")}{t(bulkResults.filter(r => !r.ok).length)} {t(" failed.")}</p>
        <ul>{bulkResults.map(r => <li key={r.id}>{t("Order #")}{t(r.id)}{t(": ")}{t(r.ok ? 'Updated' : r.message)}</li>)}</ul>
        <button className="btn btn--ghost btn--sm" type="button" onClick={() => setBulkResults([])}>{t("Dismiss results")}</button>
      </section>}
      {selectedOrders.length > 0 && <div className="order-bulkbar card-glass" aria-label={t("Bulk order actions")}>
        <strong role="status">{t(selectedOrders.length)} {t(" selected on this page")}</strong>
        <label htmlFor="bulk-order-action">{t("Action")}</label>
        <select id="bulk-order-action" value={options.includes(bulkAction as OrderAction) ? bulkAction : ''} disabled={bulkBusy} onChange={e => setBulkAction(e.target.value as OrderAction | '')}>
          <option value="">{t("Choose action")}</option>{options.map(verb => <option key={verb} value={verb}>{t(ORDER_ACTION_LABELS[verb])}</option>)}
        </select>
        <button className="btn btn--primary" type="button" disabled={bulkBusy || action.isPending || !options.includes(bulkAction as OrderAction)} onClick={() => setReview({orders: [...selectedOrders], action: bulkAction as OrderAction})}>{t("Review bulk update")}</button>
        <button className="btn btn--ghost" type="button" disabled={bulkBusy} onClick={clearSelection}>{t("Clear selection")}</button>
        <p className="muted">{t("Only actions valid for every selected order are available. Selection resets when you change the queue, page or status filter.")}</p>
      </div>}
      <Modal open={review !== null} title={t("Review bulk order update")} onClose={() => { if (!bulkBusy) setReview(null); }}>
        {review && <><p><strong>{t(ORDER_ACTION_LABELS[review.action])}</strong> {t(review.orders.length)} {t(" selected orders?")}</p>
          <ul>{review.orders.map(o => <li key={o.id}>{t("Order #")}{t(o.id)} {t(" - ")}{t(o.status)}</li>)}</ul>
          <p className="muted">{t("Each order is checked and updated individually. Orders that changed state will be reported as failures; successful updates remain applied.")}</p>
          {bulkBusy && <p role="status">{t("Processed ")}{t(progress)} {t(" of ")}{t(review.orders.length)}</p>}
          <button type="button" className={`btn ${review.action === 'cancel' || review.action === 'reject' ? 'btn--danger' : 'btn--primary'}`} disabled={bulkBusy} onClick={() => void applyBulk()}>{t(bulkBusy ? 'Updating orders...' : 'Apply bulk update')}</button>
          <button type="button" className="btn" disabled={bulkBusy} onClick={() => setReview(null)}>{t("Back")}</button>
        </>}
      </Modal>
      {ordersQuery.isLoading || ordersQuery.isPlaceholderData ? <LoadingBlock label={t("Loading orders")} variant="tile" count={5} /> : null}

      {ordersQuery.isError ? <ErrorState error={ordersQuery.error} onRetry={() => ordersQuery.refetch()} /> : null}

      {ordersQuery.data && !ordersQuery.isPlaceholderData && visibleOrders.length === 0 ? (
        <EmptyState title={t(queue === 'confirm' ? 'No orders awaiting confirmation' : queue === 'ship' ? 'No orders ready to ship' : 'No orders match this filter')} description={t("Choose another queue or status filter.")} />
      ) : null}

      {ordersQuery.data && !ordersQuery.isPlaceholderData && visibleOrders.length > 0 ? (
        <div className="table-surface">
          <div className="table-scroll">
            <table>
              <caption>{t(queue === 'confirm' ? 'Pending orders - confirm together' : queue === 'ship' ? 'Confirmed orders - mark as shipped together' : 'Invoices & order history')}</caption>
              <thead>
                <tr>
                  <th scope="col" hidden={queue === 'invoices' || !canManageOrders}><input ref={selectAllRef} type="checkbox" aria-label={t(queue === 'confirm' ? 'Select all pending orders on this page' : 'Select all confirmed orders on this page')} checked={allSelected} disabled={!selectable.length || bulkBusy || ordersQuery.isPlaceholderData} onChange={e => { setSelectedIds(e.target.checked ? selectable.map(o => o.id) : []); setBulkAction(queue === 'invoices' ? '' : queue); }} /></th>
                  <th scope="col">{t("Order")}</th>
                  <th scope="col">{t("Customer")}</th>
                  <th scope="col">{t("Placed")}</th>
                  <th scope="col" className="num">
                    {t("Total")}</th>
                  <th scope="col">{t("Current status")}</th>
                  <th scope="col" hidden={queue === 'invoices' || !canManageOrders}>{t("Update status")}</th>
                  <th scope="col">{t("Invoice")}</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => (
                  <tr key={order.id} data-selected={selectedIds.includes(order.id)}>
                    <td hidden={queue === 'invoices' || !canManageOrders}><input type="checkbox" aria-label={t(`Select order #${order.id}`)} checked={selectedIds.includes(order.id)} disabled={bulkBusy || ordersQuery.isPlaceholderData || (order.status !== 'Pending' && order.status !== 'Confirmed')} onChange={e => { setSelectedIds(ids => e.target.checked ? [...ids, order.id] : ids.filter(id => id !== order.id)); setBulkAction(queue === 'invoices' ? '' : queue); }} /></td>
                    <td className="mono nowrap">
                      <Link to={`/orders/${order.id}`}>{t("#")}{t(order.id)}</Link>
                    </td>
                    <td>{t(order.customerName ?? '—')}</td>
                    <td className="nowrap">{t(formatDateTime(order.createdAt))}</td>
                    <td className="num">{t(formatMoney(order.totalAmount, order.currency))}</td>
                    <td>
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="actions" hidden={queue === 'invoices' || !canManageOrders}>
                      <div className="row" style={{ gap: 'var(--space-2)' }}>
                        {canManageOrders && order.status === 'Pending' ? (
                          <>
                            <button
                              type="button"
                              className="btn btn--sm btn--primary"
                              onClick={() => run(order.id, 'confirm')}
                              disabled={action.isPending || bulkBusy}
                            >
                              {t("Confirm order")}</button>
                            <button
                              type="button"
                              className="btn btn--sm btn--danger"
                              onClick={() => run(order.id, 'reject')}
                              disabled={action.isPending || bulkBusy}
                            >
                              {t("Reject order")}</button>
                          </>
                        ) : null}

                        {canManageOrders && order.status === 'Confirmed' ? (
                          <button
                            type="button"
                            className="btn btn--sm btn--primary"
                            onClick={() => run(order.id, 'ship')}
                            disabled={action.isPending || bulkBusy}
                          >
                            {t("Mark as shipped")}</button>
                        ) : null}

                        {canCustomerCancel(order, user?.role, user?.customerId) ? (
                          <button
                            type="button"
                            className="btn btn--sm btn--danger"
                            onClick={() => run(order.id, 'cancel')}
                            disabled={action.isPending || bulkBusy}
                          >
                            {t("Cancel order")}</button>
                        ) : null}

                        {order.status === 'Shipped' ? <span className="order-closed-note"><Icon name="check" />{t("Shipping complete")}</span> : order.status === 'Cancelled' || order.status === 'Rejected' ? <span className="order-closed-note">{t("Order closed")}</span> : null}
                      </div>
                    </td>
                    <td><Link className="btn btn--sm" to={`/orders/${order.id}/invoice`} aria-label={t(`View invoice for order #${order.id}`)}>{t("View invoice")}</Link></td>
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
            onPageChange={value => { setPage(value); clearSelection(); }}
          />
        </div>
      ) : null}
      </div>
      {section === 'categories' ? <CategoryManager /> : null}
    </div>
  );
}

export function SalesSummaryPage() {
  useLanguage();
  const defaults = defaultReportRange();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [reportCurrency, setReportCurrency] = useState('BDT');
  const [submitted, setSubmitted] = useState({ ...defaults, currency: 'BDT' });

  const summary = useSalesSummary(
    new Date(`${submitted.from}T00:00:00`).toISOString(),
    new Date(`${submitted.to}T23:59:59`).toISOString(),
    true, submitted.currency
  );

  return (
    <div className="page container sales-page">
      <header className="page-header">
        <div>
          <h1>{t("Sales summary")}</h1>
          <p>{t("Read-only. Cancelled and rejected orders are listed but contribute no revenue.")}</p>
        </div>
        <Link className="btn" to="/staff">
          {t("Back to orders")}</Link>
      </header>

      <form
        className="card-glass grid-form sales-filters"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted({ from, to, currency: reportCurrency });
        }}
      >
        <div className="field">
          <label htmlFor="sales-from">{t("From")}</label>
          <input id="sales-from" type="date" required max={to || undefined} value={from} onChange={(event) => setFrom(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="sales-to">{t("To")}</label>
          <input id="sales-to" type="date" required min={from || undefined} value={to} onChange={(event) => setTo(event.target.value)} />
        </div>
        <div className="field"><label htmlFor="sales-currency">{t("Currency")}</label><select id="sales-currency" value={reportCurrency} onChange={e => setReportCurrency(e.target.value)}><option value="BDT">{t("BDT - Bangladesh taka")}</option><option value="USD">{t("USD - Legacy catalogue")}</option></select></div>
        <div className="field" style={{ justifyContent: 'flex-end' }}>
          <button type="submit" className="btn btn--primary">
            {t("Apply range")}</button>
        </div>
      </form>

      {summary.isLoading ? <LoadingBlock label={t("Loading the sales summary")} variant="tile" count={3} /> : null}
      {summary.isError ? <ErrorState error={summary.error} onRetry={() => summary.refetch()} /> : null}

      {summary.data ? (
        <>
          <LiveRegion
            message={t(`${summary.data.totalOrders} orders and ${formatMoney(summary.data.totalRevenue, summary.data.currency)} revenue between ${submitted.from} and ${submitted.to}.`)}
          />

          <div className="grid-tiles sales-stats">
            <div className="stat-tile card-glass">
              <span className="stat-icon" data-tone="info"><Icon name="box" /></span>
              <div className="stat-tile__label">{t("Orders")}</div>
              <div className="stat-tile__value">{t(summary.data.totalOrders)}</div>
              <p className="muted">{t("Across all order statuses")}</p>
            </div>
            <div className="stat-tile card-glass">
              <span className="stat-icon" data-tone="ok"><Icon name="wallet" /></span>
              <div className="stat-tile__label">{t("Revenue (standing orders)")}</div>
              <div className="stat-tile__value">{t(formatMoney(summary.data.totalRevenue, summary.data.currency))}</div>
              <p className="muted">{t("Cancelled and rejected orders excluded")}</p>
            </div>
            <div className="stat-tile card-glass">
              <span className="stat-icon" data-tone="warn"><Icon name="clock" /></span>
              <div className="stat-tile__label">{t("Range")}</div>
              <div className="stat-tile__value" style={{ fontSize: 'var(--text-base)' }}>
                {t(submitted.from)} {t(" → ")}{t(submitted.to)}
              </div>
              <p className="muted">{t("Selected reporting window")}</p>
            </div>
          </div>

          <SalesCharts data={summary.data} />
          <div className="table-surface">
            <div className="table-scroll">
              <table>
                <caption>{t("By status")}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t("Status")}</th>
                    <th scope="col" className="num">
                      {t("Orders")}</th>
                    <th scope="col" className="num">
                      {t("Revenue")}</th>
                    <th scope="col" className="num">
                      {t("Share")}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.data.byStatus.map((row) => (
                    <tr key={row.status}>
                      <td><StatusBadge status={row.status as OrderStatus} /></td>
                      <td className="num">{t(row.orderCount)}</td>
                      <td className="num">{t(formatMoney(row.revenue, summary.data.currency))}</td>
                      <td className="num">{t(row.percentage.toFixed(1))}{t("%")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function InvoicePage() {
  useLanguage();
  const { id } = useParams();
  const orderId = Number(id);
  const invoice = useInvoice(Number.isFinite(orderId) ? orderId : null);

  if (invoice.isLoading) return <div className="page container"><LoadingBlock label={t("Loading the invoice")} variant="line" count={6} /></div>;
  if (invoice.isError) return <div className="page container"><ErrorState error={invoice.error} onRetry={() => invoice.refetch()} /></div>;
  if (!invoice.data) return null;

  const data = invoice.data;

  return (
    <div className="page container">
      <div className="row-between no-print">
        <h1>{t("Invoice")}</h1>
        <div className="row">
          <button type="button" className="btn btn--primary" onClick={() => window.print()}>
            {t("Print")}</button>
          <Link className="btn" to={`/orders/${data.orderId}`}>
            {t("Back to order")}</Link>
        </div>
      </div>

      <p className="muted no-print">{t("This invoice is an order document. Viewing or printing it does not confirm, ship or otherwise change the order.")}</p>
      <section className="invoice" aria-label={t(`Invoice for order ${data.orderId}`)}>
        <header className="row-between">
          <Brand />
          <div className="invoice__meta">
            <h2>{t("Invoice #")}{t(data.orderId)}</h2>
            <p>{t(formatDateTime(data.orderDate))}</p>
            <p>{t("Status: ")}{t(data.status)}</p>
          </div>
        </header>

        <hr style={{ margin: 'var(--space-5) 0', border: 'none', borderTop: '1px solid var(--border)' }} />

        <div className="grid-form">
          <div>
            <h3>{t("Billed to")}</h3>
            <p>{t(data.customerName)}</p>
            <p>{t(data.customerEmail)}</p>
          </div>
          <div>
            <h3>{t("Payment")}</h3>
            <p>{t("Handled outside this system.")}</p>
            <p className="muted">{t("No payment is processed or verified by NineCube Order Processing.")}</p>
          </div>
        </div>

        <div className="table-scroll invoice__lines" tabIndex={0} role="region" aria-label={t("Invoice line items")}>
        <table>
          <thead>
            <tr>
              <th scope="col">{t("SKU")}</th>
              <th scope="col">{t("Description")}</th>
              <th scope="col" className="num">
                {t("Qty")}</th>
              <th scope="col" className="num">
                {t("Unit")}</th>
              <th scope="col" className="num">
                {t("Amount")}</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((line) => (
              <tr key={line.id}>
                <td className="mono">{t(line.sku)}</td>
                <td>{t(line.name)}</td>
                <td className="num">{t(line.quantity)}</td>
                <td className="num">{t(formatMoney(line.unitPrice, data.currency))}</td>
                <td className="num">{t(formatMoney(line.lineTotal, data.currency))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={4} style={{ textAlign: 'right' }}>
                {t("Total")}</th>
              <td className="num">
                <strong>{t(formatMoney(data.total, data.currency))}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
        </div>

        <p className="muted" style={{ marginTop: 'var(--space-5)' }}>
          {t("Stock for this order was reserved at placement. Cancelling or rejecting it releases the reservation and records the movement in the inventory ledger.")}</p>
      </section>

      <OrderTimeline
        order={{
          id: data.orderId,
          customerId: 0,
          customerName: data.customerName,
          status: data.status as OrderStatus,
          totalAmount: data.total,
          createdAt: data.orderDate,
          updatedAt: data.orderDate,
          idempotencyKey: null,
          items: []
        }}
      />
    </div>
  );
}
