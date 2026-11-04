import { t, useLanguage } from '../../i18n/language';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../Icon';

export function HomeCategoryStrip() {
  useLanguage();

  const categories: Array<{ slug: string; name: string; icon: IconName; count: string }> = [
    { slug: 'electronics', name: t("Electronics & Tech"), icon: 'spark', count: '58+' },
    { slug: 'footwear', name: t("Footwear"), icon: 'shoe', count: '45+' },
    { slug: 'home', name: t("Kitchen & Home"), icon: 'coffee', count: '30+' },
    { slug: 'furniture', name: t("Furniture & Living"), icon: 'chair', count: '27+' },
    { slug: 'grocery', name: t("Grocery & Essentials"), icon: 'box', count: '19+' },
    { slug: 'fashion', name: t("Fashion & Apparel"), icon: 'tag', count: '15+' }
  ];

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

      <div className="home-category-strip">
        {categories.map((cat) => (
          <Link
            key={cat.slug}
            to={`/products?category=${cat.slug}`}
            className="home-category-card"
          >
            <div className="home-category-icon">
              <Icon name={cat.icon} width={24} height={24} />
            </div>
            <div className="home-category-info">
              <strong className="home-category-name">{cat.name}</strong>
              <span className="home-category-count">{cat.count} {t("items")}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
