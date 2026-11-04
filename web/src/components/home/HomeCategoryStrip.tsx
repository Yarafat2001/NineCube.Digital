import { t, useLanguage } from '../../i18n/language';
import { useCategories } from '../../api/hooks';
import { ErrorState, LoadingBlock } from '../ui';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../Icon';

export function HomeCategoryStrip() {
  useLanguage();

  const query = useCategories();
  const categories = (query.data ?? []).filter(category => category.isActive && category.productCount > 0).slice(0, 6);
  const categoryIcon = (slug: string): IconName => /shoe|footwear/.test(slug) ? 'shoe' : /electronic|tech|laptop|phone/.test(slug) ? 'spark' : /home|kitchen|coffee/.test(slug) ? 'coffee' : /furniture|living/.test(slug) ? 'chair' : 'box';


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
      <div className="home-category-strip">
        {categories.map((cat) => (
          <Link
            key={cat.slug}
            to={`/products?category=${encodeURIComponent(cat.slug)}`}
            className="home-category-card"
          >
            <div className="home-category-icon">
              <Icon name={categoryIcon(cat.slug)} width={24} height={24} />
            </div>
            <div className="home-category-info">
              <strong className="home-category-name">{cat.name}</strong>
              <span className="home-category-count">{t(cat.productCount)} {t("items")}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
