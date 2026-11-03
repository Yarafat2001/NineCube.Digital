import { t, useLanguage } from '../i18n/language';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Product } from '../api/types';
import { formatMoney } from '../lib/helpers';
import { Icon } from './Icon';
import { ProductThumbnail } from './ProductImage';
import { productSpecs } from '../lib/productSpecs';

export interface CompareTrayProps {
  items: Product[];
  onRemove: (productId: number) => void;
  onClear: () => void;
  onAddToCart: (product: Product) => void;
}

export function CompareTray({ items, onRemove, onClear, onAddToCart }: CompareTrayProps) {
  useLanguage();
  const [modalOpen, setModalOpen] = useState(false);
  const specs = items.map(item => productSpecs(item.specsJson));
  const specKeys = [...new Set(specs.flatMap(item => Object.keys(item)))];

  useEffect(() => {
    if (items.length === 0) setModalOpen(false);
  }, [items.length]);

  useEffect(() => {
    if (modalOpen) {
      document.documentElement.setAttribute('data-overlay-open', 'true');
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setModalOpen(false);
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        document.documentElement.removeAttribute('data-overlay-open');
      };
    }
  }, [modalOpen]);

  if (items.length === 0) return null;

  return (
    <>
      {/* Floating Dock at bottom center */}
      <div className="compare-dock" role="region" aria-label={t("Product Comparison")}>
        <div className="compare-dock__inner">
          <div className="compare-dock__thumbs">
            {items.map((item) => (
              <div key={item.id} className="compare-dock__thumb" title={item.name}>
                <ProductThumbnail
                  product={item}
                  url={item.imageUrl}
                  alt={item.name}
                  iconSize={14}
                />
                <button
                  type="button"
                  className="compare-dock__thumb-remove"
                  onClick={() => onRemove(item.id)}
                  aria-label={`${t("Remove")} ${item.name}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="compare-dock__info">
            <strong>{t("Compare")} ({items.length}/4)</strong>
          </div>

          <div className="row" style={{ gap: '6px' }}>
            <button
              type="button"
              className="btn btn--sm btn--primary compare-dock__open-btn"
              onClick={() => setModalOpen(true)}
            >
              ⇄ {t("View comparison")}
            </button>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={onClear}
              title={t("Clear comparison")}
            >
              ✕ {t("Clear all")}
            </button>
          </div>
        </div>
      </div>

      {/* Comparison Modal Overlay */}
      {modalOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="compare-modal-backdrop"
              onClick={() => setModalOpen(false)}
              role="presentation"
            >
              <div
                className="compare-modal"
                role="dialog"
                aria-modal="true"
                aria-label={t("Product Comparison")}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="compare-modal__header">
                  <div>
                    <h3 className="compare-modal__title">
                      ⇄ {t("Product Comparison")} ({items.length})
                    </h3>
                    <p className="muted" style={{ fontSize: 'var(--text-xs)', margin: 0 }}>
                      {t("Compare up to 4 products side by side to make the best choice.")}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    onClick={() => setModalOpen(false)}
                    aria-label={t("Close dialog")}
                  >
                    <Icon name="x" width={16} height={16} />
                  </button>
                </div>

                <div className="compare-modal__body">
                  <div
                    className="compare-grid"
                    style={{
                      gridTemplateColumns: `120px repeat(${items.length}, minmax(180px, 1fr))`
                    }}
                  >
                    {/* Header Row: Products */}
                    <div className="compare-cell compare-cell--label" />
                    {items.map((item) => (
                      <div key={item.id} className="compare-cell compare-cell--product">
                        <div className="compare-product-card">
                          <button
                            type="button"
                            className="compare-product-remove"
                            onClick={() => onRemove(item.id)}
                            aria-label={`${t("Remove")} ${item.name}`}
                          >
                            ✕
                          </button>
                          <div className="compare-product-media">
                            <ProductThumbnail
                              product={item}
                              url={item.imageUrl}
                              alt={item.name}
                              iconSize={24}
                            />
                          </div>
                          <div className="compare-product-name">{item.name}</div>
                          <button
                            type="button"
                            className="btn btn--sm btn--primary compare-product-cart-btn"
                            onClick={() => onAddToCart(item)}
                            disabled={!item.isActive || item.stockQuantity <= 0}
                          >
                            🛒 {t("Add to cart")}
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Price Row */}
                    <div className="compare-cell compare-cell--label">
                      <strong>{t("Price")}</strong>
                    </div>
                    {items.map((item) => (
                      <div key={item.id} className="compare-cell">
                        <span className="compare-price">{formatMoney(item.price, item.currency)}</span>
                        {item.compareAtPrice && item.compareAtPrice > item.price ? (
                          <span className="compare-old-price">
                            {formatMoney(item.compareAtPrice, item.currency)}
                          </span>
                        ) : null}
                      </div>
                    ))}

                    {/* Stock Row */}
                    <div className="compare-cell compare-cell--label">
                      <strong>{t("Stock")}</strong>
                    </div>
                    {items.map((item) => (
                      <div key={item.id} className="compare-cell">
                        {item.stockQuantity > 0 ? (
                          <span className="text-ok">✓ {item.stockQuantity} {t("In stock")}</span>
                        ) : (
                          <span className="text-bad">✕ {t("Out of stock")}</span>
                        )}
                      </div>
                    ))}

                    {/* Brand Row */}
                    <div className="compare-cell compare-cell--label">
                      <strong>{t("Brand")}</strong>
                    </div>
                    {items.map((item) => (
                      <div key={item.id} className="compare-cell">
                        {item.brandName ? <span>{item.brandName}</span> : <span className="muted">—</span>}
                      </div>
                    ))}

                    {/* Category Row */}
                    <div className="compare-cell compare-cell--label">
                      <strong>{t("Category")}</strong>
                    </div>
                    {items.map((item) => (
                      <div key={item.id} className="compare-cell">
                        {item.categories?.[0] ? <span>{item.categories[0].name}</span> : <span className="muted">—</span>}
                      </div>
                    ))}

                    {specKeys.map(key => <div key={key} style={{ display: 'contents' }}>
                      <div className="compare-cell compare-cell--label"><strong>{key}</strong></div>
                      {items.map((item, index) => <div className="compare-cell" key={item.id}>{specs[index][key] ?? '—'}</div>)}
                    </div>)}
                    {/* Tags / Specs Row */}
                    <div className="compare-cell compare-cell--label">
                      <strong>{t("Tags")}</strong>
                    </div>
                    {items.map((item) => (
                      <div key={item.id} className="compare-cell">
                        <div className="row" style={{ gap: '4px', flexWrap: 'wrap' }}>
                          {(item.tags ?? []).map((tag) => (
                            <span key={tag} className="filter-chip" style={{ fontSize: '10px', padding: '2px 6px' }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
