import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { t, useLanguage } from '../../i18n/language';
import { useHomeMerch } from './useHomeMerch';
import { formatMoney } from '../../lib/helpers';
import { Icon } from '../Icon';

/**
 * The promotional hero showcase slider: rotates through the top live deals and arrivals
 * from the live catalogue with real discount badges, price anchors, and interactive navigation.
 */
export function HeroDealPanel() {
  useLanguage();
  const { deal, dealPercent, heroDeals } = useHomeMerch();
  const items = heroDeals.length > 0 ? heroDeals : (deal ? [deal] : []);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (items.length <= 1 || isPaused) return;
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % items.length);
    }, 5500);
    return () => clearInterval(timer);
  }, [items.length, isPaused]);

  if (items.length === 0) return null;

  const current = items[activeIndex] ?? items[0]!;
  const currentDiscount = current.compareAtPrice && current.compareAtPrice > current.price
    ? Math.round(((current.compareAtPrice - current.price) / current.compareAtPrice) * 100)
    : (activeIndex === 0 ? dealPercent : 0);
  const isDeal = currentDiscount > 0;

  return (
    <aside
      className="hero-deal hero-deal--slider"
      aria-label={isDeal ? t("Today's best deal") : t("New arrival")}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <Link to={`/products/${current.id}`} className="hero-deal__card">
        <span className="hero-deal__badge">
          {isDeal ? <>{t("SAVE")} {currentDiscount}%</> : t("NEW ARRIVAL")}
        </span>

        {current.imageUrl ? (
          <img
            key={current.id}
            className="hero-deal__photo"
            src={current.imageUrl}
            alt=""
            width={640}
            height={480}
            loading="eager"
          />
        ) : (
          <span className="hero-deal__photo hero-deal__photo--empty" aria-hidden="true">
            <Icon name="spark" width={28} height={28} />
          </span>
        )}

        <span className="hero-deal__body">
          <span className="hero-deal__kicker">
            <Icon name={isDeal ? "percent" : "spark"} width={12} height={12} />
            {isDeal ? t("Featured Super Deal") : t("Just arrived")}
          </span>
          <strong className="hero-deal__name">{t(current.name)}</strong>
          <span className="hero-deal__price-row">
            <span className="hero-deal__price">{t(formatMoney(current.price, current.currency))}</span>
            {isDeal && current.compareAtPrice ? (
              <span className="hero-deal__compare">{t(formatMoney(current.compareAtPrice, current.currency))}</span>
            ) : null}
          </span>
          <span className="hero-deal__cta">
            {t("Shop this deal")} <span aria-hidden="true">{t("↗")}</span>
          </span>
        </span>
      </Link>

      {items.length > 1 && (
        <div className="hero-deal__controls" aria-label={t("Featured deal navigation")}>
          <div className="hero-deal__dots">
            {items.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                className={`hero-deal__dot ${idx === activeIndex ? 'hero-deal__dot--active' : ''}`}
                aria-label={`${t("Go to slide")} ${idx + 1}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setActiveIndex(idx);
                }}
              />
            ))}
          </div>
          <div className="hero-deal__nav-btns">
            <button
              type="button"
              className="hero-deal__nav-btn"
              aria-label={t("Previous deal")}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
              }}
            >
              <Icon name="chevron" width={14} height={14} className="hero-deal__nav-chevron hero-deal__nav-chevron--prev" />
            </button>
            <button
              type="button"
              className="hero-deal__nav-btn"
              aria-label={t("Next deal")}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setActiveIndex((prev) => (prev + 1) % items.length);
              }}
            >
              <Icon name="chevron" width={14} height={14} className="hero-deal__nav-chevron hero-deal__nav-chevron--next" />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
