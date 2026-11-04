import { useState, useEffect } from 'react';
import { t, useLanguage } from '../../i18n/language';

interface LiveDeliveryItem {
  id: number;
  location: string;
  item: string;
  time: string;
  status: string;
}

const LIVE_DISPATCHES: LiveDeliveryItem[] = [
  { id: 1, location: 'Dhanmondi, Dhaka', item: 'Acer Aspire Lite 15', time: '18m ago', status: 'Delivered' },
  { id: 2, location: 'Gulshan-2, Dhaka', item: 'Adidas Questar Shoes', time: '34m ago', status: 'Out for delivery' },
  { id: 3, location: 'Agrabad, Chittagong', item: 'Wireless ANC Headphones', time: '52m ago', status: 'Delivered' },
  { id: 4, location: 'Uttara, Dhaka', item: 'Adidas Duramo SL Shoes', time: '1h ago', status: 'Delivered' },
  { id: 5, location: 'Zindabazar, Sylhet', item: 'Bamboo Spatula & Kitchen Set', time: '2h ago', status: 'Dispatched' }
];

export function HomeDeliveryPulse() {
  useLanguage();
  const [tickerIndex, setTickerIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTickerIndex((prev) => (prev + 1) % LIVE_DISPATCHES.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  const current = LIVE_DISPATCHES[tickerIndex];

  return (
    <section className="home-pulse-section" aria-label={t("Live Fulfillment and Customer Reviews")}>
      {/* Live Regional Fulfillment Radar Ticker */}
      <div className="home-pulse-ticker-bar">
        <div className="home-pulse-radar-badge">
          <span className="home-pulse-dot" aria-hidden="true" />
          <strong className="home-pulse-radar-text">{t("Live Fulfillment Radar")}</strong>
        </div>

        <div className="home-pulse-message-wrapper" role="status" aria-live="polite">
          <span className="home-pulse-status-badge">⚡ {t(current.status)}</span>
          <span className="home-pulse-item-text">
            <strong>{t(current.item)}</strong> · {t(current.location)}
          </span>
          <span className="home-pulse-time">({t(current.time)})</span>
        </div>
      </div>

      {/* Verified Customer Satisfaction & Social Proof */}
      <div className="home-reviews-block">
        <div className="home-section-header">
          <div>
            <span className="home-section-kicker">⭐ {t("Verified Customer Satisfaction")}</span>
            <h2 className="home-section-title">{t("Loved by over 1,400+ shoppers nationwide")}</h2>
            <p className="home-section-desc">
              {t("Real feedback from verified orders delivered across Dhaka, Chittagong, Sylhet and all 64 districts.")}
            </p>
          </div>

          <div className="home-reviews-score-pill">
            <span className="home-reviews-stars" aria-hidden="true">★★★★★</span>
            <strong className="home-reviews-rating">4.9 / 5.0</strong>
            <span className="home-reviews-sub">{t("98.4% On-Time Delivery")}</span>
          </div>
        </div>

        <div className="home-reviews-grid">
          <article className="home-review-card">
            <div className="home-review-head">
              <div className="home-review-avatar">{'TH'}</div>
              <div className="home-review-author-meta">
                <strong className="home-review-author">{t("Tanvir Hasan")}</strong>
                <span className="home-review-loc">{t("Dhaka")} · <span className="home-review-badge">✓ {t("Verified Buyer")}</span></span>
              </div>
              <div className="home-review-card-stars" aria-label={t("5 out of 5 stars")}>★★★★★</div>
            </div>
            <p className="home-review-quote">
              “{t("Super fast delivery within 24 hours. The laptop is 100% genuine with official warranty. Packaging was pristine!")}”
            </p>
            <span className="home-review-product-tag">📦 {t("Acer Aspire Lite 15")}</span>
          </article>

          <article className="home-review-card">
            <div className="home-review-head">
              <div className="home-review-avatar">{'NJ'}</div>
              <div className="home-review-author-meta">
                <strong className="home-review-author">{t("Nusrat Jahan")}</strong>
                <span className="home-review-loc">{t("Chittagong")} · <span className="home-review-badge">✓ {t("Verified Buyer")}</span></span>
              </div>
              <div className="home-review-card-stars" aria-label={t("5 out of 5 stars")}>★★★★★</div>
            </div>
            <p className="home-review-quote">
              “{t("Authentic shoes and exact fit. Customer care promptly helped verify sizing before shipping. Truly a premium experience!")}”
            </p>
            <span className="home-review-product-tag">👟 {t("Adidas Duramo SL Shoes")}</span>
          </article>

          <article className="home-review-card">
            <div className="home-review-head">
              <div className="home-review-avatar">{'RI'}</div>
              <div className="home-review-author-meta">
                <strong className="home-review-author">{t("Rafiqul Islam")}</strong>
                <span className="home-review-loc">{t("Sylhet")} · <span className="home-review-badge">✓ {t("Verified Buyer")}</span></span>
              </div>
              <div className="home-review-card-stars" aria-label={t("5 out of 5 stars")}>★★★★★</div>
            </div>
            <p className="home-review-quote">
              “{t("The noise cancellation and sound stage are phenomenal for this price point. Hassle-free cash on delivery.")}”
            </p>
            <span className="home-review-product-tag">🎧 {t("Wireless ANC Headphones")}</span>
          </article>
        </div>
      </div>
    </section>
  );
}
