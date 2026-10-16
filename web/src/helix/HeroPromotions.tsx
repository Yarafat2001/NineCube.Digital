import { Link } from 'react-router-dom';
import { CARD_DIRECTORY } from './cardAssets';

/** Editorial promotions; offer previews do not alter catalogue prices. */
export function HeroPromotions() {
  return <aside className="hero-promotions" aria-label="Featured collections">
    <Link to="/products" className="hero-promo hero-promo--offer">
      <img src={`${CARD_DIRECTORY}/photo-02.jpg`} alt="Wireless headphones on a yellow background" width={96} height={120} />
      <div className="hero-promo__copy">
        <span className="hero-promo__badge">Offer preview</span>
        <strong>20% OFF</strong>
        <span>Everyday tech <span aria-hidden="true">↗</span></span>
      </div>
    </Link>
    <Link to="/products" className="hero-promo hero-promo--new">
      <img src={`${CARD_DIRECTORY}/photo-03.jpg`} alt="White sneakers with peach detailing" width={96} height={120} />
      <div className="hero-promo__copy">
        <span className="hero-promo__badge">New edit</span>
        <strong>Style refresh</strong>
        <span>Discover the edit <span aria-hidden="true">↗</span></span>
      </div>
    </Link>
  </aside>;
}
