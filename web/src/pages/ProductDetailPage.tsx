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

  if (productQuery.isLoading) return <div className="page container"><LoadingBlock label="Loading product" variant="tile" count={2} /></div>;

  if (productQuery.isError) {
    return (
      <div className="page container">
        <ErrorState error={productQuery.error} onRetry={() => void productQuery.refetch()} />
        <Link className="btn" to="/products">Back to catalogue</Link>
      </div>
    );
  }

  if (!product) {
    return <div className="page container"><EmptyState title="Product not found" description="It may have been removed from the catalogue." action={<Link className="btn" to="/products">Back to catalogue</Link>} /></div>;
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
      <nav aria-label="Breadcrumb" className="category-breadcrumb">
        <Link to="/">Home</Link><span aria-hidden="true">›</span>
        <Link to="/products">Catalogue</Link>
        {product.categories?.[0] ? <><span aria-hidden="true">›</span><Link to={`/products?category=${encodeURIComponent(product.categories[0].slug)}`}>{product.categories[0].name}</Link></> : null}
        <span aria-hidden="true">›</span><span>{fullName}</span>
      </nav>

      <div className="product-detail">
        <div className="product-detail__gallery">
          <ProductViewer key={product.id} product={product} />
        </div>

        <section className="product-detail__summary card-glass stack" aria-label="Product details">
          <div>
            {brand ? <p className="product-card__brand">{brand}</p> : null}
            <h1>{fullName}</h1>
            {variant ? <p className="muted">{variant}</p> : null}
          </div>

          <div className="sku-line">
            <span className="muted">SKU</span>
            <code>{product.sku}</code>
            <button type="button" className="btn btn--sm" onClick={() => void copySku()} aria-label={`Copy SKU ${product.sku}`}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <p className="product-detail__price">{formatMoney(product.price, product.currency)}</p>
          <StockBadge product={product} threshold={threshold} />

          <div className="product-detail__description"><h2>About this product</h2>{product.description ? <p>{product.description}</p> : <p className="muted">No description yet.</p>}</div>

          {product.categories && product.categories.length > 0 ? (
            <div className="filter-chips" aria-label="Categories">
              {product.categories.map(c => <Link className="filter-chip" key={c.id} to={`/products?category=${encodeURIComponent(c.slug)}`}>{c.name}{c.isPrimary ? ' · primary' : ''}</Link>)}
            </div>
          ) : null}

          {product.tags && product.tags.length > 0 ? (
            <div className="filter-chips" aria-label="Tags">
              {product.tags.map(tag => <Link className="filter-chip" key={tag} to={`/products?tag=${encodeURIComponent(tag)}`}>{tag}</Link>)}
            </div>
          ) : null}

          {outOfStock ? (
            <p className="muted">Not currently orderable.</p>
          ) : hasRole('Customer') ? (
            <div className="product-detail__purchase">
              <QuantityStepper value={quantity} max={product.stockQuantity} onChange={setQuantity} label={fullName} />
              <button type="button" className="btn btn--primary" onClick={() => { cart.add(product, quantity); setQuantity(1); setAdded(true); }}>Add to cart</button>
            </div>
          ) : null}

          {added ? <div className="product-detail__added" role="status">Added to your cart.<button className="btn btn--sm" type="button" onClick={() => document.dispatchEvent(new CustomEvent('ninecube:open-cart-sheet'))}>View cart</button></div> : null}
          <div className="row">
            <Link className="btn btn--ghost" to="/products">Back to catalogue</Link>
            {hasRole('InventoryManager') ? <Link className="link-button" to="/inventory" state={{ editProductId: product.id }}>Edit in Inventory</Link> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
