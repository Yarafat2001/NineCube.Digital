import { t } from '../i18n/language';
import { formatMoneyWhole } from './helpers';
import type { Coupon } from '../api/types';

export const offerAmount = (coupon: Coupon) =>
  coupon.discountType === 'Percentage'
    ? `${coupon.discountValue}% ${t('OFF')}`
    : `${formatMoneyWhole(coupon.discountValue, 'BDT')} ${t('OFF')}`;

export const offerScope = (coupon: Coupon) => {
  if (!coupon.targetType || coupon.targetType === 'Order') return t('Storewide');
  return `${t('Discount on')} ${t(coupon.targetType)}`;
};

/** Where the offer can actually be spent: its first named scope, else the whole catalogue. */
export const offerLink = (coupon: Coupon): string => {
  const scopeName = coupon.scopeRules?.find((rule) => rule.entityNames?.length)?.entityNames[0];
  return scopeName ? `/products?q=${encodeURIComponent(scopeName)}` : '/products';
};

/** The banner's featured campaign: store-curated first, else the biggest active one. */
export const pickFeaturedCampaign = (campaigns: Coupon[]): Coupon | null => {
  const promoted = campaigns.filter((campaign) => campaign.isBannerPromoted);
  const pool = promoted.length > 0 ? promoted : campaigns;
  if (pool.length === 0) return null;

  return [...pool].sort((a, b) => {
    // Percentage campaigns outrank fixed amounts regardless of value.
    if (a.discountType !== b.discountType) return a.discountType === 'Percentage' ? -1 : 1;
    return b.discountValue - a.discountValue;
  })[0]!;
};
