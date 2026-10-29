import { t, useLanguage } from '../i18n/language';
export function ShowcaseHeroPhoto({ src }: { src: string }) {
  useLanguage();
  // Artwork is separate from the reference scene; its animation remains unchanged.
  return <figure className="showcase__hero-photo">
    <img src={src} alt={t("Coffee and ceramic cups in warm natural light")} width={900} height={1200}
      loading="eager" decoding="async" />
    <figcaption>{t("Everyday moments, thoughtfully considered.")}</figcaption>
  </figure>;
}
