import { t, useLanguage } from '../../i18n/language';
import { useBrands } from '../../api/hooks';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon';
import { LoadingBlock } from '../ui';
import type { Brand } from '../../api/types';

/**
 * Brands as a rail rather than a shelf of cards: one row of chips a shopper can click through to
 * the brand's products, which is what the brand list is for.
 */
export function HomeBrandStrip() {
  useLanguage();
  const { data, isLoading } = useBrands({ q: '' });

  const brands = (data ?? [])
    .filter((b: Brand) => b.productCount > 0)
    .slice(0, 8);

  if (!isLoading && brands.length === 0) return null;

  return (
    <section className="home-brands-section" aria-label={t("Brands in the catalogue")}>
      {isLoading ? (
        <LoadingBlock label={t("Loading brands")} variant="tile" count={6} />
      ) : (
        <div className="home-brand-rail">
          <span className="home-section-kicker">
            <Icon name="tag" width={13} height={13} /> {t("Shop by brand")}
          </span>
          <div className="home-brand-chips">
            {brands.map((brand) => (
              <Link
                key={brand.slug}
                to={`/products?brand=${encodeURIComponent(brand.slug)}`}
                className="home-brand-chip"
              >
                <span className="home-brand-monogram">{brand.name.slice(0, 2).toUpperCase()}</span>
                <span className="home-brand-name">{t(brand.name)}</span>
                <span className="home-brand-count">{brand.productCount}</span>
              </Link>
            ))}
          </div>
          <Link to="/products" className="home-section-link">
            {t("View all brands")} <span aria-hidden="true">→</span>
          </Link>
        </div>
      )}
    </section>
  );
}
