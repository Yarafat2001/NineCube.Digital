import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthedRequest } from '../api/hooks';
import { useAuth } from '../state/AuthContext';
import type { Order } from '../api/types';
import { useToast } from './ui';
import { t, useLanguage } from '../i18n/language';

export function DeliveryManagement({ order }: { order: Order }) {
  useLanguage();
  const { hasRole } = useAuth();
  const request = useAuthedRequest();
  const client = useQueryClient();
  const toast = useToast();
  const [carrier, setCarrier] = useState(order.carrier ?? '');
  const [trackingNumber, setTracking] = useState(order.trackingNumber ?? '');
  const [status, setStatus] = useState<string>(order.status === 'Confirmed' ? 'Shipped' : order.status);
  const [busy, setBusy] = useState(false);
  const choices = order.status === 'Confirmed' ? ['Shipped'] : order.status === 'Shipped'
    ? ['Shipped', 'Delivered', 'DeliveryFailed'] : order.status === 'DeliveryFailed' ? ['DeliveryFailed', 'Shipped'] : ['Delivered'];
  let address: Record<string, string> | null = null;
  try { address = order.deliveryAddressJson ? JSON.parse(order.deliveryAddressJson) : null; } catch { /* historical orders may have no snapshot */ }
  return <section className="card-glass stack" style={{ padding: 'var(--space-4)' }}>
    <h2>{t('Delivery details')}</h2>
    {address ? <address style={{ fontStyle: 'normal' }}>{Object.values(address).filter(Boolean).join(', ')}</address> : <p>{t('No delivery address was recorded on this order.')}</p>}
    {order.deliveryInstructions ? <p>{t('Delivery instructions')}: {order.deliveryInstructions}</p> : null}
    {hasRole('Staff') && ['Confirmed', 'Shipped', 'DeliveryFailed', 'Delivered'].includes(order.status) && order.items.length > 0 ? <form className="stack" onSubmit={async event => {
      event.preventDefault(); setBusy(true);
      try {
        await request(`/api/orders/${order.id}/delivery`, { method: 'POST', body: { status, carrier, trackingNumber } });
        await client.invalidateQueries({ queryKey: ['order', order.id] });
        await client.invalidateQueries({ queryKey: ['orders'] });
        toast.push('success', t('Delivery details updated.'));
      } catch (error) { toast.pushError(error); } finally { setBusy(false); }
    }}>
      <label>{t('Carrier')}<input className="input" required maxLength={100} value={carrier} onChange={e => setCarrier(e.target.value)} /></label>
      <label>{t('Tracking number')}<input className="input" required maxLength={100} value={trackingNumber} onChange={e => setTracking(e.target.value)} /></label>
      <label>{t('Delivery status')}<select value={status} onChange={e => setStatus(e.target.value)}>{choices.map(value => <option key={value}>{value}</option>)}</select></label>
      <button className="btn" disabled={busy}>{t('Save delivery update')}</button>
    </form> : null}
  </section>;
}
