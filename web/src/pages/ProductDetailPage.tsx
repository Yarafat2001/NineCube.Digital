import { t, useLanguage } from '../i18n/language';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLowStockThreshold, useProduct, useProductReviews, useAddReview, useWishlist, useToggleWishlist } from '../api/hooks';
import { formatDateTime } from '../lib/helpers';
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

  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSuccess, setReviewSuccess] = useState(false);

  const productQuery = useProduct(Number.isFinite(productId) ? productId : null);
  const thresholdQuery = useLowStockThreshold();
  const reviewsQuery = useProductReviews(Number.isFinite(productId) ? productId : 0);
  const addReview = useAddReview(Number.isFinite(productId) ? productId : 0);
  const wishlistQuery = useWishlist();
  const toggleWishlist = useToggleWishlist();

  const product = productQuery.data;
  const threshold = thresholdQuery.data?.lowStockThreshold ?? 5;
  const ratingSummary = reviewsQuery.data;
  const isInWishlist = wishlistQuery.data?.some(item => item.productId === productId);

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReviewError(null);
    try {
      await addReview.mutateAsync({ rating: reviewRating, comment: reviewComment.trim() || undefined });
      setReviewComment('');
      setReviewSuccess(true);
      setTimeout(() => setReviewSuccess(false), 5000);
    } catch (err: any) {
      setReviewError(err.message ?? 'Failed to submit review.');
    }
  };

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

          <div className="row-between" style={{ alignItems: 'center' }}>
            {ratingSummary && ratingSummary.totalReviews > 0 ? (
              <div className="row" style={{ alignItems: 'center', gap: '6px', fontSize: 'var(--text-sm)' }}>
                <span style={{ color: '#f59e0b', fontWeight: 600 }}>★ {ratingSummary.averageRating.toFixed(1)}</span>
                <span className="muted">({ratingSummary.totalReviews} {t(ratingSummary.totalReviews === 1 ? 'review' : 'reviews')})</span>
              </div>
            ) : (
              <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>{t("No reviews yet")}</span>
            )}

            {hasRole('Customer') ? (
              <button
                type="button"
                className={`btn btn--sm ${isInWishlist ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => toggleWishlist.mutate(productId)}
                disabled={toggleWishlist.isPending}
                aria-label={t(isInWishlist ? 'Remove from wishlist' : 'Add to wishlist')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <span>{isInWishlist ? '♥' : '♡'}</span>
                <span>{t(isInWishlist ? 'Saved' : 'Wishlist')}</span>
              </button>
            ) : null}
          </div>

          <div className="product-detail__price-row" style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
            <span className="product-detail__price">{t(formatMoney(product.price, product.currency))}</span>
            {product.compareAtPrice && product.compareAtPrice > product.price ? (
              <>
                <span style={{ textDecoration: 'line-through', opacity: 0.6, fontSize: 'var(--text-base, 1rem)' }}>
                  {t(formatMoney(product.compareAtPrice, product.currency))}
                </span>
                <span className="badge" style={{ background: 'var(--ok-bg, #dcfce7)', color: 'var(--ok-text, #14532d)', fontSize: '0.8125rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>
                  -{Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)}% {t("OFF")}
                </span>
              </>
            ) : null}
          </div>
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

      {/* Customer Reviews & Feedback Section */}
      <section className="card-glass stack" style={{ marginTop: 'var(--space-6)', padding: 'var(--space-5)' }} aria-labelledby="reviews-heading">
        <div className="row-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 'var(--space-3)' }}>
          <div>
            <h2 id="reviews-heading" style={{ fontSize: 'var(--text-xl)', margin: 0 }}>{t("Customer Reviews & Ratings")}</h2>
            <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
              {ratingSummary && ratingSummary.totalReviews > 0
                ? `${ratingSummary.averageRating.toFixed(1)} out of 5 stars based on ${ratingSummary.totalReviews} customer feedback`
                : t("Be the first to review this product!")}
            </p>
          </div>
        </div>

        {/* Existing reviews */}
        <div className="reviews-list stack" style={{ gap: 'var(--space-3)', margin: 'var(--space-3) 0' }}>
          {ratingSummary && ratingSummary.recentReviews && ratingSummary.recentReviews.length > 0 ? (
            ratingSummary.recentReviews.map(r => (
              <div key={r.id} style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md, 8px)', background: 'var(--surface-muted, rgba(255,255,255,0.03))', border: '1px solid var(--border)' }}>
                <div className="row-between" style={{ marginBottom: '4px' }}>
                  <div className="row" style={{ alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 600 }}>{r.customerName}</span>
                    {r.isVerifiedBuyer ? (
                      <span className="badge badge--neutral" style={{ fontSize: '10px', padding: '2px 6px', color: 'var(--ok, #10b981)' }}>
                        ✓ {t("Verified Buyer")}
                      </span>
                    ) : null}
                  </div>
                  <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>{formatDateTime(r.createdAt)}</span>
                </div>
                <div style={{ color: '#f59e0b', fontSize: 'var(--text-sm)', marginBottom: '4px' }}>
                  {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                </div>
                {r.comment ? <p style={{ margin: 0, fontSize: 'var(--text-sm)' }}>{r.comment}</p> : null}
              </div>
            ))
          ) : (
            <p className="muted">{t("No customer reviews for this product yet.")}</p>
          )}
        </div>

        {/* Write a review form for customers */}
        {hasRole('Customer') ? (
          <form onSubmit={handleReviewSubmit} className="stack" style={{ marginTop: 'var(--space-4)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md, 8px)', background: 'var(--surface-muted, rgba(255,255,255,0.05))', border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 'var(--text-md)', margin: 0 }}>{t("Write a Review")}</h3>
            <div className="row" style={{ alignItems: 'center', gap: 'var(--space-2)' }}>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{t("Your Rating:")}</span>
              <div className="row" style={{ gap: '4px' }}>
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    type="button"
                    className="link-button"
                    style={{ fontSize: 'var(--text-lg)', color: star <= reviewRating ? '#f59e0b' : 'var(--muted)', cursor: 'pointer', padding: '0 2px' }}
                    onClick={() => setReviewRating(star)}
                    aria-label={`${star} stars`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>
            <textarea
              rows={3}
              placeholder={t("Share your thoughts about this product's quality, fit, and performance…")}
              value={reviewComment}
              onChange={e => setReviewComment(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: 'inherit' }}
            />
            {reviewError ? <p style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)', margin: 0 }}>{reviewError}</p> : null}
            {reviewSuccess ? <p style={{ color: 'var(--ok, #10b981)', fontSize: 'var(--text-sm)', margin: 0 }}>{t("Thank you! Your review has been submitted.")}</p> : null}
            <div>
              <button type="submit" className="btn btn--sm btn--primary" disabled={addReview.isPending}>
                {t(addReview.isPending ? 'Submitting…' : 'Submit Review')}
              </button>
            </div>
          </form>
        ) : null}
      </section>
    </div>
  );
}
