import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useLowStockThreshold, useProducts, useCategories, useTags, useBrands } from '../api/hooks';
import type { Brand, Product } from '../api/types';
import { ProductImage } from '../components/ProductImage';
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
  queryString
}: {
  product: Product;
  threshold: number;
  onAdded: (product: Product, quantity: number) => void;
  canEdit: boolean;
  canOrder: boolean;
  queryString: string;
}) {
  const [quantity, setQuantity] = useState(1);
  const tilt = useCardTilt();
  const outOfStock = !product.isActive || product.stockQuantity <= 0;
  const { brand, displayName, fullName, variant } = cardPresentation(product);
  const detail = `/products/${product.id}`;

  const primary = product.categories?.find(c => c.isPrimary) ?? product.categories?.[0];
  // A "Brand: X" tag is duplicate plumbing: the brand already has its own line on the card.
  const tags = (product.tags ?? []).filter(tag => !isBrandTag(tag));
  const shownTags = tags.slice(0, MAX_TAG_CHIPS);
  const hiddenTags = tags.slice(MAX_TAG_CHIPS);

  return (
    <article {...tilt} className="product-card" data-inactive={!product.isActive} data-testid={`product-${product.id}`}>
      <Link className="product-card__media-link" to={detail} aria-label={`Open ${fullName}`}>
        <ProductImage product={product} />
      </Link>

      <div className="product-card__body">
        {brand ? <p className="product-card__brand">{brand}</p> : null}
        <h3 className="product-card__name" title={fullName}>
          <Link to={detail}>{displayName}</Link>
        </h3>
        {variant ? <p className="product-card__variant">{variant}</p> : null}

        <div className="product-category-chips">
          {primary ? <Link className="filter-chip" to={`/products${mergeSearchParams(new URLSearchParams(queryString), { category: primary.slug, includeDescendants: null })}`} title={primary.name}>{primary.name}</Link> : null}
          {shownTags.map(tag => <Link className="filter-chip" key={tag} to={`/products${mergeSearchParams(new URLSearchParams(queryString), { tag })}`} title={tag}>{tag}</Link>)}
          {hiddenTags.length > 0 ? <span className="filter-chip filter-chip--extra" title={hiddenTags.join(', ')}>+{hiddenTags.length}</span> : null}
        </div>
      </div>

      <div className="product-card__footer">
        <p className="product-card__price">{formatMoney(product.price, product.currency)}</p>
        <StockBadge product={product} threshold={threshold} />
      </div>

      {outOfStock ? (
        <p className="muted">Not currently orderable.</p>
      ) : canOrder ? (
        <div className="row-between">
          <QuantityStepper value={quantity} max={product.stockQuantity} onChange={setQuantity} label={fullName} />
          <button type="button" className="btn btn--primary btn--sm" onClick={() => { onAdded(product, quantity); setQuantity(1); }}>
            Add to cart
          </button>
        </div>
      ) : null}

      {canEdit ? <Link className="link-button" to="/inventory" state={{ editProductId: product.id }}>Edit in Inventory</Link> : null}
    </article>
  );
}

export function ProductsPage() {
  const { user, hasRole } = useAuth();
  const cart = useCart();
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

  const canOrder = hasRole('Customer');
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
          <h1>Catalogue</h1>
          <p>Live availability straight from stock. The server is the source of truth for every quantity.</p>
        </div>

        <div className="field" style={{ minWidth: 'min(320px, 100%)' }}>
          <label htmlFor="product-search">Search products</label>
          <input id="product-search" type="search" placeholder="Name or SKU" value={search}
            onChange={event => setSearch(event.target.value)} />
        </div>
      </header>

      {deniedNotice ? (
        <p className="badge badge--warn" role="status">
          <span className="badge__glyph" aria-hidden="true">⚠</span>
          You do not have access to {deniedNotice}.
        </p>
      ) : null}

      <LiveRegion message={resultMessage} />

      <CategoryBreadcrumb category={category} select={slug => changeFilters({ category: slug })} />
      {categoryNotice || brandNotice ? <p role="status">{[categoryNotice, brandNotice].filter(Boolean).join(' ')}</p> : null}

      <div className="filter-chips filter-chips--active" aria-label="Active filters" hidden={chips.length === 0}>
        {chips.map(chip => (
          <button className="filter-chip" type="button" key={chip.key} onClick={() => changeFilters(chip.clear)}
            aria-label={`Remove ${chip.label} filter`}>{chip.label} <span aria-hidden="true">×</span></button>
        ))}
      </div>

      <div className={`catalogue-layout${canOrder ? " catalogue-layout--cart-on-demand" : ""}`}>
        <CategoryFilters tree={tree} tags={tagsQuery.data ?? []} loading={categoriesQuery.isLoading} params={params} change={changeFilters} />

        <div className="catalogue-main">
          {gridPending ? <LoadingBlock label="Loading products" variant="card" count={6} /> : null}

          {productsQuery.isError && !gridPending ? (
            <ErrorState error={productsQuery.error} onRetry={() => void productsQuery.refetch()} />
          ) : null}

          {!gridPending && productsQuery.data && productsQuery.data.items.length === 0 ? (
            <EmptyState
              title={params.get('category') && !search && !['tag', 'inStock', 'minPrice', 'maxPrice'].some(k => params.has(k)) ? 'No products in this category' : 'No results for these filters'}
              description="Try another category or reset the filters."
              action={<button type="button" className="btn" onClick={() => changeFilters(Object.fromEntries(CATALOG_FILTER_KEYS.map(key => [key, null])))}>Reset all filters</button>}
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
              <h2 id="no-order-heading" style={{ fontSize: 'var(--text-lg)' }}>Read-only view</h2>
              <p className="muted">
                {user?.role === 'Administrator'
                  ? 'Administrators can read everything but do not place orders.'
                  : 'Your role does not place orders. Order handling and stock control are separate duties.'}
              </p>
            </section>
        </aside>}
      </div>
      {canOrder ? <MobileBottomBar filterCount={activeFilterCount(params)} sort={params.get('sort') ?? ''} onFilters={() => document.dispatchEvent(new CustomEvent('ninecube:open-filters'))} /> : null}
    </div>
  );
}

/** Mobile (<=768px) bottom bar: Filters (N), current sort, cart total in BDT, Checkout. */
function MobileBottomBar({ filterCount, onFilters }: { filterCount: number; sort: string; onFilters: () => void }) {
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
    <nav ref={barRef} className="bottombar" aria-label="Quick actions" data-testid="mobile-bottombar">
      <button type="button" className="btn btn--sm" onClick={onFilters}>
        Filters ({filterCount})
      </button>
      <button type="button" className="bottombar__cart" onClick={openCart} aria-label={`Cart, ${cart.itemCount} items`}>
        <span>Cart · {cart.itemCount}</span>
        <strong>{formatMoney(cart.total, cart.currency)}</strong>
      </button>
      <button type="button" className="btn btn--sm btn--primary" onClick={openCart} disabled={cart.lines.length === 0}>
        Checkout
      </button>
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
