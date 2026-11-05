import { t, useLanguage } from '../i18n/language';
import { useMemo, useState }  from 'react';
import { Link, useNavigate }  from 'react-router-dom';
import { HeroPromotions } from './HeroPromotions';
import { ShowcaseFooterContent } from './ShowcaseFooterContent';
import { showcaseCopy } from './showcaseCopy';
import { CARD_COUNT, cardCategories, describeCardArtwork } from './cardAssets';
import type { ShowcaseFallbackReason } from './support';
import type { Product } from '../api/types';
import { useProducts } from '../api/hooks';
import { formatMoney } from '../lib/helpers';
import { RecentlyViewed } from '../components/RecentlyViewed';
import { HomeTrustBar } from '../components/home/HomeTrustBar';
import { HomeCategoryStrip } from '../components/home/HomeCategoryStrip';
import { HomeBrandStrip } from '../components/home/HomeBrandStrip';
import { HomeFeaturedDeals } from '../components/home/HomeFeaturedDeals';
import { HomeLiveOffers } from '../components/home/HomeLiveOffers';
import { CompareTray } from '../components/CompareTray';
import { Icon } from '../components/Icon';
import { useToast } from '../components/ui';
import { useCart } from '../state/CartContext';
import './showcase.css';

export interface ShowcaseFallbackProps {
  /** The same nine images the helix would have used. */
  cardAssets: readonly string[];
  reason: ShowcaseFallbackReason;
  onLaunch3D?: () => void;
}

const reasonText: Record<ShowcaseFallbackReason, string> = {
  'reduced-motion':
    'The animated helix is paused because your system asks for reduced motion. Every card and the same text are below.',
  webgl: 'The animated helix needs WebGL, which this browser does not provide. Every card and the same text are below.',
  error: 'The animated helix could not start here. Every card and the same text are below.',
  storefront:
    'This is the storefront view: the collection as cards with the live catalogue sections between them. The animated 3D helix is one button away.'
};

const TRENDING_KEYWORDS = [
  'Laptops',
  'Sneakers',
  'Wireless',
  'Kitchen',
  'Apex',
  'Acer'
];

function HomeStorePulse() {
  const { data } = useProducts({ q: '', page: 1, pageSize: 24, inStock: true });
  const products = useMemo(
    () => (data?.items ?? []).filter((product: Product) => product.isActive && product.stockQuantity > 0),
    [data?.items]
  );

  const stats = useMemo(() => {
    if (!products.length) {
      return {
        itemCount: 0,
        lowStock: 0,
        avgPrice: 0,
        topCategory: 'Warehouse'
      };
    }

    const categoryCounts = new Map<string, number>();
    products.forEach((product) => {
      const names = (product.categories ?? []).map((category) => category.name).filter(Boolean);
      if (!names.length) {
        categoryCounts.set('General', (categoryCounts.get('General') ?? 0) + 1);
        return;
      }
      names.forEach((name) => categoryCounts.set(name, (categoryCounts.get(name) ?? 0) + 1));
    });

    const topCategory = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Warehouse';
    const avgPrice = products.reduce((sum, product) => sum + product.price, 0) / products.length;
    const lowStock = products.filter((product) => product.stockQuantity <= 4).length;

    return {
      itemCount: products.length,
      lowStock,
      avgPrice,
      topCategory
    };
  }, [products]);

  const topMoves = useMemo(() => {
    const sorted = [...products].sort((a, b) => {
      const discountA = a.compareAtPrice && a.compareAtPrice > a.price ? ((a.compareAtPrice - a.price) / a.compareAtPrice) * 100 : 0;
      const discountB = b.compareAtPrice && b.compareAtPrice > b.price ? ((b.compareAtPrice - b.price) / b.compareAtPrice) * 100 : 0;
      return (discountB + b.stockQuantity) - (discountA + a.stockQuantity);
    });
    return sorted.slice(0, 3);
  }, [products]);

  const peakStock = Math.max(1, ...topMoves.map((product) => product.stockQuantity), 12);

  return (
    <section className="home-store-pulse" aria-label={t("Store pulse")}>
      <div className="home-store-pulse__header">
        <div>
          <span className="home-section-kicker"><Icon name="box" width={13} height={13} /> {t("From the catalogue")}</span>
          <h2 className="home-section-title">{t("Store pulse")}</h2>
        </div>
        <p className="home-section-desc">{t("Counted from the in-stock products the catalogue returns for this page.")}</p>
      </div>

      <div className="home-store-pulse__stats">
        <div className="home-store-pulse__stat">
          <span className="home-store-pulse__label">{t("Products ready")}</span>
          <strong>{stats.itemCount}</strong>
          <small>{t("in stock now")}</small>
        </div>
        <div className="home-store-pulse__stat">
          <span className="home-store-pulse__label">{t("Low stock")}</span>
          <strong>{stats.lowStock}</strong>
          <small>{t("needs attention")}</small>
        </div>
        <div className="home-store-pulse__stat">
          <span className="home-store-pulse__label">{t("Avg. item")}</span>
          <strong>{formatMoney(stats.avgPrice)}</strong>
          <small>{t("current price")}</small>
        </div>
        <div className="home-store-pulse__stat home-store-pulse__stat--highlight">
          <span className="home-store-pulse__label">{t("Top category")}</span>
          <strong>{stats.topCategory}</strong>
          <small>{t("most active mix")}</small>
        </div>
      </div>

      <div className="home-store-pulse__insights">
        <div className="home-store-pulse__panel">
          <h3>{t("Smart picks")}</h3>
          {topMoves.length === 0 ? (
            <p className="home-store-pulse__empty">{t("Inventory is refreshing.")}</p>
          ) : (
            <ul className="home-store-pulse__list">
              {topMoves.map((product) => {
                const share = Math.max(18, (product.stockQuantity / peakStock) * 100);
                return (
                  <li key={product.id} className="home-store-pulse__item">
                    <Link className="home-store-pulse__item-link" to={`/products/${product.id}`}>
                      <div className="home-store-pulse__item-top">
                        <span>{product.name}</span>
                        <strong>{product.stockQuantity} {t("left")}</strong>
                      </div>
                      <div className="home-store-pulse__bar">
                        <span style={{ width: `${share}%` }} />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="home-store-pulse__panel home-store-pulse__panel--accent">
          <h3>{t("Modern commerce")}</h3>
          <ul className="home-store-pulse__features" role="presentation">
            <li role="presentation">{t("Dynamic category-led discovery")}</li>
            <li role="presentation">{t("Live stock confidence signals")}</li>
            <li role="presentation">{t("Fast path from hero to product detail")}</li>
            <li role="presentation">{t("Compare, cart, and trust-first UX")}</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

/**
 * The home page without WebGL: the same nine collection cards as a static grid, plus the storefront
 * sections - trust bar, category shortcuts, store pulse, brands, deals, live campaigns and recents.
 * Every figure in it is counted from what the catalogue API returns.
 */
export function ShowcaseFallback({ cardAssets, reason, onLaunch3D }: ShowcaseFallbackProps) {
  useLanguage();
  const navigate = useNavigate();
  const toast = useToast();
  const cart = useCart();
  const [search, setSearch] = useState('');
  const [compareItems, setCompareItems] = useState<Product[]>([]);

  const cards = useMemo(
    () => Array.from({ length: CARD_COUNT }, (_, index) => ({ index, src: cardAssets[index] ?? '' })),
    [cardAssets]
  );

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

  return (
    <div className="showcase showcase--static" data-testid="showcase">
      <section className="showcase__hero">
        <div className="showcase__hero-intro">
          <p className="kicker">{t(showcaseCopy.kicker)}</p>
          <h1>
            {t(showcaseCopy.brand.line1)} {t(showcaseCopy.brand.line2)}
          </h1>
          <p className="showcase__hero-copy">{t(showcaseCopy.intro)}</p>
          <div className="showcase__hero-actions">
            <Link className="btn btn--primary showcase__hero-cta" to="/products">{t("Explore the collection ")}<span aria-hidden="true">{t("↗")}</span></Link>
            {onLaunch3D ? (
              <button type="button" className="btn btn--ghost showcase__3d-btn" onClick={onLaunch3D}>
                <Icon name="spark" width={15} height={15} />
                <span>{t("3D Helix Experience")}</span>
              </button>
            ) : null}
          </div>
          <form className="home-search" role="search" aria-label={t("Search the catalogue")} onSubmit={event => { event.preventDefault(); const q = search.trim(); if (q) navigate(`/products?q=${encodeURIComponent(q)}`); }}>
            <label htmlFor="home-search">{t("Find your next favourite")}</label>
            <div className="home-search__row">
              <input
                id="home-search"
                type="search"
                value={search}
                maxLength={200}
                onChange={event => setSearch(event.target.value)}
                placeholder={t("Search products, brands or categories")}
              />
              <button className="btn btn--primary" disabled={!search.trim()}>{t("Search")}</button>
            </div>
            <div className="home-search__trending">
              <span className="home-search__trending-label">{t("Trending:")}</span>
              <div className="home-search__trending-tags">
                {TRENDING_KEYWORDS.map(keyword => (
                  <button
                    key={keyword}
                    type="button"
                    className="home-search__trending-chip"
                    onClick={() => {
                      setSearch(keyword);
                      navigate(`/products?q=${encodeURIComponent(keyword)}`);
                    }}
                  >
                    {t(keyword)}
                  </button>
                ))}
              </div>
            </div>
          </form>
        </div>
        <HeroPromotions />
      </section>

      <HomeTrustBar />
      <HomeCategoryStrip />
      <HomeStorePulse />
      <HomeBrandStrip />
      <HomeFeaturedDeals onToggleCompare={handleToggleCompare} compareItems={compareItems} />
      <HomeLiveOffers />
      <div className="home-recent-section"><RecentlyViewed /></div>

      <section className="showcase__grid-section" aria-labelledby="showcase-cards-heading">
        <div className="showcase__headings">
          <h2 id="showcase-cards-heading">{t(showcaseCopy.transitionTitle)}</h2>
        </div>

        <p className="showcase__note visually-hidden" role="note" data-testid="showcase-fallback-reason">
          {t(reasonText[reason])}
        </p>

        <ul className="showcase__grid" data-testid="showcase-grid">
          {cards.map((card) => (
            <li key={card.index}>
              <img
                src={card.src}
                alt={t(describeCardArtwork(card.src, card.index))}
                width={1200}
                height={800}
                loading={card.index < 3 ? 'eager' : 'lazy'}
              />
              <span className="showcase__category-name">{t(cardCategories[card.index])}</span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="showcase__outro" aria-label={t("NineCube home footer")}>
        <div className="showcase-footer-content"><ShowcaseFooterContent /></div>
      </footer>

      <CompareTray
        items={compareItems}
        onRemove={(id) => setCompareItems((prev) => prev.filter((x) => x.id !== id))}
        onClear={() => setCompareItems([])}
        onAddToCart={(p) => {
          cart.add(p, 1);
          toast.push('success', `${t("Added")} ${p.name} ${t("to your cart.")}`);
        }}
      />
    </div>
  );
}
