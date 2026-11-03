import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { t, useLanguage } from '../i18n/language';

export function PaymentReturnPage() {
  useLanguage();
  const [params] = useSearchParams();
  const id = Number(params.get('order'));
  const outcome = params.get('payment');
  if (Number.isSafeInteger(id) && id > 0) {
    const guest = sessionStorage.getItem(`ninecube.guest.order.${id}`);
    return <Navigate replace to={`${guest ? '/guest' : ''}/orders/${id}?payment=${encodeURIComponent(outcome ?? 'pending')}`} />;
  }
  return <div className="page container stack"><h1>{t('Payment update')}</h1>
    <p role="status">{t(outcome === 'cancelled' ? 'Payment was cancelled. You can retry from your order.' : 'We could not confirm payment here. Check your order before trying again.')}</p>
    <Link className="btn" to="/orders">{t('My Orders')}</Link><Link to="/guest/recover">{t('Recover a guest order')}</Link><Link to="/products">{t('Continue shopping')}</Link>
  </div>;
}
