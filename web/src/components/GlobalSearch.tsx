import { t, useLanguage } from '../i18n/language';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCategories, useProducts } from '../api/hooks';
import { formatMoney, useDebouncedValue } from '../lib/helpers';
import { Icon } from './Icon';
import { Modal } from './ui';

export function GlobalSearch() {
  useLanguage();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query.trim(), 280);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global hotkey: Ctrl+K or Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 80);
    } else {
      setQuery('');
    }
  }, [open]);

  const categoriesQuery = useCategories();
  const productsQuery = useProducts({
    q: debouncedQuery.length >= 2 ? debouncedQuery : '',
    page: 1,
    pageSize: 6
  });

  const categories = (categoriesQuery.data ?? []).slice(0, 5);
  const results = debouncedQuery.length >= 2 ? (productsQuery.data?.items ?? []) : [];

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
        className="nav-control nav-pop__trigger"
        onClick={() => setOpen(true)}
        aria-label={t("Search catalogue")}
        title={t("Search catalogue (Ctrl+K)")}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name="search" />
      </button>

      <Modal open={open} title={t("Search Catalogue")} onClose={() => setOpen(false)}>
        <div className="global-search-dialog stack" style={{ gap: 'var(--space-3)' }}>
          <div className="global-search-input-wrap">
            <span className="global-search-icon" aria-hidden="true">
              <Icon name="search" />
            </span>
            <input
              ref={inputRef}
              type="search"
              className="global-search-input"
              placeholder={t("Search by product name, brand, category, or SKU…")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
            {query ? (
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => setQuery('')}
                aria-label={t("Clear")}
                style={{ padding: '4px 8px' }}
              >
                ✕
              </button>
            ) : (
              <kbd className="global-search-kbd">{t("Esc")}</kbd>
            )}
          </div>

          {/* Quick Category Suggestions */}
          <div className="global-search-categories">
            <span className="global-search-categories-title">{t("Quick Categories:")}</span>
            <div className="row" style={{ gap: '6px', flexWrap: 'wrap' }}>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="filter-chip"
                  onClick={() => handleSelectCategory(c.slug)}
                >
                  📁 {t(c.name)}
                </button>
              ))}
            </div>
          </div>

          {/* Search Results Area */}
          <div className="global-search-results">
            {debouncedQuery.length < 2 ? (
              <p className="muted" style={{ fontSize: 'var(--text-xs)', textAlign: 'center', padding: '16px 0' }}>
                {t("Type at least 2 characters to search across products…")}
              </p>
            ) : productsQuery.isLoading ? (
              <p className="muted" style={{ fontSize: 'var(--text-xs)', textAlign: 'center', padding: '16px 0' }}>
                {t("Searching products…")}
              </p>
            ) : results.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <p style={{ fontWeight: 600, margin: '0 0 4px' }}>{t("No products matched your search.")}</p>
                <p className="muted" style={{ fontSize: 'var(--text-xs)', margin: 0 }}>
                  {t("Try checking spelling or using a more general keyword.")}
                </p>
              </div>
            ) : (
              <div className="stack" style={{ gap: '6px' }}>
                <div className="row-between" style={{ padding: '0 4px 6px', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  <span>{t("Top matching products")}</span>
                  <span>{productsQuery.data?.totalCount ?? 0} {t("found")}</span>
                </div>
                {results.map((product) => (
                  <div
                    key={product.id}
                    className="global-search-item"
                    onClick={() => handleSelectProduct(product.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSelectProduct(product.id);
                    }}
                  >
                    <div className="global-search-item__media">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt="" style={{ width: '38px', height: '38px', objectFit: 'contain' }} />
                      ) : (
                        <div style={{ width: '38px', height: '38px', background: 'var(--surface-sunken)', borderRadius: '4px' }} />
                      )}
                    </div>
                    <div className="global-search-item__info">
                      <div className="global-search-item__name">
                        {product.brandName ? <strong style={{ color: 'var(--accent-text)', marginRight: '4px' }}>{product.brandName}</strong> : null}
                        <span>{product.name}</span>
                      </div>
                      <div className="row" style={{ gap: '8px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                        <span className="mono">{product.sku}</span>
                        <span>•</span>
                        <span>{product.stockQuantity > 0 ? `✓ ${product.stockQuantity} in stock` : t("Out of stock")}</span>
                      </div>
                    </div>
                    <div className="global-search-item__price">
                      {formatMoney(product.price, product.currency)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {debouncedQuery.length >= 2 && (productsQuery.data?.totalCount ?? 0) > 6 ? (
            <div style={{ textAlign: 'center', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
              <Link
                to={`/products?q=${encodeURIComponent(debouncedQuery)}`}
                className="btn btn--sm btn--primary"
                onClick={() => setOpen(false)}
              >
                {t("View all")} {productsQuery.data?.totalCount} {t("results in catalogue ›")}
              </Link>
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
