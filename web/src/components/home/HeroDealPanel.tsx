import { Link } from 'react-router-dom';
import { t, useLanguage } from '../../i18n/language';
import { useHomeMerch } from './useHomeMerch';
import { formatMoney } from '../../lib/helpers';
import { Icon } from '../Icon';

/**
 * The shop-window panel beside the hero statement: one real product from the live catalogue,
 * with the saving the API actually reports. When nothing is discounted, the newest arrival
 * carries the panel instead. Hidden entirely while the catalogue is empty.
 */
export function HeroDealPanel() {
  useLanguage();
  const { deal, dealPercent } = useHomeMerch();

  if (!deal) return null;

  const isDeal = dealPercent > 0;

  return (
    <aside className="hero-deal" aria-label={isDeal ? t("Today's best deal") : t("New arrival")}>
      <Link to={`/products/${deal.id}`} className="hero-deal__card">
        <span className="hero-deal__badge">
          {isDeal ? <>{t("SAVE")} {dealPercent}%</> : t("NEW ARRIVAL")}
        </span>
        {deal.imageUrl ? (
          <img
            className="hero-deal__photo"
            src={deal.imageUrl}
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
          <span className="hero-deal__kicker">{isDeal ? t("Today's best deal") : t("Just arrived")}</span>
          <strong className="hero-deal__name">{t(deal.name)}</strong>
          <span className="hero-deal__price-row">
            <span className="hero-deal__price">{t(formatMoney(deal.price, deal.currency))}</span>
            {isDeal && deal.compareAtPrice ? (
              <span className="hero-deal__compare">{t(formatMoney(deal.compareAtPrice, deal.currency))}</span>
            ) : null}
          </span>
          <span className="hero-deal__cta">
            {t("Shop this deal")} <span aria-hidden="true">{t("↗")}</span>
          </span>
        </span>
      </Link>
    </aside>
  );
}
