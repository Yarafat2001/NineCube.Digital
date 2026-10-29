import { t, useLanguage } from '../i18n/language';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  useLanguage();
  return (
    <div className="page container">
      <div className="state">
        <p className="state__title">{t("Page not found")}</p>
        <p>{t("The page you asked for does not exist.")}</p>
        <Link className="btn btn--primary" to="/products">
          {t("Back to the catalogue")}</Link>
      </div>
    </div>
  );
}
