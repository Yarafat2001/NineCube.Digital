import { t, useLanguage } from '../i18n/language';
import { Link } from 'react-router-dom';
import { CARD_DIRECTORY } from './cardAssets';

/** Editorial promotions; offer previews do not alter catalogue prices. */
export function HeroPromotions() {
  useLanguage();
  return <aside className="hero-promotions" aria-label={t("Featured collections")}>
    <Link to="/products" className="hero-promo hero-promo--offer">
      <img src={`${CARD_DIRECTORY}/photo-02.jpg`} alt={t("Wireless headphones on a yellow background")} width={96} height={120} />
      <div className="hero-promo__copy">
        <span className="hero-promo__badge">{t("Offer preview")}</span>
        <strong>{t("20% OFF")}</strong>
        <span>{t("Everyday tech ")}<span aria-hidden="true">{t("↗")}</span></span>
      </div>
    </Link>
    <Link to="/products" className="hero-promo hero-promo--new">
      <img src={`${CARD_DIRECTORY}/photo-03.jpg`} alt={t("White sneakers with peach detailing")} width={96} height={120} />
      <div className="hero-promo__copy">
        <span className="hero-promo__badge">{t("New edit")}</span>
        <strong>{t("Style refresh")}</strong>
        <span>{t("Discover the edit ")}<span aria-hidden="true">{t("↗")}</span></span>
      </div>
    </Link>
  </aside>;
}
