import { Link } from 'react-router-dom';
import { Brand } from './Brand';
import { useAuth } from '../state/AuthContext';

export function Footer() {
  const { user } = useAuth();
  const workspace = user?.role === 'Administrator' ? '/admin' : user?.role === 'InventoryManager'
    ? '/inventory' : user?.role === 'Staff' ? '/staff' : '/orders';
  return (
    <footer className="site-footer no-print">
      <div className="container site-footer__inner">
        <Link to={user ? '/products' : '/'} className="site-footer__brand"><Brand /></Link>
        <p className="site-footer__description">Orders and inventory, in one place.</p>
        <nav aria-label="Footer" className="site-footer__links">
          <Link to={user ? workspace : '/'}>{user ? 'Workspace' : 'Home'}</Link><Link to="/products">Catalogue</Link>
        </nav>
        <div className="site-footer__bottom">
          <p>© {new Date().getFullYear()} NineCube.Digital</p>
          <p>Order Processing <span aria-hidden="true">·</span> Built by Yeasin Arafat</p>
        </div>
      </div>
    </footer>
  );
}
