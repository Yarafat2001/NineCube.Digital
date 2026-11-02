import { t, useLanguage } from '../i18n/language';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import type { Product } from '../api/types';
import { formatMoney } from '../lib/helpers';
import { ProductImage } from './ProductImage';
import { QuantityStepper, StockBadge } from './ui';
import { Icon } from './Icon';

export interface QuickViewModalProps {
  product: Product;
  onClose: () => void;
  onAdded: (product: Product, quantity: number) => void;
  threshold?: number;
}

export function QuickViewModal({ product, onClose, onAdded, threshold = 5 }: QuickViewModalProps) {
  useLanguage();
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const outOfStock = !product.isActive || product.stockQuantity <= 0;

  useEffect(() => {
    document.documentElement.setAttribute('data-overlay-open', 'true');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.documentElement.removeAttribute('data-overlay-open');
    };
  }, [onClose]);

  const discountPercent =
    product.compareAtPrice && product.compareAtPrice > product.price
      ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)
      : 0;

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="quickview-modal card-glass"
        role="dialog"
        aria-modal="true"
        aria-label={`${t("Quick view:")} ${product.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="quickview-modal__header">
          <span className="quickview-modal__pill">
            <Icon name="eye" width={14} height={14} /> {t("Quick View")}
          </span>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={onClose}
            aria-label={t("Close dialog")}
          >
            <Icon name="x" width={16} height={16} />
          </button>
        </div>

        <div className="quickview-modal__grid">
          <div className="quickview-modal__media">
            <ProductImage product={product} />
            {discountPercent > 0 && (
              <span className="product-card__badge-overlay product-card__badge-overlay--discount">
                -{discountPercent}%
              </span>
            )}
          </div>

          <div className="quickview-modal__info stack">
            <div>
              {product.brandName ? (
                <p className="product-card__brand" style={{ margin: '0 0 4px' }}>
                  {product.brandName}
                </p>
              ) : null}
              <h2 className="quickview-modal__title">{product.name}</h2>
              <div className="row" style={{ alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>{t("SKU:")}</span>
                <code className="mono" style={{ fontSize: 'var(--text-xs)' }}>{product.sku}</code>
                <StockBadge product={product} threshold={threshold} />
              </div>
            </div>

            <div className="quickview-modal__price-row">
              <span className="quickview-modal__price">
                {formatMoney(product.price, product.currency)}
              </span>
              {product.compareAtPrice && product.compareAtPrice > product.price ? (
                <span className="quickview-modal__compare-price">
                  {formatMoney(product.compareAtPrice, product.currency)}
                </span>
              ) : null}
            </div>

            {product.description ? (
              <p className="quickview-modal__desc muted">
                {product.description.slice(0, 180)}
                {product.description.length > 180 ? '…' : ''}
              </p>
            ) : null}

            {outOfStock ? (
              <p className="muted" style={{ fontSize: 'var(--text-sm)', margin: '8px 0' }}>
                {t("Not currently orderable.")}
              </p>
            ) : (
              <div className="row" style={{ alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                <QuantityStepper
                  value={quantity}
                  max={product.stockQuantity}
                  onChange={setQuantity}
                  label={product.name}
                />
                <button
                  type="button"
                  className={`btn btn--primary ${justAdded ? 'btn--success' : ''}`}
                  onClick={() => {
                    onAdded(product, quantity);
                    setJustAdded(true);
                    setTimeout(() => setJustAdded(false), 1400);
                  }}
                >
                  {justAdded ? `✓ ${t("Added!")}` : `🛒 ${t("Add to cart")}`}
                </button>
              </div>
            )}

            <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
              <Link
                to={`/products/${product.id}`}
                className="link-button"
                onClick={onClose}
              >
                {t("View Full Product Details →")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
