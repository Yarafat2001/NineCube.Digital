import { useSearchParams } from 'react-router-dom';
import { t } from '../i18n/language';

type Outcome = 'success' | 'failed' | 'cancelled';

const STYLE: Record<Outcome, { tone: string; mark: string }> = {
  success: { tone: 'ok', mark: '✓' },
  failed: { tone: 'warn', mark: '!' },
  cancelled: { tone: 'neutral', mark: '•' },
};

function bannerText(outcome: Outcome) {
  switch (outcome) {
    case 'success':
      return t('Payment received — your order is being processed.');
    case 'failed':
      return t('Payment failed. You can retry from your order.');
    case 'cancelled':
      return t('Payment was cancelled. You can retry from your order.');
  }
}

export function PaymentOutcomeBanner() {
  const [params] = useSearchParams();
  const outcome = params.get('payment');
  if (outcome !== 'success' && outcome !== 'failed' && outcome !== 'cancelled') return null;
  const style = STYLE[outcome];
  return (
    <div className={`payment-banner payment-banner--${style.tone}`} role="status" data-testid={`payment-banner-${outcome}`}>
      <span className="payment-banner__mark" aria-hidden="true">{style.mark}</span>
      <p>{bannerText(outcome)}</p>
    </div>
  );
}
