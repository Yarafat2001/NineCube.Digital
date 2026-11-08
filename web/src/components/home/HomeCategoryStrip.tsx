import { t, useLanguage } from '../../i18n/language';
import { useCategories } from '../../api/hooks';
import { useHomeMerch } from './useHomeMerch';
import { ErrorState, LoadingBlock } from '../ui';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../Icon';
import { resolveAssetUrl } from '../../api/client';
import type { Category, Product } from '../../api/types';

export function HomeCategoryStrip() {
  useLanguage();

  const query = useCategories();
  const { photoByCategory } = useHomeMerch();
  const categories = (query.data ?? []).filter(category => category.isActive && category.productCount > 0).slice(0, 12);
  const categoryIcon = (slug: string): IconName => /shoe|footwear/.test(slug) ? 'shoe' : /electronic|tech|laptop|phone/.test(slug) ? 'spark' : /home|kitchen|coffee/.test(slug) ? 'coffee' : /furniture|living/.test(slug) ? 'chair' : 'box';

  const findCategoryPhoto = (cat: Category): Product | undefined => {
    if (photoByCategory.has(cat.slug)) return photoByCategory.get(cat.slug);
    if (cat.children && cat.children.length > 0) {
      for (const child of cat.children) {
        const prod = photoByCategory.get(child.slug);
        if (prod) return prod;
      }
    }
    for (const [slug, prod] of photoByCategory.entries()) {
      if (
        (slug.includes('laptop') || slug.includes('phone') || slug.includes('electronic')) && cat.slug === 'electronics' ||
        (slug.includes('shoe') || slug.includes('footwear') || slug.includes('sneaker')) && cat.slug === 'footwear' ||
        (slug.includes('kitchen') || slug.includes('home') || slug.includes('decor')) && cat.slug === 'home' ||
        (slug.includes('food') || slug.includes('tea') || slug.includes('coffee') || slug.includes('grocery')) && cat.slug === 'grocery' ||
        (slug.includes('bag') || slug.includes('fashion') || slug.includes('apparel')) && cat.slug === 'fashion' ||
        (slug.includes('chair') || slug.includes('furniture') || slug.includes('table')) && cat.slug === 'furniture'
      ) {
        return prod;
      }
    }
    return undefined;
  };

  return (
    <section className="home-categories-section" aria-label={t("Browse by Category")}>
      <div className="home-section-header">
        <div>
          <span className="home-section-kicker">{t("Browse Collections")}</span>
          <h2 className="home-section-title">{t("Top Categories")}</h2>
        </div>
        <Link to="/products" className="home-section-link">
          {t("View all categories")} <span aria-hidden="true">→</span>
        </Link>
      </div>

      {query.isLoading && <LoadingBlock label={t("Loading categories")} variant="tile" count={3} />}
      {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {!query.isLoading && !query.isError && categories.length === 0 && (
        <p className="home-category-empty">{t("The catalogue has no stocked categories yet.")}</p>
      )}
      <div className="home-category-strip">
        {categories.map((cat) => {
          const photo = findCategoryPhoto(cat);
          return (
            <Link
              key={cat.slug}
              to={`/products?category=${encodeURIComponent(cat.slug)}`}
              className={`home-category-card${photo ? ' home-category-card--photo' : ''}`}
            >
              {photo ? (
                <img
                  className="home-category-photo"
                  src={resolveAssetUrl(photo.imageUrl)!}
                  alt=""
                  loading="lazy"
                  width={400}
                  height={300}
                />
              ) : (
                <span className="home-category-media">
                  <span className="home-category-icon">
                    <Icon name={categoryIcon(cat.slug)} width={24} height={24} />
                  </span>
                </span>
              )}
              <span className="home-category-info">
                <strong className="home-category-name">{t(cat.name)}</strong>
                <span className="home-category-count">{t(cat.productCount)} {t("items")}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
