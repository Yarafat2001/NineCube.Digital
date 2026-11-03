import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { apiRequest } from '../api/client';
import type { Order } from '../api/types';
import { ErrorState, LoadingBlock, StatusBadge } from '../components/ui';
import { formatMoney } from '../lib/helpers';
import { PaymentActions } from '../components/PaymentActions';
import { t, useLanguage } from '../i18n/language';

export function GuestOrderPage() {
  useLanguage();
  const { id } = useParams();
  const guestToken = sessionStorage.getItem(`ninecube.guest.order.${id}`) ?? '';
  const query = useQuery({ queryKey: ['guest-order', id, guestToken], queryFn: () => apiRequest<Order>(`/api/guest/orders/${id}`, { guestToken }), retry: false });
  if (query.isLoading) return <LoadingBlock label={t('Loading your order')} />;
  if (query.isError) return <div className="page container"><ErrorState error={query.error} onRetry={() => void query.refetch()} /></div>;
  if (!query.data) return null;
  const order = query.data;
  return <div className="page container stack">
    <h1>{t('Order #')}{order.id}</h1>
    <StatusBadge status={order.status} />
    <p>{t('Payment')}: {order.paymentStatus ?? 'Unpaid'}</p>
    <ul>{order.items.map(item => <li key={item.id}>{item.name} × {item.quantity} — {formatMoney(item.lineTotal, order.currency)}</li>)}</ul>
    <strong>{t('Total')}: {formatMoney(order.totalAmount, order.currency)}</strong>
    {order.carrier ? <p>{order.carrier}: {order.trackingNumber}</p> : null}
    <PaymentActions order={order} guestToken={guestToken} />
    <p>{t('Keep this browser tab to retain access to your guest order.')}</p>
    <Link to="/products">{t('Continue shopping')}</Link>
  </div>;
}
