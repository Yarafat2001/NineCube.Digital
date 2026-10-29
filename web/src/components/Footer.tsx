import { t, useLanguage } from '../i18n/language';
import { Link } from 'react-router-dom';
import { Brand } from './Brand';
import { useAuth } from '../state/AuthContext';

export function Footer() {
  useLanguage();
  const { user } = useAuth();
  const workspace = user?.role === 'Administrator' ? '/admin' : user?.role === 'InventoryManager'
    ? '/inventory' : user?.role === 'Staff' ? '/staff' : '/orders';
  return (
    <footer className="site-footer no-print">
      <div className="container site-footer__inner">
        <Link to={user ? '/products' : '/'} className="site-footer__brand"><Brand /></Link>
        <p className="site-footer__description">{t("Orders and inventory, in one place.")}</p>
        <nav aria-label={t("Footer")} className="site-footer__links">
          <Link to={user ? workspace : '/'}>{t(user ? 'Workspace' : 'Home')}</Link><Link to="/products">{t("Catalogue")}</Link>
        </nav>
        <div className="site-footer__bottom">
          <p>{t("© ")}{t(new Date().getFullYear())} {t(" NineCube.Digital")}</p>
          <p>{t("Order Processing ")}<span aria-hidden="true">{t("·")}</span> {t(" Built by Yeasin Arafat")}</p>
        </div>
      </div>
    </footer>
  );
}
