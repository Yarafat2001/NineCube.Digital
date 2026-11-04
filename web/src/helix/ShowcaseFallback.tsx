import { t, useLanguage } from '../i18n/language';
import { useMemo, useState }  from 'react';
import { Link, useNavigate }  from 'react-router-dom';
import { HeroPromotions } from './HeroPromotions';
import { ShowcaseFooterContent } from './ShowcaseFooterContent';
import { showcaseCopy } from './showcaseCopy';
import { CARD_COUNT, cardCategories, describeCardArtwork } from './cardAssets';
import type { ShowcaseFallbackReason } from './support';
import { RecentlyViewed } from '../components/RecentlyViewed';
import { HomeTrustBar } from '../components/home/HomeTrustBar';
import { HomeCategoryStrip } from '../components/home/HomeCategoryStrip';
import { HomeFeaturedDeals } from '../components/home/HomeFeaturedDeals';
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
  error: 'The animated helix could not start here. Every card and the same text are below.'
};

/**
 * Modern E-Commerce Storefront: Featuring live warehouse products, verified trust badges,
 * category discovery shortcuts, and the editorial collection showcase.
 */
export function ShowcaseFallback({ cardAssets, reason, onLaunch3D }: ShowcaseFallbackProps) {
  useLanguage();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const cards = useMemo(
    () => Array.from({ length: CARD_COUNT }, (_, index) => ({ index, src: cardAssets[index] ?? '' })),
    [cardAssets]
  );

  return (
    <div className="showcase showcase--static" data-testid="showcase">
      <section className="showcase__hero">
        <p className="kicker">{t(showcaseCopy.kicker)}</p>
        <h1>
          {t(showcaseCopy.brand.line1)} {t(showcaseCopy.brand.line2)}
        </h1>
        <p className="showcase__hero-copy">{t(showcaseCopy.intro)}</p>
        <div className="showcase__hero-actions">
          <Link className="btn btn--primary showcase__hero-cta" to="/products">{t("Explore the collection ")}<span aria-hidden="true">{t("↗")}</span></Link>
          {onLaunch3D ? (
            <button type="button" className="btn btn--ghost showcase__3d-btn" onClick={onLaunch3D}>
              {t("✨ 3D Helix Experience")}
            </button>
          ) : null}
        </div>
        <form className="home-search" role="search" aria-label={t("Search the catalogue")} onSubmit={event => { event.preventDefault(); const q = search.trim(); if (q) navigate(`/products?q=${encodeURIComponent(q)}`); }}>
          <label htmlFor="home-search">{t("Find your next favourite")}</label>
          <div className="home-search__row"><input id="home-search" type="search" value={search} maxLength={200} onChange={event => setSearch(event.target.value)} placeholder={t("Search products, brands or categories")} /><button className="btn btn--primary" disabled={!search.trim()}>{t("Search")}</button></div>
        </form>
        <HeroPromotions />
      </section>

      <HomeTrustBar />
      <HomeCategoryStrip />
      <HomeFeaturedDeals />
      <div className="home-recent-section"><RecentlyViewed /></div>

      <section className="showcase__grid-section" aria-labelledby="showcase-cards-heading">
        <div className="showcase__headings">
          <h2 id="showcase-cards-heading">{t(showcaseCopy.transitionTitle)}</h2>
        </div>

        <p className="showcase__note visually-hidden" role="note" data-testid="showcase-fallback-reason">
          {t(reasonText[reason])}
        </p>

        <ul className="showcase__grid">
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
    </div>
  );
}
