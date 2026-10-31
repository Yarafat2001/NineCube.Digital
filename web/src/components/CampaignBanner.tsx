import { useState } from 'react';
import { useActiveCampaigns } from '../api/hooks';
import { t, useLanguage } from '../i18n/language';
import './CampaignBanner.css';

export function CampaignBanner() {
  useLanguage();
  const { data: campaigns } = useActiveCampaigns();
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem('ninecube:dismissed-campaigns') || '[]');
    } catch {
      return [];
    }
  });
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const activeBanners = (campaigns ?? []).filter((c) => c.isBannerPromoted && !dismissed.includes(c.code));
  if (activeBanners.length === 0) return null;

  const current = activeBanners[0];

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2500);
    } catch {
      // Fallback if clipboard API is restricted
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2500);
    }
  };

  const handleDismiss = (code: string) => {
    const next = [...dismissed, code];
    setDismissed(next);
    try {
      sessionStorage.setItem('ninecube:dismissed-campaigns', JSON.stringify(next));
    } catch {
      // Ignore sessionStorage errors
    }
  };

  return (
    <div className="campaign-banner" role="region" aria-label={t("Promotional campaign")}>
      <div className="campaign-banner__container">
        <div className="campaign-banner__content">
          <span className="campaign-banner__sparkle" aria-hidden="true">🎉</span>
          <span className="campaign-banner__title">
            <strong>{current.campaignTitle ? t(current.campaignTitle) : t("Special Promotion")}:</strong>{' '}
            {current.discountType === 'Percentage'
              ? `${current.discountValue}% ${t("OFF")}`
              : `BDT ${current.discountValue} ${t("OFF")}`}
            {current.targetType && current.targetType !== 'Order' ? ` (${t(current.targetType)})` : ''}
            {current.maxDiscountCap ? ` · ${t("Max savings")} BDT ${current.maxDiscountCap}` : ''}
          </span>
          <div className="campaign-banner__action">
            <span className="campaign-banner__use-code">{t("Use code:")}</span>
            <button
              type="button"
              className="campaign-banner__code-btn"
              onClick={() => void handleCopy(current.code)}
              title={t("Click to copy code")}
            >
              <code>{current.code}</code>
              <span className="campaign-banner__copy-pill">
                {copiedCode === current.code ? t("Copied!") : t("Copy")}
              </span>
            </button>
          </div>
        </div>
        <button
          type="button"
          className="campaign-banner__close"
          onClick={() => handleDismiss(current.code)}
          aria-label={t("Dismiss campaign banner")}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
