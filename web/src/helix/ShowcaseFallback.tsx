import { t, useLanguage } from '../i18n/language';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { HeroPromotions } from './HeroPromotions';
import { ShowcaseFooterContent } from './ShowcaseFooterContent';
import { showcaseCopy } from './showcaseCopy';
import { CARD_COUNT, cardCategories, describeCardArtwork } from './cardAssets';
import type { ShowcaseFallbackReason } from './support';
import './showcase.css';

export interface ShowcaseFallbackProps {
  /** The same nine images the helix would have used. */
  cardAssets: readonly string[];
  reason: ShowcaseFallbackReason;
}

const reasonText: Record<ShowcaseFallbackReason, string> = {
  'reduced-motion':
    'The animated helix is paused because your system asks for reduced motion. Every card and the same text are below.',
  webgl: 'The animated helix needs WebGL, which this browser does not provide. Every card and the same text are below.',
  error: 'The animated helix could not start here. Every card and the same text are below.'
};

/**
 * Static counterpart to the scene: the same nine cards, the same copy, no animation. It is a real
 * part of the page rather than a degraded one - it is what a visitor with reduced motion or
 * without WebGL sees, and it is what the showcase falls back to if the scene fails to start.
 */
export function ShowcaseFallback({ cardAssets, reason }: ShowcaseFallbackProps) {
  useLanguage();
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
        <Link className="btn btn--primary showcase__hero-cta" to="/products">{t("Explore the collection ")}<span aria-hidden="true">{t("↗")}</span></Link>
        <HeroPromotions />
      </section>

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
