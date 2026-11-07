import { ErrorState, LoadingBlock } from '../ui';
import { useEffect, useMemo, useState } from 'react';
import { t, useLanguage } from '../../i18n/language';
import { Link } from 'react-router-dom';
import { useProducts } from '../../api/hooks';
import { useCart } from '../../state/CartContext';
import { useHomeMerch } from './useHomeMerch';
import { ProductImage } from '../ProductImage';
import { Icon } from '../Icon';
import { formatMoney } from '../../lib/helpers';
import type { Product } from '../../api/types';

export type MerchandisingTab = 'trending' | 'discounts' | 'new';

export interface HomeFeaturedDealsProps {
  onToggleCompare?: (product: Product) => void;
  compareItems?: Product[];
}

function FlashCountdown() {
  const [timeLeft, setTimeLeft] = useState(() => {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    return Math.max(0, Math.floor((endOfDay.getTime() - now.getTime()) / 1000));
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = Math.floor(timeLeft / 3600);
  const minutes = Math.floor((timeLeft % 3600) / 60);
  const seconds = timeLeft % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="home-flash-timer" aria-label={t("Flash deals countdown")}>
      <Icon name="bolt" width={13} height={13} />
      <span className="home-flash-timer__label">{t("Ends in")}:</span>
      <span className="home-flash-timer__digits" aria-live="polite">
        {pad(hours)}:{pad(minutes)}:{pad(seconds)}
      </span>
    </div>
  );
}

export function HomeFeaturedDeals({ onToggleCompare, compareItems = [] }: HomeFeaturedDealsProps) {
  useLanguage();
  const [activeTab, setActiveTab] = useState<MerchandisingTab>('trending');
  const { data, isLoading, isError, error, refetch } = useProducts({ q: '', page: 1, pageSize: 24, inStock: true });
  const { newest } = useHomeMerch();
  const cart = useCart();
  const [justAddedId, setJustAddedId] = useState<number | null>(null);

  const newestIds = useMemo(() => new Set(newest.map((product) => product.id)), [newest]);

  const allActiveProducts: Product[] = useMemo(
    () => (data?.items ?? []).filter((p: Product) => p.isActive && p.stockQuantity > 0),
    [data?.items]
  );

  const products: Product[] = useMemo(() => {
    if (activeTab === 'discounts') {
      const discounted = allActiveProducts
        .filter(p => p.compareAtPrice && p.compareAtPrice > p.price)
        .sort((a, b) => {
          const discountA = ((a.compareAtPrice! - a.price) / a.compareAtPrice!) * 100;
          const discountB = ((b.compareAtPrice! - b.price) / b.compareAtPrice!) * 100;
          return discountB - discountA;
        });
      return (discounted.length >= 4 ? discounted : allActiveProducts).slice(0, 4);
    }
    if (activeTab === 'new') {
      return [...allActiveProducts].sort((a, b) => b.id - a.id).slice(0, 4);
    }
    // 'trending'
    return allActiveProducts.slice(0, 4);
  }, [allActiveProducts, activeTab]);

  const handleAddToCart = (e: React.MouseEvent, product: Product) => {
    e.preventDefault();
    e.stopPropagation();
    cart.add(product, 1);
    setJustAddedId(product.id);
    setTimeout(() => setJustAddedId(null), 1800);
  };

  return (
    <section className="home-deals-section" aria-label={t("Featured Deals")}>
      <div className="home-section-header">
        <div>
          <span className="home-section-kicker">
            <Icon name="grid" width={13} height={13} /> {t("Curated Storefront Showcase")}
          </span>
          <h2 className="home-section-title">{t("Available to shop")}</h2>
          <p className="home-section-desc">{t("Explore current prices and live warehouse stock. Checked again at checkout.")}</p>
        </div>

        <div className="home-deals-controls">
          {activeTab === 'discounts' && <FlashCountdown />}
          <div className="home-deals-tabs" role="tablist" aria-label={t("Product showcase categories")}>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'trending'}
              className={`home-deals-tab ${activeTab === 'trending' ? 'home-deals-tab--active' : ''}`}
              onClick={() => setActiveTab('trending')}
            >
              <Icon name="bolt" width={14} height={14} /> {t("Trending Now")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'discounts'}
              className={`home-deals-tab ${activeTab === 'discounts' ? 'home-deals-tab--active' : ''}`}
              onClick={() => setActiveTab('discounts')}
            >
              <Icon name="percent" width={14} height={14} /> {t("Flash Discounts")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'new'}
              className={`home-deals-tab ${activeTab === 'new' ? 'home-deals-tab--active' : ''}`}
              onClick={() => setActiveTab('new')}
            >
              <Icon name="spark" width={14} height={14} /> {t("New Arrivals")}
            </button>
          </div>
        </div>

        <Link to="/products" className="home-section-link">
          {t("Explore all products")} <span aria-hidden="true">→</span>
        </Link>
      </div>

      {isLoading && <LoadingBlock label={t("Loading products")} variant="card" count={4} />}
      {isError && <ErrorState error={error} onRetry={() => void refetch()} />}
      {!isLoading && !isError && products.length === 0 && <p>{t("No available products to feature right now.")}</p>}
      <div className="home-deals-grid">
        {products.map((product) => {
          const discount = product.compareAtPrice && product.compareAtPrice > product.price
            ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)
            : 0;
          const isJustAdded = justAddedId === product.id;
          const isComparing = compareItems.some(x => x.id === product.id);

          return (
            <article key={product.id} className="home-deal-card">
              <Link to={`/products/${product.id}`} className="home-deal-media-link" aria-label={t(`Open ${product.name}`)}>
                <div className="home-deal-media">
                  <ProductImage product={product} />
                  {discount > 0 && (
                    <span className="home-deal-discount-badge">-{discount}%</span>
                  )}
                  {newestIds.has(product.id) && (
                    <span className="home-deal-new-badge">{t("NEW")}</span>
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

                  <div className="home-deal-stock-progress" aria-hidden="true" title={`${t("In stock")}: ${product.stockQuantity}`}>
                    <div
                      className="home-deal-stock-progress__bar"
                      style={{ width: `${Math.min(100, Math.max(14, Math.round((product.stockQuantity / 25) * 100)))}%` }}
                    />
                  </div>

                  <div className="home-deal-btn-group">
                    {product.hasVariants ? (
                      <Link className="btn btn--primary btn--sm" to={`/products/${product.id}`}>
                        {t("Choose options")}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className={`btn btn--primary btn--sm home-deal-add-btn ${isJustAdded ? 'btn--success' : ''}`}
                        onClick={(e) => handleAddToCart(e, product)}
                        aria-label={`${t("Add to cart")} ${product.name}`}
                      >
                        <Icon name={isJustAdded ? "check" : "cart"} width={14} height={14} />
                        <span>{isJustAdded ? t("Added!") : t("Add to cart")}</span>
                      </button>
                    )}

                    {onToggleCompare ? (
                      <button
                        type="button"
                        className={`home-deal-compare-btn ${isComparing ? 'home-deal-compare-btn--active' : ''}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onToggleCompare(product);
                        }}
                        aria-pressed={isComparing}
                        title={t(isComparing ? "Remove from comparison" : "Compare")}
                      >
                        <Icon name="shuffle" width={13} height={13} /> {isComparing ? t("Comparing") : t("Compare")}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
