import { t, useLanguage } from '../i18n/language';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useCategories, useLowStockThreshold, useProducts } from '../api/hooks';
import { formatMoney, useDebouncedValue } from '../lib/helpers';
import { Icon } from './Icon';
import { StockBadge } from './ui';
import { ProductThumbnail } from './ProductImage';

export function GlobalSearch() {
  useLanguage();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query.trim(), 250);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Global hotkey: Ctrl+K or Cmd+K to toggle, Esc to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // Handle open state, auto focus, and scroll lock
  useEffect(() => {
    if (open) {
      document.documentElement.setAttribute('data-overlay-open', 'true');
      const timer = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(timer);
    } else {
      document.documentElement.removeAttribute('data-overlay-open');
      setQuery('');
    }
  }, [open]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      document.documentElement.removeAttribute('data-overlay-open');
    };
  }, []);

  // Nothing in this dialog is worth a request before it is on screen, and the result list only
  // exists from the third character. Measured on the deployed site before this gate: the navbar's
  // copy of these two queries fired 14 times each in 229s while sitting on the login page with the
  // dialog closed, because useProducts also carries the 15s stock poll meant for quantity grids.
  const searching = open && debouncedQuery.length >= 2;
  const categoriesQuery = useCategories(false, open);
  const thresholdQuery = useLowStockThreshold(open);
  const productsQuery = useProducts(
    { q: searching ? debouncedQuery : '', page: 1, pageSize: 6 },
    { enabled: searching, live: false }
  );

  const categories = (categoriesQuery.data ?? []).slice(0, 6);
  const results = debouncedQuery.length >= 2 ? (productsQuery.data?.items ?? []) : [];
  const threshold = thresholdQuery.data?.lowStockThreshold ?? 5;

  const handleSelectProduct = (productId: number) => {
    setOpen(false);
    navigate(`/products/${productId}`);
  };

  const handleSelectCategory = (slug: string) => {
    setOpen(false);
    navigate(`/products?category=${encodeURIComponent(slug)}`);
  };

  return (
    <>
      <button
        type="button"
        className="nav-control"
        onClick={() => setOpen(true)}
        aria-label={t("Search catalogue")}
        title={t("Search catalogue (Ctrl+K)")}
      >
        <Icon name="search" />
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="spotlight-backdrop"
              onClick={() => setOpen(false)}
              role="presentation"
            >
              <div
                ref={dialogRef}
                className="spotlight-dialog"
                role="dialog"
                aria-modal="true"
                aria-label={t("Search Catalogue")}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Search Bar Header: one well, the same edge and fill every other
                    input in the app uses, with the clear control inside it. */}
                <div className="spotlight-header">
                  <div className="spotlight-field">
                    <span className="spotlight-search-icon" aria-hidden="true">
                      <Icon name="search" />
                    </span>
                    <input
                      ref={inputRef}
                      type="search"
                      className="spotlight-input"
                      placeholder={t("Search by product name, brand, category, or SKU…")}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    {query ? (
                      <button
                        type="button"
                        className="spotlight-clear-btn"
                        onClick={() => {
                          setQuery('');
                          inputRef.current?.focus();
                        }}
                        aria-label={t("Clear")}
                        title={t("Clear")}
                      >
                        <Icon name="x" width="14" height="14" />
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="spotlight-close-btn"
                    onClick={() => setOpen(false)}
                    aria-label={t("Close dialog")}
                    title={t("Close dialog")}
                  >
                    <Icon name="x" width="16" height="16" />
                  </button>
                </div>

                {/* Quick Category Chips */}
                <div className="spotlight-categories">
                  <span className="spotlight-categories-label">{t("Quick Categories:")}</span>
                  <div className="spotlight-categories-list">
                    {categories.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="spotlight-chip"
                        onClick={() => handleSelectCategory(c.slug)}
                      >
                        <Icon name="folder" width="13" height="13" className="spotlight-chip-glyph" />
                        <span>{t(c.name)}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search Results Area */}
                <div className="spotlight-body">
                  {debouncedQuery.length < 2 ? (
                    <p className="spotlight-note">{t("Type at least 2 characters to search across products…")}</p>
                  ) : productsQuery.isLoading ? (
                    <p className="spotlight-note">{t("Searching products…")}</p>
                  ) : results.length === 0 ? (
                    <div className="spotlight-empty">
                      <p className="spotlight-empty__title">{t("No products matched your search.")}</p>
                      <p className="spotlight-note">{t("Try checking spelling or using a more general keyword.")}</p>
                    </div>
                  ) : (
                    <div className="spotlight-results">
                      <div className="spotlight-results-header">
                        <span>{t("Top matching products")}</span>
                        <span>
                          {productsQuery.data?.totalCount ?? 0} {t("found")}
                        </span>
                      </div>
                      <div className="spotlight-items">
                        {results.map((product) => (
                          <div
                            key={product.id}
                            className="spotlight-item"
                            onClick={() => handleSelectProduct(product.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSelectProduct(product.id);
                            }}
                          >
                            <div className="spotlight-item__media">
                              <ProductThumbnail
                                product={product}
                                url={product.imageUrl}
                                alt={product.name}
                                iconSize={18}
                              />
                            </div>
                            <div className="spotlight-item__info">
                              <div className="spotlight-item__name">
                                {/* The seeded names already begin with their brand, so a brand
                                    prefix on top of the name painted "Apple Apple iPhone 16". */}
                                {product.brandName && !product.name.startsWith(product.brandName) ? (
                                  <strong className="spotlight-item__brand">{product.brandName}</strong>
                                ) : null}
                                <span>{product.name}</span>
                              </div>
                              <div className="spotlight-item__meta">
                                <span className="mono">{product.sku}</span>
                                <StockBadge product={product} threshold={threshold} />
                              </div>
                            </div>
                            <div className="spotlight-item__price">
                              {formatMoney(product.price, product.currency)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Hotkeys / View All Link */}
                <div className="spotlight-footer">
                  <div className="spotlight-footer-kbd">
                    <kbd className="spotlight-kbd">{t("Esc")}</kbd>
                    <span className="muted">{t("Close dialog")}</span>
                  </div>
                  {debouncedQuery.length >= 2 && (productsQuery.data?.totalCount ?? 0) > 6 ? (
                    <Link
                      to={`/products?q=${encodeURIComponent(debouncedQuery)}`}
                      className="btn btn--sm btn--primary spotlight-view-all"
                      onClick={() => setOpen(false)}
                    >
                      {t("View all")} {productsQuery.data?.totalCount} {t("results in catalogue ›")}
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
