import { useState } from 'react';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../components/ui';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { apiRequest } from '../api/client';
import type { Order } from '../api/types';
import { ErrorState, LoadingBlock, StatusBadge } from '../components/ui';
import { formatMoney } from '../lib/helpers';
import { PaymentActions } from '../components/PaymentActions';
import { PaymentOutcomeBanner } from '../components/PaymentOutcomeBanner';
import { t, useLanguage } from '../i18n/language';

export function GuestOrderPage() {
  useLanguage();
  const { id } = useParams();
  const { user, token } = useAuth(); const toast = useToast();
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const guestToken = sessionStorage.getItem(`ninecube.guest.order.${id}`) ?? '';
  const query = useQuery({ queryKey: ['guest-order', id, guestToken], queryFn: () => apiRequest<Order>(`/api/guest/orders/${id}`, { guestToken }), retry: false });
  if (query.isLoading) return <LoadingBlock label={t('Loading your order')} />;
  if (query.isError) return <div className="page container"><ErrorState error={query.error} onRetry={() => void query.refetch()} /></div>;
  if (!query.data) return null;
  const order = query.data;
  return <div className="page container stack">
    <h1>{t('Order #')}{order.id}</h1>
    <StatusBadge status={order.status} />
    <PaymentOutcomeBanner />
    <p>{t('Payment')}: {order.paymentStatus ?? 'Unpaid'}</p>
    <ul>{order.items.map(item => <li key={item.id}>{item.name} × {item.quantity} — {formatMoney(item.lineTotal, order.currency)}</li>)}</ul>
    <strong>{t('Total')}: {formatMoney(order.totalAmount, order.currency)}</strong>
    {order.carrier ? <p>{order.carrier}: {order.trackingNumber}</p> : null}
    <PaymentActions order={order} guestToken={guestToken} />
    {['Pending', 'Confirmed'].includes(order.status) && <button className="btn btn--danger" disabled={busy} onClick={async () => {
      setBusy(true); try { await apiRequest(`/api/guest/orders/${order.id}/cancel`, { method: 'POST', guestToken }); await query.refetch(); }
      catch (error) { toast.pushError(error); } finally { setBusy(false); }
    }}>{t('Cancel order')}</button>}
    <form className="stack" onSubmit={async event => {
      event.preventDefault(); setBusy(true); try { await apiRequest(`/api/guest/orders/${order.id}/support`, { method: 'POST', guestToken, body: { reason: message } }); setMessage(''); toast.push('success', t('Your request has been saved.')); }
      catch (error) { toast.pushError(error); } finally { setBusy(false); }
    }}><label className="field">{t('How can we help?')}<textarea required maxLength={2000} value={message} onChange={e => setMessage(e.target.value)} /></label><button className="btn" disabled={busy}>{t('Send request')}</button></form>
    {user?.role === 'Customer' && <button className="btn" disabled={busy} onClick={async () => {
      setBusy(true); try { await apiRequest('/api/me/claim-guest-order', { method: 'POST', token, body: { orderId: order.id, token: guestToken } }); window.location.hash = `/orders/${order.id}`; }
      catch (error) { toast.pushError(error); } finally { setBusy(false); }
    }}>{t('Link this order to my account')}</button>}
    <Link to="/guest/recover">{t('Recover a guest order')}</Link>

    <p>{t('Keep this browser tab to retain access to your guest order.')}</p>
    <Link to="/products">{t('Continue shopping')}</Link>
  </div>;
}
