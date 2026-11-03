import { useState } from 'react';
import { apiRequest } from '../api/client';
import { useAuth } from '../state/AuthContext';
import type { Order, PaymentTransaction } from '../api/types';
import { useToast } from './ui';
import { t, useLanguage } from '../i18n/language';
import { useCheckoutOptions } from '../api/hooks';

export function PaymentActions({ order, guestToken }: { order: Order; guestToken?: string }) {
  useLanguage();
  const { token } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const options = useCheckoutOptions();
  if (order.totalAmount <= 0 || order.paymentStatus === 'Paid' || order.paymentStatus === 'Refunded'
      || order.status === 'Cancelled' || order.status === 'Rejected') return null;
  if (order.currency !== 'BDT' || order.totalAmount < 10 || order.totalAmount > 500000) return null;
  if (!options.data?.onlinePaymentsEnabled) return <p className="muted">{t('Online payments are currently unavailable. Contact support if you need help with payment.')}</p>;
  return <button type="button" className="btn btn--primary" disabled={busy} onClick={async () => {
    setBusy(true);
    try {
      const payment = await apiRequest<PaymentTransaction>(guestToken ? '/api/guest/payments' : '/api/payments/process', {
        method: 'POST', token, guestToken, body: { orderId: order.id, provider: 'Card' }
      });
      if (payment.redirectUrl) window.location.assign(payment.redirectUrl);
    } catch (error) { toast.pushError(error); }
    finally { setBusy(false); }
  }}>{t(busy ? 'Opening payment…' : 'Pay securely with SSLCOMMERZ')}</button>;
}
