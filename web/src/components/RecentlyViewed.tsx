import { t, useLanguage } from '../i18n/language';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client';
import type { Product } from '../api/types';
import { clearRecentViews, getRecentViews } from '../lib/recentViews';
import { formatMoney } from '../lib/helpers';
import { useCart } from '../state/CartContext';
import { useToast } from './ui';
import { Icon } from './Icon';
import { ProductThumbnail, primaryImage } from './ProductImage';

export interface RecentlyViewedProps {
  currentProductId?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function RecentlyViewed({ currentProductId, className = '', style }: RecentlyViewedProps) {
  useLanguage();
  const [items, setItems] = useState<Product[]>(() => {
    const list = getRecentViews();
    return currentProductId ? list.filter((p) => p.id !== currentProductId) : list;
  });
  const cart = useCart();
  const toast = useToast();
  const navigate = useNavigate();
  const [addingId, setAddingId] = useState<number | null>(null);

  const addCurrentProduct = async (id: number) => {
    if (addingId !== null) return;
    setAddingId(id);
    try {
      const product = await apiRequest<Product>(`/api/products/${id}`);
      if (product.hasVariants) { navigate(`/products/${id}`); return; }
      if (!product.isActive || product.stockQuantity <= 0) { toast.push('info', t('These items are currently unavailable.')); return; }
      cart.add(product, 1);
      toast.push('success', `${t("Added")} ${product.name} ${t("to your cart.")}`);
    } catch (error) { toast.pushError(error); }
    finally { setAddingId(null); }
  };

  const refresh = () => {
    const list = getRecentViews();
    setItems(currentProductId ? list.filter((p) => p.id !== currentProductId) : list);
  };

  useEffect(() => {
    refresh();
    const handleUpdate = () => refresh();
    window.addEventListener('ninecube:recent-views-updated', handleUpdate);
    return () => window.removeEventListener('ninecube:recent-views-updated', handleUpdate);
  }, [currentProductId]);

  if (items.length === 0) return null;

  return (
    <section
      className={`card-glass recently-viewed ${className}`}
      style={style}
      aria-labelledby="recent-views-heading"
      data-testid="recently-viewed-section"
    >
      <div className="recently-viewed__header">
        <div className="recently-viewed__title-wrap">
          <Icon name="clock" width={16} height={16} className="recently-viewed__icon" />
          <h3 id="recent-views-heading" className="recently-viewed__title">
            {t("Recently Viewed Products")}
          </h3>
        </div>
        <button
          type="button"
          className="link-button recently-viewed__clear-btn"
          onClick={() => {
            clearRecentViews();
            setItems([]);
          }}
          aria-label={t("Clear recently viewed history")}
        >
          {t("Clear history")}
        </button>
      </div>

      <div className="recently-viewed__grid">
        {items.map((product) => {
          const inStock = product.isActive && product.stockQuantity > 0;
          return (
            <div key={product.id} className="recently-viewed__card">
              <Link
                to={`/products/${product.id}`}
                className="recently-viewed__thumb-link"
                aria-label={product.name}
              >
                <ProductThumbnail
                  product={product}
                  url={product.imageUrl || primaryImage(product)}
                  alt={product.name}
                  className="recently-viewed__img"
                  iconSize={22}
                />
              </Link>

              <div className="recently-viewed__body">
                {product.brandName ? (
                  <span className="recently-viewed__brand">{product.brandName}</span>
                ) : null}
                <Link
                  to={`/products/${product.id}`}
                  className="recently-viewed__name"
                  title={product.name}
                >
                  {product.name}
                </Link>
                <div className="recently-viewed__price-row">
                  <span className="recently-viewed__price">
                    {formatMoney(product.price, product.currency)}
                  </span>
                </div>
              </div>

              {product.hasVariants ? <Link className="btn btn--primary recently-viewed__add-btn" to={`/products/${product.id}`}>{t('Choose options')}</Link> : inStock ? (
                <button
                  type="button"
                  className="btn btn--xs btn--primary recently-viewed__add-btn"
                  disabled={addingId !== null}
                  onClick={() => void addCurrentProduct(product.id)}
                  aria-label={`${t("Add")} ${product.name}`}
                >
                  + {t("Add to cart")}
                </button>
              ) : (
                <span className="recently-viewed__sold-out">{t("Sold out")}</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
