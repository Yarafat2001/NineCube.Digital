import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Product } from '../../api/types';
import { formatMoney } from '../../lib/helpers';
import { useCart } from '../../state/CartContext';
import { t, useLanguage } from '../../i18n/language';
import { ProductThumbnail } from '../ProductImage';
import { Icon } from '../Icon';

export function AgentProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  useLanguage();
  const [added, setAdded] = useState(false);

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (product.stockQuantity > 0) {
      add(product, 1);
      setAdded(true);
      setTimeout(() => setAdded(false), 1600);
    }
  };

  const isLowStock = product.stockQuantity > 0 && product.stockQuantity <= 5;
  const isOutOfStock = product.stockQuantity < 1;

  return (
    <div className="agent-product-card card-glass">
      <Link to={`/products/${product.id}`} className="agent-product-card__image-wrap">
        <ProductThumbnail
          product={product}
          url={product.imageUrl}
          alt={product.name}
          className="agent-product-card__thumb"
          iconSize={24}
        />
        {isLowStock && (
          <span className="agent-product-card__stock-tag agent-product-card__stock-tag--low">
            ⚡ {product.stockQuantity} {t("left")}
          </span>
        )}
        {isOutOfStock && (
          <span className="agent-product-card__stock-tag agent-product-card__stock-tag--out">
            {t("Out of stock")}
          </span>
        )}
      </Link>

      <div className="agent-product-card__content">
        {product.brandName && (
          <span className="agent-product-card__brand">{product.brandName}</span>
        )}
        <h4 className="agent-product-card__title">
          <Link to={`/products/${product.id}`} title={product.name}>
            {product.name}
          </Link>
        </h4>

        <div className="agent-product-card__price-row">
          <span className="agent-product-card__price">
            {formatMoney(product.price, product.currency)}
          </span>
          {product.compareAtPrice && product.compareAtPrice > product.price && (
            <span className="agent-product-card__compare-price">
              {formatMoney(product.compareAtPrice, product.currency)}
            </span>
          )}
        </div>

        <div className="agent-product-card__actions">
          <button
            type="button"
            className={`btn btn--sm ${added ? 'btn--success' : 'btn--primary'} agent-product-card__add-btn`}
            onClick={handleAdd}
            disabled={isOutOfStock}
            aria-label={`${t("Add to cart")} - ${product.name}`}
          >
            {added ? (
              <>
                <span aria-hidden="true">✓</span> {t("Added!")}
              </>
            ) : isOutOfStock ? (
              t("Sold out")
            ) : (
              <>
                <Icon name="cart" width={13} height={13} />
                <span>{t("Add to cart")}</span>
              </>
            )}
          </button>
          <Link
            to={`/products/${product.id}`}
            className="btn btn--ghost btn--sm agent-product-card__view-btn"
            title={t("View details")}
          >
            <Icon name="eye" width={13} height={13} />
            <span>{t("Details")}</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
