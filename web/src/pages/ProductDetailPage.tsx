import { t, useLanguage } from '../i18n/language';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLowStockThreshold, useProduct } from '../api/hooks';
import { EmptyState, ErrorState, LoadingBlock, QuantityStepper, StockBadge } from '../components/ui';
import { ProductViewer } from '../components/ProductViewer';
import { cardPresentation } from '../lib/catalog';
import { formatMoney } from '../lib/helpers';
import { useAuth } from '../state/AuthContext';
import { useCart } from '../state/CartContext';

/**
 * The detail page is where the full record lives: the untruncated name, the SKU with a copy button,
 * the whole image gallery and the description. Cards deliberately show far less.
 */
export function ProductDetailPage() {
  useLanguage();
  const { id } = useParams();
  const productId = Number(id);
  const { hasRole } = useAuth();
  const cart = useCart();
  const [quantity, setQuantity] = useState(1);
  const [copied, setCopied] = useState(false);
  const [added, setAdded] = useState(false);

  const productQuery = useProduct(Number.isFinite(productId) ? productId : null);
  const thresholdQuery = useLowStockThreshold();
  const product = productQuery.data;
  const threshold = thresholdQuery.data?.lowStockThreshold ?? 5;

  if (productQuery.isLoading) return <div className="page container"><LoadingBlock label={t("Loading product")} variant="tile" count={2} /></div>;

  if (productQuery.isError) {
    return (
      <div className="page container">
        <ErrorState error={productQuery.error} onRetry={() => void productQuery.refetch()} />
        <Link className="btn" to="/products">{t("Back to catalogue")}</Link>
      </div>
    );
  }

  if (!product) {
    return <div className="page container"><EmptyState title={t("Product not found")} description={t("It may have been removed from the catalogue.")} action={<Link className="btn" to="/products">{t("Back to catalogue")}</Link>} /></div>;
  }

  const { brand, fullName, variant } = cardPresentation(product);
  const outOfStock = !product.isActive || product.stockQuantity <= 0;

  const copySku = async () => {
    try {
      await navigator.clipboard.writeText(product.sku);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // A blocked clipboard API leaves the SKU selectable and copyable by hand.
    }
  };

  return (
    <div className="page container product-detail-page">
      <nav aria-label={t("Breadcrumb")} className="category-breadcrumb">
        <Link to="/">{t("Home")}</Link><span aria-hidden="true">{t("›")}</span>
        <Link to="/products">{t("Catalogue")}</Link>
        {product.categories?.[0] ? <><span aria-hidden="true">{t("›")}</span><Link to={`/products?category=${encodeURIComponent(product.categories[0].slug)}`}>{t(product.categories[0].name)}</Link></> : null}
        <span aria-hidden="true">{t("›")}</span><span>{t(fullName)}</span>
      </nav>

      <div className="product-detail">
        <div className="product-detail__gallery">
          <ProductViewer key={product.id} product={product} />
        </div>

        <section className="product-detail__summary card-glass stack" aria-label={t("Product details")}>
          <div>
            {brand ? <p className="product-card__brand">{t(brand)}</p> : null}
            <h1>{t(fullName)}</h1>
            {variant ? <p className="muted">{t(variant)}</p> : null}
          </div>

          <div className="sku-line">
            <span className="muted">{t("SKU")}</span>
            <code>{t(product.sku)}</code>
            <button type="button" className="btn btn--sm" onClick={() => void copySku()} aria-label={t(`Copy SKU ${product.sku}`)}>
              {t(copied ? 'Copied' : 'Copy')}
            </button>
          </div>

          <p className="product-detail__price">{t(formatMoney(product.price, product.currency))}</p>
          <StockBadge product={product} threshold={threshold} />

          <div className="product-detail__description"><h2>{t("About this product")}</h2>{product.description ? <p>{t(product.description)}</p> : <p className="muted">{t("No description yet.")}</p>}</div>

          {product.categories && product.categories.length > 0 ? (
            <div className="filter-chips" aria-label={t("Categories")}>
              {product.categories.map(c => <Link className="filter-chip" key={c.id} to={`/products?category=${encodeURIComponent(c.slug)}`}>{t(c.name)}{t(c.isPrimary ? ' · primary' : '')}</Link>)}
            </div>
          ) : null}

          {product.tags && product.tags.length > 0 ? (
            <div className="filter-chips" aria-label={t("Tags")}>
              {product.tags.map(tag => <Link className="filter-chip" key={tag} to={`/products?tag=${encodeURIComponent(tag)}`}>{t(tag)}</Link>)}
            </div>
          ) : null}

          {outOfStock ? (
            <p className="muted">{t("Not currently orderable.")}</p>
          ) : hasRole('Customer') ? (
            <div className="product-detail__purchase">
              <QuantityStepper value={quantity} max={product.stockQuantity} onChange={setQuantity} label={t(fullName)} />
              <button type="button" className="btn btn--primary" onClick={() => { cart.add(product, quantity); setQuantity(1); setAdded(true); }}>{t("Add to cart")}</button>
            </div>
          ) : null}

          {added ? <div className="product-detail__added" role="status">{t("Added to your cart.")}<button className="btn btn--sm" type="button" onClick={() => document.dispatchEvent(new CustomEvent('ninecube:open-cart-sheet'))}>{t("View cart")}</button></div> : null}
          <div className="row">
            <Link className="btn btn--ghost" to="/products">{t("Back to catalogue")}</Link>
            {hasRole('InventoryManager') ? <Link className="link-button" to="/inventory" state={{ editProductId: product.id }}>{t("Edit in Inventory")}</Link> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
