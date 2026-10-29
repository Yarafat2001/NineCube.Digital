import { t, useLanguage } from '../i18n/language';
import { cardCategories, describeCardArtwork } from './cardAssets';

/** Keeps real imagery on screen during the reference's otherwise empty introduction. */
export function CategoryPreview({ cardAssets }: { cardAssets: readonly string[] }) {
  useLanguage();
  return <div className="showcase__category-preview" data-testid="category-preview">
    {[1, 2, 3].map(index => <figure key={index}>
      <img src={cardAssets[index]} alt={t(describeCardArtwork(cardAssets[index] ?? '', index))}
        width={640} height={640} loading="eager" decoding="async" />
      <figcaption>{t(cardCategories[index])}</figcaption>
    </figure>)}
  </div>;
}
