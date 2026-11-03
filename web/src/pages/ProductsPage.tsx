import { t, useLanguage } from '../i18n/language';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useLowStockThreshold, useProducts, useCategories, useTags, useBrands, useWishlist, useToggleWishlist } from '../api/hooks';
import type { Brand, Product } from '../api/types';
import { ProductImage, ProductThumbnail } from '../components/ProductImage';
import { Icon } from '../components/Icon';
import { CompareTray } from '../components/CompareTray';
import { QuickViewModal } from '../components/QuickViewModal';
import { recordRecentView } from '../lib/recentViews';
import { RecentlyViewed } from '../components/RecentlyViewed';
import { StockAlertModal } from '../components/StockAlertModal';
import { useToast } from '../components/ui';
import { ApiError } from '../api/client';
import { CategoryFilters, CategoryBreadcrumb, facetFromParams, flattenCategories, isBrandTag, parseTags, seriesLabel, seriesSlugsOf, writeParams, type ChangeFilters } from '../components/CategoryFilters';
import { EmptyState, ErrorState, LiveRegion, LoadingBlock, Pager, QuantityStepper, StockBadge } from '../components/ui';
import { formatMoney, formatMoneyWhole, useDebouncedValue } from '../lib/helpers';
import { cardPresentation, CATALOG_FILTER_KEYS, activeFilterCount, isFilterActive, mergeSearchParams } from '../lib/catalog';
import { useAuth } from '../state/AuthContext';
import { useCart } from '../state/CartContext';

import { useCardTilt } from '../lib/useCardTilt';

const PAGE_SIZE = 8;
const MAX_TAG_CHIPS = 2;

const filterLabels: Record<string, string> = { q: 'Search', category: 'Category', tag: 'Tag', inStock: 'Availability', minPrice: 'Min price', maxPrice: 'Max price', sort: 'Sort', includeDescendants: 'Subcategories' };

/** The chip reads "Sort: Price low to high" rather than the raw URL token. */
const sortLabels: Record<string, string> = { price: 'Price low to high', stock: 'Stock high to low', newest: 'Newest' };

/**
 * The card is a fixed shape: brand, a two-line name, one line of variants, the category and at most
 * two tags, then the price row pinned to the bottom. The SKU is deliberately absent - it is plumbing
 * for staff, and a 60-character one used to stretch the card past the viewport.
 */
function ProductCard({
  product,
  threshold,
  onAdded,
  canEdit,
  canOrder,
  queryString,
  isWishlisted,
  onToggleWishlist,
  isComparing,
  onToggleCompare,
  onQuickView,
  onNotifyStock
}: {
  product: Product;
  threshold: number;
  onAdded: (product: Product, quantity: number) => void;
  canEdit: boolean;
  canOrder: boolean;
  queryString: string;
  isWishlisted?: boolean;
  onToggleWishlist?: () => void;
  isComparing?: boolean;
  onToggleCompare?: () => void;
  onQuickView?: (product: Product) => void;
  onNotifyStock?: (product: Product) => void;
}) {
  useLanguage();
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const tilt = useCardTilt();
  const outOfStock = !product.isActive || product.stockQuantity <= 0;
  const isLowStock = !outOfStock && product.stockQuantity <= threshold;
  const { brand, displayName, fullName, variant } = cardPresentation(product);
  const detail = `/products/${product.id}`;

  const primary = product.categories?.find(c => c.isPrimary) ?? product.categories?.[0];
  // A "Brand: X" tag is duplicate plumbing: the brand already has its own line on the card.
  const tags = (product.tags ?? []).filter(tag => !isBrandTag(tag));
  const shownTags = tags.slice(0, MAX_TAG_CHIPS);
  const hiddenTags = tags.slice(MAX_TAG_CHIPS);
  const discountPercent = product.compareAtPrice && product.compareAtPrice > product.price
    ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)
    : 0;

  return (
    <article {...tilt} className="product-card" data-inactive={!product.isActive} data-testid={`product-${product.id}`}>
      <div className="product-card__media-wrap">
        <Link className="product-card__media-link" to={detail} aria-label={t(`Open ${fullName}`)}>
          <ProductImage product={product} />
        </Link>
        {discountPercent > 0 && (
          <div className="product-card__badge-overlay product-card__badge-overlay--discount" aria-label={t(`-${discountPercent}%`)}>
            <span>-{discountPercent}%</span>
          </div>
        )}
        {outOfStock ? (
          <div className="product-card__badge-overlay product-card__badge-overlay--stock">
            <span>{t("Out of stock")}</span>
          </div>
        ) : isLowStock ? (
          <div className="product-card__badge-overlay product-card__badge-overlay--low">
            <span>⚡ {t("Only")} {product.stockQuantity} {t("left")}</span>
          </div>
        ) : null}
        {canOrder && onToggleWishlist ? (
          <button
            type="button"
            className={`product-card__wishlist-btn ${isWishlisted ? 'product-card__wishlist-btn--active' : ''}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleWishlist();
            }}
            aria-label={t(isWishlisted ? "Remove from wishlist" : "Add to wishlist")}
            title={t(isWishlisted ? "Saved in wishlist" : "Save to wishlist")}
          >
            <Icon name="heart" width={14} height={14} />
          </button>
        ) : null}
        {onQuickView ? (
          <button
            type="button"
            className="product-card__quick-view-btn"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onQuickView(product);
            }}
            aria-label={`${t("Quick view")} ${displayName}`}
            title={t("Quick view")}
          >
            <Icon name="eye" width={14} height={14} />
          </button>
        ) : null}
      </div>

      <div className="product-card__body">
        <div className="product-card__brand-row">
          {brand ? <p className="product-card__brand">{t(brand)}</p> : <span />}
          <StockBadge product={product} threshold={threshold} />
        </div>

        <h3 className="product-card__name" title={t(fullName)}>
          <Link to={detail}>{t(displayName)}</Link>
        </h3>
        {variant ? <p className="product-card__variant">{t(variant)}</p> : null}

        <div className="product-category-chips">
          {primary ? (
            <Link
              className="filter-chip"
              to={`/products${mergeSearchParams(new URLSearchParams(queryString), { category: primary.slug, includeDescendants: null })}`}
              title={t(primary.name)}
            >
              {t(primary.name)}
            </Link>
          ) : null}
          {shownTags.map(tag => (
            <Link
              className="filter-chip"
              key={tag}
              to={`/products${mergeSearchParams(new URLSearchParams(queryString), { tag })}`}
              title={t(tag)}
            >
              {t(tag)}
            </Link>
          ))}
          {hiddenTags.length > 0 ? (
            <span className="filter-chip filter-chip--extra" title={t(hiddenTags.join(', '))}>
              {t("+")}{t(hiddenTags.length)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="product-card__footer">
        <div className="product-card__pricing">
          <span className="product-card__price">{t(formatMoney(product.price, product.currency))}</span>
          {product.compareAtPrice && product.compareAtPrice > product.price ? (
            <span className="product-card__compare-price">
              {t(formatMoney(product.compareAtPrice, product.currency))}
            </span>
          ) : null}
        </div>
        {canOrder && onToggleCompare ? (
          <button
            type="button"
            className={`product-card__compare-btn ${isComparing ? 'product-card__compare-btn--active' : ''}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleCompare();
            }}
            aria-pressed={isComparing}
            title={t(isComparing ? "Remove from comparison" : "Compare")}
          >
            <span aria-hidden="true">⇄</span> {isComparing ? t("Comparing") : t("Compare")}
          </button>
        ) : null}
      </div>

      {outOfStock ? (
        <div className="product-card__out-of-stock-note">
          <p className="muted">{t("Not currently orderable.")}</p>
          {onNotifyStock ? (
            <button
              type="button"
              className="link-button product-card__notify-btn"
              onClick={() => onNotifyStock(product)}
              style={{ fontSize: 'var(--text-xs)', marginTop: '4px' }}
            >
              🔔 {t("Notify Me")}
            </button>
          ) : null}
        </div>
      ) : canOrder ? (
        <div className="row-between product-card__actions">
          <QuantityStepper value={quantity} max={product.stockQuantity} onChange={setQuantity} label={t(fullName)} />
          <button
            type="button"
            className={`btn btn--primary btn--sm product-card__btn-add ${justAdded ? 'product-card__btn-add--success' : ''}`}
            onClick={() => {
              onAdded(product, quantity);
              setJustAdded(true);
              setTimeout(() => setJustAdded(false), 1400);
              setQuantity(1);
            }}
          >
            <span className="product-card__btn-icon" aria-hidden="true">{justAdded ? <Icon name="check" width={13} height={13} /> : <Icon name="cart" width={13} height={13} />}</span>
            <span className="product-card__btn-text">{justAdded ? t("Added!") : t("Add to cart")}</span>
          </button>
        </div>
      ) : null}

      {canEdit ? (
        <Link className="link-button" to="/inventory" state={{ editProductId: product.id }}>
          {t("Edit in Inventory")}
        </Link>
      ) : null}
    </article>
  );
}

export function ProductsPage() {
  useLanguage();
  const { user, hasRole } = useAuth();
  const cart = useCart();
  const toast = useToast();
  const wishlistQuery = useWishlist();
  const toggleWishlist = useToggleWishlist();
  const wishlistIds = useMemo(() => new Set((wishlistQuery.data ?? []).map((w) => w.productId)), [wishlistQuery.data]);
  const [compareItems, setCompareItems] = useState<Product[]>([]);

  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);

  const [stockAlertProduct, setStockAlertProduct] = useState<Product | null>(null);

  const handleToggleCompare = (p: Product) => {
    setCompareItems((prev) => {
      if (prev.some((x) => x.id === p.id)) {
        return prev.filter((x) => x.id !== p.id);
      }
      if (prev.length >= 4) {
        toast.push('info', t('You can compare up to 4 products at once.'));
        return prev;
      }
      return [...prev, p];
    });
  };

  const navigate = useNavigate();
  const location = useLocation();

  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const brands = params.getAll('brand').filter(Boolean);
  const lines = params.getAll('line').filter(Boolean);

  const changeFilters: ChangeFilters = (values, replace = false) => setParams(writeParams(params, values), { replace });
  const setSearch = (value: string) => changeFilters({ q: value }, true);
  const setPage = (value: number) => { const next = new URLSearchParams(params); if (value > 1) next.set('page', String(value)); else next.delete('page'); setParams(next); };

  const categoriesQuery = useCategories();
  const tagsQuery = useTags();
  const tree = categoriesQuery.data ?? [];
  const category = flattenCategories(tree).find(c => c.slug === params.get('category'));
  const [categoryNotice, setCategoryNotice] = useState('');
  const [brandNotice, setBrandNotice] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  const thresholdQuery = useLowStockThreshold();
  const productsQuery = useProducts({ q: debouncedSearch, page, pageSize: PAGE_SIZE,
    categorySlug: params.get('category') || undefined, includeDescendants: params.get('includeDescendants') !== 'false',
    tag: params.get('tag') || undefined, inStock: params.get('inStock') === 'true' ? true : undefined,
    minPrice: params.get('minPrice') || undefined, maxPrice: params.get('maxPrice') || undefined,
    sort: params.get('sort') || 'name', brands, lines });

  const threshold = thresholdQuery.data?.lowStockThreshold ?? 5;

  // Only needed to label the chips; it shares its cache key with the panel's identical request.
  const brandFacets = useBrands(facetFromParams(params)).data ?? [];

  const gridPending = productsQuery.isLoading || (productsQuery.isPlaceholderData && productsQuery.isFetching);

  useEffect(() => {
    if (params.get('category') && productsQuery.error instanceof ApiError && productsQuery.error.isNotFound) {
      setCategoryNotice('That category is no longer available. Showing all products.');
      changeFilters({ category: null });
    }
    // A brand or series that has since been deactivated answers 404. Clear both, because a
    // leftover series without its brand is an impossible pair the API would refuse with 400.
    if ((brands.length > 0 || lines.length > 0) && productsQuery.error instanceof ApiError && productsQuery.error.isNotFound) {
      setBrandNotice('That brand or series is no longer available. Showing the rest of the filters.');
      changeFilters({ brand: null, line: null });
    }
  }, [productsQuery.error]); // eslint-disable-line react-hooks/exhaustive-deps

  const canOrder = !user || hasRole('Customer');
  const canEditProducts = hasRole('InventoryManager');

  // The "no access" notice is a one-off: the guard hands it over in history state, and it is
  // copied into local state and cleared from the entry straight away. Otherwise it would stay on
  // screen forever (and come back on refresh or back navigation) after a single denied attempt.
  const deniedPath = (location.state as { denied?: string } | null)?.denied;
  const [deniedNotice, setDeniedNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!deniedPath) return;
    setDeniedNotice(deniedPath);
    navigate(location.pathname + location.search, { replace: true, state: null });
  }, [deniedPath, location.pathname, location.search, navigate]);

  const resultMessage = useMemo(() => {
    if (gridPending) return 'Loading products';
    if (productsQuery.isError) return 'The filters could not be applied.';
    if (!productsQuery.data) return '';
    return `${productsQuery.data.totalCount} product${productsQuery.data.totalCount === 1 ? '' : 's'} found.`;
  }, [gridPending, productsQuery.data, productsQuery.isError]);

  // Chips mirror the URL exactly: one chip per active filter, removable without touching the rest.
  const chips: { key: string; label: string; clear: FilterValues }[] = [
    ...CATALOG_FILTER_KEYS
      .filter(key => key !== 'brand' && key !== 'line' && key !== 'tag' && isFilterActive(key, params.get(key)))
      .map(key => ({
        key,
        label: key === 'category' ? category?.name ?? params.get(key) ?? ''
          : key === 'inStock' ? 'In stock'
          : key === 'includeDescendants' ? 'Direct category only'
          : key === 'minPrice' ? `From ${formatMoneyWhole(Number(params.get(key)))}`
          : key === 'maxPrice' ? `Up to ${formatMoneyWhole(Number(params.get(key)))}`
          : key === 'q' ? `Search: ${params.get(key)}`
          : key === 'sort' ? `Sort: ${sortLabels[params.get(key) ?? ''] ?? params.get(key)}`
          : `${filterLabels[key]}: ${params.get(key)}`,
        clear: { [key]: null }
      })),
    // Several tags share one parameter, so each gets its own chip and the rest survive its removal.
    ...parseTags(params.get('tag')).map(name => ({
      key: `tag:${name}`,
      label: `Tag: ${name}`,
      clear: { tag: parseTags(params.get('tag')).filter(entry => entry !== name).join(',') }
    })),
    ...brands.map(slug => ({ key: `brand:${slug}`, label: `Brand: ${facetLabel(productsQuery.data?.items, brandFacets, slug, 'brand')}`, clear: { brand: brands.filter(s => s !== slug), line: lines.filter(s => !seriesSlugsOf(slug).includes(s)) } })),
    ...lines.map(slug => ({ key: `line:${slug}`, label: `Series: ${facetLabel(productsQuery.data?.items, brandFacets, slug, 'line')}`, clear: { line: lines.filter(s => s !== slug) } }))
  ];


  return (
    <div className="page container">
      <header className="page-header">
        <div>
          <h1>{t("Catalogue")}</h1>
          <p>{t("Live availability straight from stock. The server is the source of truth for every quantity.")}</p>
        </div>

        <div className="field catalogue-search">
          <label htmlFor="product-search">{t("Search products")}</label>
          <input id="product-search" type="search" placeholder={t("Name or SKU")} value={search}
            autoComplete="off"
            onChange={event => setSearch(event.target.value)} />

          {/* Live Autocomplete Suggestions */}
          {search.trim().length >= 2 && productsQuery.data?.items && productsQuery.data.items.length > 0 ? (
            <div className="search-suggestions" role="listbox" aria-label={t("Search suggestions")}>
              <p className="search-suggestions__count">
                {t("Quick matches")} ({productsQuery.data.items.slice(0, 5).length})
              </p>
              {productsQuery.data.items.slice(0, 5).map(item => (
                <Link key={item.id} className="search-suggestions__row" to={`/products/${item.id}`}
                  onClick={() => setSearch('')}>
                  <ProductThumbnail
                    product={item}
                    url={item.imageUrl}
                    alt=""
                    className="search-suggestions__thumb"
                    iconSize={16}
                  />
                  <span className="search-suggestions__info">
                    <span className="search-suggestions__name">{item.name}</span>
                    <span className="search-suggestions__sku mono">{item.sku}</span>
                  </span>
                  <span className="search-suggestions__price">{formatMoney(item.price, item.currency)}</span>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      {deniedNotice ? (
        <p className="badge badge--warn" role="status">
          <span className="badge__glyph" aria-hidden="true">{t("⚠")}</span>
          {t("You do not have access to ")}{t(deniedNotice)}{t(".")}</p>
      ) : null}

      <div className="catalogue-pre-header">
        <CategoryBreadcrumb category={category} select={slug => changeFilters({ category: slug })} />
        <LiveRegion message={t(resultMessage)} className="muted catalogue-live-message" />
      </div>
      {categoryNotice || brandNotice ? <p role="status">{t([categoryNotice, brandNotice].filter(Boolean).join(' '))}</p> : null}

      <div className="filter-chips filter-chips--active" aria-label={t("Active filters")} hidden={chips.length === 0}>
        {chips.map(chip => (
          <button className="filter-chip" type="button" key={chip.key} onClick={() => changeFilters(chip.clear)}
            aria-label={t(`Remove ${chip.label} filter`)}>{t(chip.label)} <span aria-hidden="true">{t("×")}</span></button>
        ))}
      </div>

      <div className={`catalogue-layout${canOrder ? " catalogue-layout--cart-on-demand" : ""}`}>
        <CategoryFilters tree={tree} tags={tagsQuery.data ?? []} loading={categoriesQuery.isLoading} params={params} change={changeFilters} />

        <div className="catalogue-main">
          {/* Modern Catalogue Utility Toolbar */}
          <div className="catalogue-toolbar card-glass" role="toolbar" aria-label={t("Catalogue controls")}>
            <div className="catalogue-toolbar__left">
              <div className="catalogue-toolbar__badge">
                <span className="catalogue-toolbar__count-num">{productsQuery.data?.totalCount ?? 0}</span>
                <span className="catalogue-toolbar__count-label">{t("Products")}</span>
              </div>
              {category ? (
                <div className="catalogue-toolbar__pill" title={category.name}>
                  <span aria-hidden="true">📁</span> <strong>{t(category.name)}</strong>
                </div>
              ) : null}
            </div>

            <div className="catalogue-toolbar__right">
              <div className="catalogue-toolbar__sort-wrap">
                <label htmlFor="catalogue-sort-select" className="catalogue-toolbar__sort-label">
                  <span aria-hidden="true">⇅</span> {t("Sort by")}
                </label>
                <select
                  id="catalogue-sort-select"
                  className="catalogue-toolbar__sort-select"
                  value={params.get('sort') ?? ''}
                  onChange={e => changeFilters({ sort: e.target.value || null })}
                  aria-label={t("Sort by")}
                >
                  <option value="">{t("Featured / Default")}</option>
                  <option value="price">{t("Price low to high")}</option>
                  <option value="stock">{t("Stock high to low")}</option>
                  <option value="newest">{t("Newest")}</option>
                </select>
              </div>
            </div>
          </div>

          {gridPending ? <LoadingBlock label={t("Loading products")} variant="card" count={6} /> : null}

          {productsQuery.isError && !gridPending ? (
            <ErrorState error={productsQuery.error} onRetry={() => void productsQuery.refetch()} />
          ) : null}

          {!gridPending && productsQuery.data && productsQuery.data.items.length === 0 ? (
            <EmptyState
              title={t(params.get('category') && !search && !['tag', 'inStock', 'minPrice', 'maxPrice'].some(k => params.has(k)) ? 'No products in this category' : 'No results for these filters')}
              description={t("Try another category or reset the filters.")}
              action={<button type="button" className="btn" onClick={() => changeFilters(Object.fromEntries(CATALOG_FILTER_KEYS.map(key => [key, null])))}>{t("Reset all filters")}</button>}
            />
          ) : null}

          {!gridPending && productsQuery.data && productsQuery.data.items.length > 0 ? (
            <>
              <div className="grid-products">
                {productsQuery.data.items.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    threshold={threshold}
                    onAdded={(item, quantity) => cart.add(item, quantity)}
                    canEdit={canEditProducts}
                    canOrder={canOrder}
                    queryString={params.toString()}
                    isWishlisted={wishlistIds.has(product.id)}
                    onToggleWishlist={canOrder ? () => user ? toggleWishlist.mutate(product.id) : navigate('/login') : undefined}
                    isComparing={compareItems.some((x) => x.id === product.id)}
                    onToggleCompare={canOrder ? () => handleToggleCompare(product) : undefined}
                    onQuickView={(p) => {
                      recordRecentView(p);
                      setQuickViewProduct(p);
                    }}
                    onNotifyStock={setStockAlertProduct}
                  />
                ))}
              </div>

              <div className="table-surface">
                <Pager page={productsQuery.data.page} totalPages={productsQuery.data.totalPages}
                  totalCount={productsQuery.data.totalCount} pageSize={productsQuery.data.pageSize} onPageChange={setPage} />
              </div>
            </>
          ) : null}
        </div>

        {!canOrder && <aside className="catalogue-aside">

            <section className="card-glass" aria-labelledby="no-order-heading">
              <h2 id="no-order-heading" style={{ fontSize: 'var(--text-lg)' }}>{t("Read-only view")}</h2>
              <p className="muted">
                {t(user?.role === 'Administrator'
                  ? 'Administrators can read everything but do not place orders.'
                  : 'Your role does not place orders. Order handling and stock control are separate duties.')}
              </p>
            </section>
        </aside>}
      </div>
      <RecentlyViewed style={{ margin: 'var(--space-6) 0 0' }} />

      {quickViewProduct ? (
        <QuickViewModal
          product={quickViewProduct}
          threshold={threshold}
          onClose={() => setQuickViewProduct(null)}
          onAdded={(item, quantity) => {
            cart.add(item, quantity);
            toast.push('success', `${t("Added")} ${item.name} ${t("to your cart.")}`);
          }}
        />
      ) : null}

      {stockAlertProduct ? (
        <StockAlertModal
          product={stockAlertProduct}
          onClose={() => setStockAlertProduct(null)}
          onSubscribed={() => {
            toast.push('success', t("Restock alert registered."));
          }}
        />
      ) : null}

      {canOrder ? (
        <CompareTray
          items={compareItems}
          onRemove={(id) => setCompareItems((prev) => prev.filter((x) => x.id !== id))}
          onClear={() => setCompareItems([])}
          onAddToCart={(p) => {
            cart.add(p, 1);
            toast.push('success', `${t("Added")} ${p.name} ${t("to your cart.")}`);
          }}
        />
      ) : null}
      {canOrder ? <MobileBottomBar filterCount={activeFilterCount(params)} sort={params.get('sort') ?? ''} onFilters={() => document.dispatchEvent(new CustomEvent('ninecube:open-filters'))} /> : null}
    </div>
  );
}

/** Mobile (<=768px) bottom bar: Filters (N), current sort, cart total in BDT, Checkout. */
function MobileBottomBar({ filterCount, onFilters }: { filterCount: number; sort: string; onFilters: () => void }) {
  useLanguage();
  const cart = useCart();
  const barRef = useRef<HTMLElement>(null);

  // Publish the measured height as --bottombar-h (0 when absent).
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const publish = () => {
      const visible = window.matchMedia('(max-width: 768px)').matches;
      const height = visible ? Math.round(bar.getBoundingClientRect().height) : 0;
      document.documentElement.style.setProperty('--bottombar-h', `${height}px`);
    };
    publish();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(publish) : null;
    observer?.observe(bar);
    window.addEventListener('resize', publish);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', publish);
      document.documentElement.style.setProperty('--bottombar-h', '0px');
    };
  }, []);

  const openCart = () => document.dispatchEvent(new CustomEvent('ninecube:open-cart-sheet'));

  return (
    <nav ref={barRef} className="bottombar" aria-label={t("Quick actions")} data-testid="mobile-bottombar">
      <button type="button" className="btn btn--sm" onClick={onFilters}>
        {t("Filters (")}{t(filterCount)}{t(")")}</button>
      <button type="button" className="bottombar__cart" onClick={openCart} aria-label={t(`Cart, ${cart.itemCount} items`)}>
        <span>{t("Cart · ")}{t(cart.itemCount)}</span>
        <strong>{t(formatMoney(cart.total, cart.currency))}</strong>
      </button>
      <button type="button" className="btn btn--sm btn--primary" onClick={openCart} disabled={cart.lines.length === 0}>
        {t("Checkout")}</button>
    </nav>
  );
}

type FilterValues = Parameters<ChangeFilters>[0];

/** A slug never seen in the loaded page or the facet list is still readable as a title. */
function prettify(slug: string): string {
  return slug.split(/[-_]+/).filter(Boolean).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}
/** Chip text uses the facet name when it has been loaded, the prettified slug otherwise. */
function facetLabel(items: Product[] | undefined, facet: Brand[], slug: string, kind: 'brand' | 'line'): string {
  const fromProducts = kind === 'brand'
    ? items?.find(product => product.brandSlug === slug)?.brandName
    : items?.find(product => product.productLineSlug === slug)?.productLineName;
  if (fromProducts) return fromProducts;
  if (kind === 'brand') return facet.find(b => b.slug === slug)?.name ?? prettify(slug);
  return seriesLabel(slug) ?? prettify(slug);
}
