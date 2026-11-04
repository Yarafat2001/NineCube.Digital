import { t, useLanguage } from '../../i18n/language';
import { useBrands } from '../../api/hooks';
import { Link } from 'react-router-dom';
import type { Brand } from '../../api/types';

const FALLBACK_BRANDS: Brand[] = [
  { id: 1, name: 'Acer', slug: 'acer', productCount: 12 },
  { id: 2, name: 'Apex', slug: 'apex', productCount: 16 },
  { id: 3, name: 'Apple', slug: 'apple', productCount: 8 },
  { id: 4, name: 'Samsung', slug: 'samsung', productCount: 6 },
  { id: 5, name: 'Asus', slug: 'asus', productCount: 10 },
  { id: 6, name: 'Local Brand', slug: 'local-brand', productCount: 14 }
];

export function HomeBrandStrip() {
  useLanguage();
  const { data } = useBrands({ q: '' });

  const brands = (data && data.length > 0 ? data : FALLBACK_BRANDS)
    .filter((b) => b.productCount > 0)
    .slice(0, 6);

  return (
    <section className="home-brands-section" aria-label={t("Official Flagship Brands")}>
      <div className="home-section-header">
        <div>
          <span className="home-section-kicker">🏷️ {t("Official Partners")}</span>
          <h2 className="home-section-title">{t("Featured Flagship Brands")}</h2>
          <p className="home-section-desc">
            {t("Shop directly from certified brand distributors and authorized regional flagships.")}
          </p>
        </div>
        <Link to="/products" className="home-section-link">
          {t("View all brands")} <span aria-hidden="true">→</span>
        </Link>
      </div>

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
                <span className="home-brand-badge" title={t("Authorized official partner")}>
                  ✓ {t("Authorized")}
                </span>
              </div>
              <span className="home-brand-count">
                {brand.productCount} {t("Products")}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
