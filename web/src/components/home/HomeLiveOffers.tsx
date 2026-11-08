import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useActiveCampaigns } from '../../api/hooks';
import { t, useLanguage } from '../../i18n/language';
import { formatDate, formatMoneyWhole } from '../../lib/helpers';
import { offerAmount, offerLink, offerScope, pickFeaturedCampaign } from '../../lib/campaignFacts';
import { countdown, useNow } from '../../lib/countdown';
import { Icon } from '../Icon';
import { LoadingBlock } from '../ui';

export function HomeLiveOffers() {
  useLanguage();
  const { data, isLoading } = useActiveCampaigns();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const campaigns = (data ?? []).filter((coupon) => coupon.isActive);
  // The band above already shows this campaign in full, so the list starts after it: the same
  // discount printed twice on one page reads as two different offers.
  const featured = pickFeaturedCampaign(campaigns);
  const listed = campaigns.filter((coupon) => coupon.id !== featured?.id);
  const hasExpiry = listed.some((coupon) => coupon.expiresAt);
  const now = useNow(hasExpiry ? 1000 : 60000);
  if (!isLoading && listed.length === 0) return null;

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
          {listed.map((coupon) => {
            const copied = copiedCode === coupon.code;
            const left = coupon.expiresAt ? countdown(coupon.expiresAt, now) : null;
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
                  {left && (
                    <li className="home-offer-countdown">
                      <Icon name="clock" width={14} height={14} />
                      {t('Ends in')} {left}
                    </li>
                  )}
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
                  {coupon.expiresAt && !left && (
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
                  <Link className="btn btn--sm btn--outline home-offer-shop" to={offerLink(coupon)}>
                    {t('Shop this offer')}
                  </Link>
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
