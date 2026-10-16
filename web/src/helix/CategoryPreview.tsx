import { cardCategories, describeCardArtwork } from './cardAssets';

/** Keeps real imagery on screen during the reference's otherwise empty introduction. */
export function CategoryPreview({ cardAssets }: { cardAssets: readonly string[] }) {
  return <div className="showcase__category-preview" data-testid="category-preview">
    {[1, 2, 3].map(index => <figure key={index}>
      <img src={cardAssets[index]} alt={describeCardArtwork(cardAssets[index] ?? '', index)}
        width={640} height={640} loading="eager" decoding="async" />
      <figcaption>{cardCategories[index]}</figcaption>
    </figure>)}
  </div>;
}
