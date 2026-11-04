import { useState } from 'react';
import { t, useLanguage } from '../../i18n/language';
import { Link } from 'react-router-dom';
import { useProducts } from '../../api/hooks';
import { useCart } from '../../state/CartContext';
import { ProductImage } from '../ProductImage';
import { Icon } from '../Icon';
import { formatMoney } from '../../lib/helpers';
import type { Product } from '../../api/types';

export function HomeFeaturedDeals() {
  useLanguage();
  const { data, isLoading } = useProducts({ q: '', page: 1, pageSize: 8, inStock: true });
  const cart = useCart();
  const [justAddedId, setJustAddedId] = useState<number | null>(null);

  const products: Product[] = (data?.items ?? [])
    .filter((p: Product) => p.isActive && p.stockQuantity > 0)
    .slice(0, 4);

  const handleAddToCart = (e: React.MouseEvent, product: Product) => {
    e.preventDefault();
    e.stopPropagation();
    cart.add(product, 1);
    setJustAddedId(product.id);
    setTimeout(() => setJustAddedId(null), 1800);
  };

  if (isLoading || products.length === 0) return null;

  return (
    <section className="home-deals-section" aria-label={t("Featured Deals")}>
      <div className="home-section-header">
        <div>
          <span className="home-section-kicker">⚡ {t("Special Warehouse Offers")}</span>
          <h2 className="home-section-title">{t("Featured Deals & Trending Picks")}</h2>
          <p className="home-section-desc">{t("Live stock straight from warehouse inventory. Prices guaranteed.")}</p>
        </div>
        <Link to="/products" className="home-section-link">
          {t("Explore all products")} <span aria-hidden="true">→</span>
        </Link>
      </div>

      <div className="home-deals-grid">
        {products.map((product) => {
          const discount = product.compareAtPrice && product.compareAtPrice > product.price
            ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)
            : 0;
          const isJustAdded = justAddedId === product.id;

          return (
            <article key={product.id} className="home-deal-card">
              <Link to={`/products/${product.id}`} className="home-deal-media-link" aria-label={t(`Open ${product.name}`)}>
                <div className="home-deal-media">
                  <ProductImage product={product} />
                  {discount > 0 && (
                    <span className="home-deal-discount-badge">-{discount}%</span>
                  )}
                  <span className="home-deal-stock-badge">
                    • {t("In stock")} · {product.stockQuantity}
                  </span>
                </div>
              </Link>

              <div className="home-deal-body">
                {product.brandName && (
                  <span className="home-deal-brand">{t(product.brandName)}</span>
                )}
                <h3 className="home-deal-name" title={t(product.name)}>
                  <Link to={`/products/${product.id}`}>{t(product.name)}</Link>
                </h3>

                <div className="home-deal-footer">
                  <div className="home-deal-pricing">
                    <strong className="home-deal-price">{t(formatMoney(product.price, product.currency))}</strong>
                    {product.compareAtPrice && product.compareAtPrice > product.price && (
                      <span className="home-deal-compare-price">
                        {t(formatMoney(product.compareAtPrice, product.currency))}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    className={`btn btn--primary btn--sm home-deal-add-btn ${isJustAdded ? 'btn--success' : ''}`}
                    onClick={(e) => handleAddToCart(e, product)}
                    aria-label={`${t("Add to cart")} ${product.name}`}
                  >
                    <Icon name={isJustAdded ? "check" : "cart"} width={14} height={14} />
                    <span>{isJustAdded ? t("Added!") : t("Add to cart")}</span>
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
