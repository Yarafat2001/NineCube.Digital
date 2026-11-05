import { useState } from 'react';
import { useActiveCampaigns } from '../../api/hooks';
import { t, useLanguage } from '../../i18n/language';
import { formatDate, formatMoneyWhole } from '../../lib/helpers';
import { Icon } from '../Icon';
import { LoadingBlock } from '../ui';
import type { Coupon } from '../../api/types';

const offerAmount = (coupon: Coupon) =>
  coupon.discountType === 'Percentage'
    ? `${coupon.discountValue}% ${t('OFF')}`
    : `${formatMoneyWhole(coupon.discountValue, 'BDT')} ${t('OFF')}`;

const offerScope = (coupon: Coupon) => {
  if (!coupon.targetType || coupon.targetType === 'Order') return t('Storewide');
  return `${t('Discount on')} ${t(coupon.targetType)}`;
};

export function HomeLiveOffers() {
  useLanguage();
  const { data, isLoading } = useActiveCampaigns();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const campaigns = (data ?? []).filter((coupon) => coupon.isActive);
  if (!isLoading && campaigns.length === 0) return null;

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Clipboard can be blocked by the browser; the code is still on screen to read.
    }
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  return (
    <section className="home-offers-section" aria-labelledby="home-offers-heading">
      <div className="home-section-header">
        <div>
          <span className="home-section-kicker">
            <Icon name="ticket" width={13} height={13} /> {t('Live offers')}
          </span>
          <h2 id="home-offers-heading" className="home-section-title">{t('Offers you can use right now')}</h2>
          <p className="home-section-desc">
            {t('These are the campaigns the store has running today. The exact saving is calculated at checkout.')}
          </p>
        </div>
      </div>

      {isLoading ? (
        <LoadingBlock label={t('Loading offers')} variant="card" count={3} />
      ) : (
        <ul className="home-offers-grid">
          {campaigns.map((coupon) => {
            const copied = copiedCode === coupon.code;
            return (
              <li key={coupon.id} className="home-offer-card">
                <div className="home-offer-head">
                  <span className="home-offer-icon">
                    <Icon name={coupon.isAutomatic ? 'bolt' : 'ticket'} width={20} height={20} />
                  </span>
                  <div className="home-offer-headline">
                    <strong className="home-offer-amount">{offerAmount(coupon)}</strong>
                    <span className="home-offer-scope">{offerScope(coupon)}</span>
                  </div>
                </div>

                <ul className="home-offer-terms">
                  {coupon.minOrderAmount > 0 && (
                    <li>
                      <Icon name="wallet" width={14} height={14} />
                      {t('On orders over')} {formatMoneyWhole(coupon.minOrderAmount, 'BDT')}
                    </li>
                  )}
                  {coupon.maxDiscountCap ? (
                    <li>
                      <Icon name="percent" width={14} height={14} />
                      {t('Max savings')} {formatMoneyWhole(coupon.maxDiscountCap, 'BDT')}
                    </li>
                  ) : null}
                  {coupon.expiresAt && (
                    <li>
                      <Icon name="calendar" width={14} height={14} />
                      {t('Until')} {formatDate(coupon.expiresAt)}
                    </li>
                  )}
                  {coupon.minOrderAmount <= 0 && !coupon.maxDiscountCap && !coupon.expiresAt && (
                    <li>
                      <Icon name="check" width={14} height={14} />
                      {t('No minimum spend')}
                    </li>
                  )}
                </ul>

                <div className="home-offer-action">
                  {coupon.isAutomatic ? (
                    <span className="home-offer-auto">{t('Applied automatically at checkout')}</span>
                  ) : (
                    <>
                      <span className="home-offer-code">{coupon.code}</span>
                      <button
                        type="button"
                        className="btn btn--sm btn--outline home-offer-copy"
                        onClick={() => void handleCopy(coupon.code)}
                        aria-label={`${t('Copy voucher code')} ${coupon.code}`}
                      >
                        <Icon name={copied ? 'check' : 'copy'} width={14} height={14} />
                        <span>{copied ? t('Copied!') : t('Copy')}</span>
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
