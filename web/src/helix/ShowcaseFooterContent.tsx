import { t, useLanguage } from '../i18n/language';
import { Link } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { useAuth } from '../state/AuthContext';
import { showcaseCopy } from './showcaseCopy';

/** Shared closing content for the animated and static public home. */
export function ShowcaseFooterContent() {
  useLanguage();
  const { user } = useAuth();
  return <>
    <div className="showcase-footer__lead">
      <p className="kicker">{t("Your next everyday favourite")}</p>
      <h2>{t(showcaseCopy.footer.headline)}</h2>
      <p>{t(showcaseCopy.footer.body)}</p>
      <Link className="btn btn--primary showcase__cta" to="/products">
        {t(showcaseCopy.footer.cta)} <span aria-hidden="true">{t("↗")}</span>
      </Link>
    </div>

    <div className="showcase-footer__grid">
      <div className="showcase-footer__col">
        <strong>{t("Store")}</strong>
        <Link to="/products">{t("Collection")}</Link>
        <Link to="/products?sort=newest">{t("New arrivals")}</Link>
        <Link to="/gift-cards">{t("Gift cards")}</Link>
        <Link to="/wishlist">{t("Wishlist")}</Link>
      </div>
      <div className="showcase-footer__col">
        <strong>{t("Help")}</strong>
        <Link to="/help">{t("Help & support")}</Link>
        <Link to="/policies/delivery">{t("Delivery")}</Link>
        <Link to="/policies/returns">{t("Returns & warranty")}</Link>
        <Link to="/policies/terms">{t("Order terms")}</Link>
      </div>
      <div className="showcase-footer__col">
        <strong>{t("Payments")}</strong>
        <p>{t("Available payment methods are shown at checkout.")}</p>
        <p>{t("Online payments are verified by the payment provider before an order is counted as paid.")}</p>
      </div>
    </div>

    <div className="showcase-footer__base">
      <div className="showcase-footer__row">
        <Link to="/" className="showcase-footer__brand"><Brand /></Link>
        <nav aria-label={t("Home footer")} className="showcase-footer__links">
          <Link to="/products">{t("Collection")}</Link>
          {user ? (
            <>
              <Link to="/orders">{t("Your orders")}</Link>
              <Link to="/account">{t("Your account")}</Link>
            </>
          ) : (
            <>
              <Link to="/login">{t("Sign in")}</Link>
              <Link to="/register">{t("Create account")}</Link>
            </>
          )}
        </nav>
      </div>
      <div className="showcase-footer__legal">
        <p>{t("© ")}{t(new Date().getFullYear())} {t(" NineCube.Digital")}</p>
        <p>{t("Built by Yeasin Arafat")}</p>
      </div>
    </div>
  </>;
}
