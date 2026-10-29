import { t, useLanguage } from '../i18n/language';
import { Link } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { showcaseCopy } from './showcaseCopy';

/** Shared closing content for the animated and static public home. */
export function ShowcaseFooterContent() {
  useLanguage();
  return <>
    <div className="showcase-footer__lead">
      <p className="kicker">{t("Your next everyday favourite")}</p>
      <h2>{t(showcaseCopy.footer.headline)}</h2>
      <p>{t(showcaseCopy.footer.body)}</p>
      <Link className="btn btn--primary showcase__cta" to="/products">
        {t(showcaseCopy.footer.cta)} <span aria-hidden="true">{t("↗")}</span>
      </Link>
    </div>
    <div className="showcase-footer__base">
      <div className="showcase-footer__row">
        <Link to="/" className="showcase-footer__brand"><Brand /></Link>
        <nav aria-label={t("Home footer")} className="showcase-footer__links">
          <Link to="/products">{t("Collection")}</Link>
          <Link to="/login">{t("Sign in")}</Link>
          <Link to="/register">{t("Create account")}</Link>
        </nav>
      </div>
      <div className="showcase-footer__legal">
        <p>{t("© ")}{t(new Date().getFullYear())} {t(" NineCube.Digital")}</p>
        <p>{t("Built by Yeasin Arafat")}</p>
      </div>
    </div>
  </>;
}
