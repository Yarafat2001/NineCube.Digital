import { t, useLanguage } from '../i18n/language';
import { Link } from 'react-router-dom';
import { useWishlist, useToggleWishlist } from '../api/hooks';
import { EmptyState, ErrorState, LoadingBlock } from '../components/ui';
import { formatMoney } from '../lib/helpers';
import { useCart } from '../state/CartContext';

export function WishlistPage() {
  useLanguage();
  const wishlistQuery = useWishlist();
  const toggleWishlist = useToggleWishlist();
  const cart = useCart();

  if (wishlistQuery.isLoading) {
    return (
      <div className="page container">
        <LoadingBlock label={t("Loading your wishlist")} variant="tile" count={3} />
      </div>
    );
  }

  if (wishlistQuery.isError) {
    return (
      <div className="page container">
        <ErrorState error={wishlistQuery.error} onRetry={() => void wishlistQuery.refetch()} />
      </div>
    );
  }

  const items = wishlistQuery.data ?? [];

  return (
    <div className="page container">
      <header className="page-header">
        <div>
          <h1>{t("My Wishlist")}</h1>
          <p>{t("Saved products you want to buy later or keep track of.")}</p>
        </div>
        <Link className="btn btn--sm" to="/products">{t("Continue shopping")}</Link>
      </header>

      {items.length === 0 ? (
        <EmptyState
          title={t("Your wishlist is empty")}
          description={t("Save products you love from the catalogue to easily find and purchase them later.")}
          action={<Link className="btn btn--primary" to="/products">{t("Explore catalogue")}</Link>}
        />
      ) : (
        <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--space-4)' }}>
          {items.map((item) => (
            <article key={item.id} className="card-glass stack" style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg, 12px)' }}>
              <Link to={`/products/${item.productId}`} style={{ textAlign: 'center', marginBottom: 'var(--space-2)' }}>
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.productName}
                    style={{ height: '140px', objectFit: 'contain', margin: '0 auto', display: 'block' }}
                  />
                ) : (
                  <div style={{ height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-muted, rgba(255,255,255,0.05))', borderRadius: '8px' }}>
                    <span className="muted">{t("No image")}</span>
                  </div>
                )}
              </Link>

              <h3 style={{ fontSize: 'var(--text-md)', margin: '0 0 var(--space-1) 0' }}>
                <Link to={`/products/${item.productId}`}>{t(item.productName)}</Link>
              </h3>

              <div className="row-between" style={{ alignItems: 'center', marginTop: 'auto', paddingTop: 'var(--space-2)' }}>
                <span style={{ fontWeight: 700, fontSize: 'var(--text-lg)' }}>
                  {formatMoney(item.price, 'BDT')}
                </span>
                <span className={`badge ${item.inStock ? 'badge--ok' : 'badge--danger'}`}>
                  {t(item.inStock ? 'In stock' : 'Out of stock')}
                </span>
              </div>

              <div className="row" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                {item.inStock ? (
                  <button
                    type="button"
                    className="btn btn--sm btn--primary"
                    style={{ flex: 1 }}
                    onClick={() => {
                      cart.add({
                        id: item.productId,
                        sku: item.sku,
                        name: item.productName,
                        price: item.price,
                        stockQuantity: 10,
                        isActive: true,
                        rowVersion: null
                      }, 1);
                      document.dispatchEvent(new CustomEvent('ninecube:open-cart-sheet'));
                    }}
                  >
                    {t("Add to cart")}
                  </button>
                ) : null}

                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => toggleWishlist.mutate(item.productId)}
                  disabled={toggleWishlist.isPending}
                  aria-label={t(`Remove ${item.productName} from wishlist`)}
                >
                  {t("Remove")}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
