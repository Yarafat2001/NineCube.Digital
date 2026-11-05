import { t, useLanguage } from '../../i18n/language';
import { useBrands } from '../../api/hooks';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon';
import { LoadingBlock } from '../ui';
import type { Brand } from '../../api/types';

export function HomeBrandStrip() {
  useLanguage();
  const { data, isLoading } = useBrands({ q: '' });

  const brands = (data ?? [])
    .filter((b: Brand) => b.productCount > 0)
    .slice(0, 6);

  if (!isLoading && brands.length === 0) return null;

  return (
    <section className="home-brands-section" aria-label={t("Brands in the catalogue")}>
      <div className="home-section-header">
        <div>
          <span className="home-section-kicker">
            <Icon name="tag" width={13} height={13} /> {t("Shop by brand")}
          </span>
          <h2 className="home-section-title">{t("Brands in the catalogue")}</h2>
          <p className="home-section-desc">
            {t("Every brand listed here has products in the live catalogue, and the count comes from that same list.")}
          </p>
        </div>
        <Link to="/products" className="home-section-link">
          {t("View all brands")} <span aria-hidden="true">→</span>
        </Link>
      </div>

      {isLoading ? (
        <LoadingBlock label={t("Loading brands")} variant="tile" count={6} />
      ) : (
        <div className="home-brand-grid">
          {brands.map((brand) => (
            <Link
              key={brand.slug}
              to={`/products?brand=${encodeURIComponent(brand.slug)}`}
              className="home-brand-card"
            >
              <div className="home-brand-monogram">
                <span>{brand.name.slice(0, 2).toUpperCase()}</span>
              </div>
              <div className="home-brand-details">
                <div className="home-brand-head">
                  <strong className="home-brand-name">{t(brand.name)}</strong>
                </div>
                <span className="home-brand-count">
                  {brand.productCount} {t("Products")}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
