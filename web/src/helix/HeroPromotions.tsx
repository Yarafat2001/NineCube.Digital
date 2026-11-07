import { t, useLanguage } from '../i18n/language';
import { Link } from 'react-router-dom';
import { useProducts } from '../api/hooks';
import { formatMoney } from '../lib/helpers';
import { CARD_DIRECTORY } from './cardAssets';

/** The cheapest in-stock item a promo query returns, or null while it has no answer yet. */
function usePromoAnchor(query: string) {
  const result = useProducts({ q: query, page: 1, pageSize: 1, inStock: true, sort: 'price' });
  return result.data?.items?.[0] ?? null;
}

/** Editorial promotions; offer previews do not alter catalogue prices. */
export function HeroPromotions() {
  useLanguage();
  const headphones = usePromoAnchor('headphones');
  const sneakers = usePromoAnchor('sneakers');

  return <aside className="hero-promotions" aria-label={t("Featured collections")}>
    <Link to="/products?q=headphones" className="hero-promo hero-promo--offer">
      <img src={`${CARD_DIRECTORY}/photo-02.jpg`} alt={t("Wireless headphones on a yellow background")} width={96} height={120} />
      <div className="hero-promo__copy">
        <span className="hero-promo__badge">{t("Technology")}</span>
        <strong>{t("Everyday tech")}</strong>
        {headphones ? (
          <span className="hero-promo__from">{t("From")} {t(formatMoney(headphones.price, headphones.currency))}</span>
        ) : null}
        <span>{t("Everyday tech ")}<span aria-hidden="true">{t("↗")}</span></span>
      </div>
    </Link>
    <Link to="/products?q=sneakers" className="hero-promo hero-promo--new">
      <img src={`${CARD_DIRECTORY}/photo-03.jpg`} alt={t("White sneakers with peach detailing")} width={96} height={120} />
      <div className="hero-promo__copy">
        <span className="hero-promo__badge">{t("New edit")}</span>
        <strong>{t("Style refresh")}</strong>
        {sneakers ? (
          <span className="hero-promo__from">{t("From")} {t(formatMoney(sneakers.price, sneakers.currency))}</span>
        ) : null}
        <span>{t("Discover the edit ")}<span aria-hidden="true">{t("↗")}</span></span>
      </div>
    </Link>
  </aside>;
}
