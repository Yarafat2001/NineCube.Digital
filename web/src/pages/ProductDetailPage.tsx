import { t, useLanguage } from '../i18n/language';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLowStockThreshold, useProduct, useProductReviews, useAddReview, useWishlist, useToggleWishlist, useProducts } from '../api/hooks';
import { formatDateTime } from '../lib/helpers';
import { EmptyState, ErrorState, LoadingBlock, QuantityStepper, StockBadge, useToast } from '../components/ui';
import { RecentlyViewed } from '../components/RecentlyViewed';
import { StockAlertModal } from '../components/StockAlertModal';
import { useRestockSubscriptions } from '../api/hooks';
import { Icon } from '../components/Icon';
import { recordRecentView } from '../lib/recentViews';
import { ProductViewer } from '../components/ProductViewer';
import { SavingsNote, productSavings } from '../components/SavingsNote';
import { primaryImage, ProductImage, ProductThumbnail } from '../components/ProductImage';
import { resolveDualProductImages } from '../lib/catalogImages';
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
  const navigate = useNavigate();
  const productId = Number(id);
  const { hasRole, user } = useAuth();
  const cart = useCart();
  const toast = useToast();
  const [showStockAlert, setShowStockAlert] = useState(false);
  const restockSubscriptions = useRestockSubscriptions();
  const isAlertSubscribed = restockSubscriptions.data?.includes(productId) ?? false;
  const [quantity, setQuantity] = useState(1);
  const [copied, setCopied] = useState(false);
  const [added, setAdded] = useState(false);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const purchaseRef = useRef<HTMLDivElement>(null);

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

  const primaryCategory = product?.categories?.find(c => c.isPrimary) ?? product?.categories?.[0];
  const relatedCategorySlug = primaryCategory?.slug ?? '';
  const relatedQuery = useProducts({
    q: '',
    categorySlug: relatedCategorySlug || undefined,
    page: 1,
    pageSize: 6
  });

  const relatedProducts = useMemo(() => {
    return (relatedQuery.data?.items ?? [])
      .filter(p => p.id !== productId && p.isActive && p.stockQuantity > 0)
      .slice(0, 4);
  }, [relatedQuery.data, productId]);

  useEffect(() => {
    const handleScroll = () => {
      if (!purchaseRef.current) return;
      const rect = purchaseRef.current.getBoundingClientRect();
      setShowStickyBar(rect.bottom < 60);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [product?.id]);

  // The sticky dock rises into the band the Copilot pill is docked in, so the page tells the
  // shell it is up: without this the pill lands on the dock's own Add to cart button - two
  // tap targets stacked, the lower one unreachable.
  useEffect(() => {
    const root = document.documentElement;
    if (showStickyBar) root.dataset.pdpSticky = 'true';
    else delete root.dataset.pdpSticky;
    return () => { delete root.dataset.pdpSticky; };
  }, [showStickyBar]);

  useEffect(() => {
    if (!product) return;
    // SEO and the recently-viewed strip use the same real photo the page shows; generated art is
    // not a product photograph and must not be shared as the OpenGraph image.
    const resolvedPhoto = resolveDualProductImages(product).primaryUrl;
    recordRecentView({
      ...product,
      imageUrl: resolvedPhoto ?? undefined
    });

    // Dynamic Title & OpenGraph SEO Metadata
    document.title = `${product.name} | NineCube Digital`;

    const setMeta = (property: string, content: string) => {
      let meta = document.querySelector(`meta[property="${property}"], meta[name="${property}"]`) as HTMLMetaElement | null;
      if (!meta) {
        meta = document.createElement('meta');
        if (property.startsWith('og:') || property.startsWith('product:')) {
          meta.setAttribute('property', property);
        } else {
          meta.setAttribute('name', property);
        }
        document.head.appendChild(meta);
      }
      meta.content = content;
    };

    setMeta('og:title', product.name);
    setMeta('og:description', product.description || `${product.name} available at NineCube Digital`);
    if (resolvedPhoto) setMeta('og:image', resolvedPhoto);
    setMeta('og:price:amount', product.price.toString());
    setMeta('og:price:currency', product.currency ?? 'BDT');
    setMeta('og:type', 'product');
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', product.name);

    // Schema.org Product JSON-LD structured data for search engine rich snippets
    const ldJson = {
      '@context': 'https://schema.org/',
      '@type': 'Product',
      name: product.name,
      image: resolvedPhoto ? [resolvedPhoto] : [],
      description: product.description || product.name,
      sku: product.sku,
      offers: {
        '@type': 'Offer',
        url: window.location.href,
        priceCurrency: product.currency,
        price: product.price,
        availability: product.stockQuantity > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        seller: {
          '@type': 'Organization',
          name: 'NineCube Digital'
        }
      },
      ...(ratingSummary?.totalReviews ? {
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: ratingSummary.averageRating,
          reviewCount: ratingSummary.totalReviews
        }
      } : {})
    };

    let scriptTag = document.getElementById('schema-product-ldjson') as HTMLScriptElement | null;
    if (!scriptTag) {
      scriptTag = document.createElement('script');
      scriptTag.id = 'schema-product-ldjson';
      scriptTag.type = 'application/ld+json';
      document.head.appendChild(scriptTag);
    }
    scriptTag.text = JSON.stringify(ldJson);

    return () => {
      scriptTag?.remove();
    };
  }, [product, ratingSummary]);

  const handleShare = async () => {
    const url = window.location.href;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: product?.name ?? 'NineCube.Digital',
          text: product?.name,
          url
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.push('success', t("Product link copied to clipboard!"));
    } catch {
      toast.push('info', url);
    }
  };

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

          <div className="row-between pdp-meta-row">
            {ratingSummary && ratingSummary.totalReviews > 0 ? (
              <p className="pdp-rating">
                <span className="pdp-rating__score">★ {ratingSummary.averageRating.toFixed(1)}</span>
                <span className="muted">({ratingSummary.totalReviews} {t(ratingSummary.totalReviews === 1 ? 'review' : 'reviews')})</span>
              </p>
            ) : (
              <span className="muted pdp-rating--empty">{t("No reviews yet")}</span>
            )}

            <div className="pdp-meta-row__actions">
              {!user || hasRole('Customer') ? (
                <button
                  type="button"
                  className={`btn btn--sm pdp-chip-btn ${isInWishlist ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => {
                    if (!user) {
                      toast.push('info', t('Please sign in to save items to your wishlist.'));
                      navigate('/login');
                      return;
                    }
                    toggleWishlist.mutate(productId, {
                      onSuccess: (data) => {
                        if (data.inWishlist) {
                          toast.push('success', `${t("Added")} ${product?.name ?? ''} ${t("to your wishlist.")}`);
                        } else {
                          toast.push('info', `${t("Removed")} ${product?.name ?? ''} ${t("from your wishlist.")}`);
                        }
                      },
                      onError: () => {
                        toast.push('error', t('Could not update wishlist. Please try again.'));
                      }
                    });
                  }}
                  disabled={toggleWishlist.isPending}
                  aria-label={t(isInWishlist ? 'Remove from wishlist' : 'Add to wishlist')}
                >
                  <Icon name="heart" width={15} height={15} fill={isInWishlist ? 'currentColor' : 'none'} />
                  <span>{t(isInWishlist ? 'Saved' : 'Wishlist')}</span>
                </button>
              ) : null}

              <button
                type="button"
                className="btn btn--sm btn--ghost pdp-chip-btn"
                onClick={handleShare}
                aria-label={t("Share product")}
                title={t("Share or copy link")}
              >
                <Icon name="share" width={15} height={15} />
                <span>{t("Share")}</span>
              </button>
            </div>
          </div>

          <div className="product-detail__price-row">
            <span className="product-detail__price">{t(formatMoney(product.price, product.currency))}</span>
            {product.compareAtPrice && product.compareAtPrice > product.price ? (
              <span className="pdp-price-meta">
                <span className="pdp-price-compare">{t(formatMoney(product.compareAtPrice, product.currency))}</span>
                <span className="badge badge--ok">
                  -{Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)}% {t("OFF")}
                </span>
              </span>
            ) : null}
            <SavingsNote amount={productSavings(product)} currency={product.currency} />
          </div>
          <StockBadge product={product} threshold={threshold} />

          {/* Regional Fulfillment & Trust Strip */}
          <div className="pdp-trust-grid" role="region" aria-label={t("Fulfillment & guarantees")}>
            <div className="pdp-trust-item">
              <span className="pdp-trust-icon"><Icon name="truck" width={18} height={18} /></span>
              <div>
                <strong>{t("Fast Regional Delivery")}</strong>
                <p>{t("24–48h Dhaka · 3–5 days Nationwide")}</p>
              </div>
            </div>
            <div className="pdp-trust-item">
              <span className="pdp-trust-icon"><Icon name="card" width={18} height={18} /></span>
              <div>
                <strong>{t("Cash on Delivery (COD)")}</strong>
                <p>{t("bKash, Nagad, Visa & Mastercard")}</p>
              </div>
            </div>
            <div className="pdp-trust-item">
              <span className="pdp-trust-icon"><Icon name="shield" width={18} height={18} /></span>
              <div>
                <strong>{t("100% Genuine Guaranteed")}</strong>
                <p>{t("Direct warehouse stock verification")}</p>
              </div>
            </div>
            <div className="pdp-trust-item">
              <span className="pdp-trust-icon"><Icon name="shuffle" width={18} height={18} /></span>
              <div>
                <strong>{t("7-Day Easy Returns")}</strong>
                <p>{t("Instant replacement or refund")}</p>
              </div>
            </div>
          </div>

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
            <div className="product-detail__out-of-stock-box">
              <p className="muted">{t("Not currently orderable.")}</p>
              <button
                type="button"
                className="btn btn--sm btn--outline pdp-chip-btn"
                onClick={() => setShowStockAlert(true)}
                aria-label={t("Notify me when available")}
              >
                <Icon name={isAlertSubscribed ? 'check' : 'bell'} width={15} height={15} />
                <span>{isAlertSubscribed ? t("Subscribed to restock alerts") : t("Notify Me When in Stock")}</span>
              </button>
            </div>
          ) : !user || hasRole('Customer') ? (
            <div className="product-detail__purchase" ref={purchaseRef}>
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

      {/* Related Products Recommendation Carousel/Grid */}
      {relatedProducts.length > 0 ? (
        <section className="card-glass pdp-related-section" aria-labelledby="related-products-heading">
          <div className="row-between pdp-section-head">
            <div>
              <h2 id="related-products-heading" className="pdp-section-head__title">{t("You May Also Like")}</h2>
              <p className="muted pdp-section-head__sub">{t("More popular picks from this category")}</p>
            </div>
            <Link to={`/products?category=${encodeURIComponent(relatedCategorySlug)}`} className="btn btn--sm btn--ghost">
              {t("View all")} →
            </Link>
          </div>
          <div className="pdp-related-grid">
            {relatedProducts.map(item => {
              const meta = cardPresentation(item);
              return (
                <Link
                  key={item.id}
                  to={`/products/${item.slug}`}
                  className="pdp-related-card"
                  aria-label={t(`${item.name}, ${formatMoney(item.price, item.currency)}`)}
                >
                  <div className="pdp-related-card__image">
                    <ProductImage product={item} images={item.images} frame="card" />
                  </div>
                  <div className="pdp-related-card__content">
                    <span className="pdp-related-card__brand muted">{t(meta.brand ?? '')}</span>
                    <h3 className="pdp-related-card__title">{t(item.name)}</h3>
                    <div className="pdp-related-card__price">
                      <strong>{t(formatMoney(item.price, item.currency))}</strong>
                      {item.compareAtPrice && item.compareAtPrice > item.price ? (
                        <span className="pdp-related-card__compare muted">
                          {t(formatMoney(item.compareAtPrice, item.currency))}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Customer Reviews & Feedback Section */}
      <section className="card-glass stack pdp-reviews" aria-labelledby="reviews-heading">
        <div className="row-between pdp-section-head">
          <div>
            <h2 id="reviews-heading" className="pdp-section-head__title">{t("Customer Reviews & Ratings")}</h2>
            <p className="muted pdp-section-head__sub">
              {ratingSummary && ratingSummary.totalReviews > 0
                ? `${ratingSummary.averageRating.toFixed(1)} out of 5 stars based on ${ratingSummary.totalReviews} customer feedback`
                : t("Be the first to review this product!")}
            </p>
          </div>
        </div>

        {/* Existing reviews */}
        <div className="reviews-list">
          {ratingSummary && ratingSummary.recentReviews && ratingSummary.recentReviews.length > 0 ? (
            ratingSummary.recentReviews.map(r => (
              <div key={r.id} className="pdp-review">
                <div className="row-between pdp-review__head">
                  <div className="pdp-review__who">
                    <span className="pdp-review__author">{r.customerName}</span>
                    {r.isVerifiedBuyer ? (
                      <span className="badge badge--ok">
                        <Icon name="check" width={12} height={12} />{t("Verified Buyer")}
                      </span>
                    ) : null}
                  </div>
                  <span className="muted pdp-review__date">{formatDateTime(r.createdAt)}</span>
                </div>
                <div className="pdp-review__stars" aria-hidden="true">
                  {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                </div>
                {r.comment ? <p className="pdp-review__body">{r.comment}</p> : null}
              </div>
            ))
          ) : (
            <p className="muted">{t("No customer reviews for this product yet.")}</p>
          )}
        </div>

        {/* Write a review form for customers */}
        {hasRole('Customer') ? (
          <form onSubmit={handleReviewSubmit} className="stack pdp-review-form">
            <h3 className="pdp-review-form__title">{t("Write a Review")}</h3>
            <div className="pdp-review-form__rating">
              <span className="pdp-review-form__label">{t("Your Rating:")}</span>
              <div className="pdp-review-form__stars" role="group" aria-label={t("Your Rating:")}>
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    type="button"
                    className="pdp-star"
                    aria-pressed={star <= reviewRating}
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
              className="pdp-review-form__input"
              placeholder={t("Share your thoughts about this product's quality, fit, and performance…")}
              value={reviewComment}
              onChange={e => setReviewComment(e.target.value)}
            />
            {reviewError ? <p className="pdp-review-form__error">{reviewError}</p> : null}
            {reviewSuccess ? <p className="pdp-review-form__ok">{t("Thank you! Your review has been submitted.")}</p> : null}
            <div>
              <button type="submit" className="btn btn--sm btn--primary" disabled={addReview.isPending}>
                {t(addReview.isPending ? 'Submitting…' : 'Submit Review')}
              </button>
            </div>
          </form>
        ) : null}
      </section>

      {showStockAlert && product ? (
        <StockAlertModal
          product={product}
          onClose={() => setShowStockAlert(false)}
          onSubscribed={() => void restockSubscriptions.refetch()}
        />
      ) : null}

      <RecentlyViewed currentProductId={productId} />

      {/* Mobile / Compact Sticky Purchase Dock */}
      {product && !outOfStock && (!user || hasRole('Customer')) ? (
        <div
          className={`pdp-sticky-bar ${showStickyBar ? 'pdp-sticky-bar--visible' : ''}`}
          role="region"
          aria-label={t("Quick purchase")}
        >
          <div className="pdp-sticky-bar__container">
            <div className="pdp-sticky-bar__thumb">
              <ProductThumbnail url={primaryImage(product)} alt={product.name} />
            </div>
            <div className="pdp-sticky-bar__info">
              <strong className="pdp-sticky-bar__title">{t(product.name)}</strong>
              <div className="pdp-sticky-bar__prices">
                <span className="pdp-sticky-bar__price">{t(formatMoney(product.price, product.currency))}</span>
                <SavingsNote amount={productSavings(product)} currency={product.currency} />
              </div>
            </div>
            <div className="pdp-sticky-bar__action">
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => {
                  cart.add(product, 1);
                  setAdded(true);
                }}
              >
                {t("Add to cart")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
