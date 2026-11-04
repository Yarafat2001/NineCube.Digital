import { t, useLanguage } from '../i18n/language';
import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import { useCart } from '../state/CartContext';
import { useWishlist } from '../api/hooks';
import { Icon } from './Icon';

export function MobileNav() {
  useLanguage();
  const { user } = useAuth();
  const { itemCount } = useCart();
  const location = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const wishlistQuery = useWishlist();
  const wishlistCount = wishlistQuery.data?.length ?? 0;
  const [cartPulse, setCartPulse] = useState(false);

  useEffect(() => {
    if (itemCount > 0) {
      setCartPulse(true);
      const timer = setTimeout(() => setCartPulse(false), 500);
      return () => clearTimeout(timer);
    }
  }, [itemCount]);

  // Publish measured height to --mobile-nav-h
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const publish = () => {
      const isMobile = window.matchMedia('(max-width: 768px)').matches;
      if (isMobile) {
        const height = Math.round(nav.getBoundingClientRect().height);
        document.documentElement.style.setProperty('--mobile-nav-h', `${height}px`);
      } else {
        document.documentElement.style.setProperty('--mobile-nav-h', '0px');
      }
    };

    publish();
    window.addEventListener('resize', publish);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(publish) : null;
    observer?.observe(nav);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', publish);
      document.documentElement.style.setProperty('--mobile-nav-h', '0px');
    };
  }, []);

  const openCart = () => {
    document.dispatchEvent(new CustomEvent('ninecube:open-cart-sheet'));
  };

  const canOrder = !user || user.role === 'Customer';
  const isHomeActive = location.pathname === '/';
  const isCatalogActive = location.pathname === '/products' || location.pathname.startsWith('/products/');
  const isWishlistActive = location.pathname === '/wishlist';
  const isAccountActive = location.pathname.startsWith('/account') || location.pathname === '/orders';

  return (
    <nav
      ref={navRef}
      className="mobile-nav"
      aria-label={t("Mobile Navigation")}
      data-testid="mobile-bottom-nav"
    >
      <NavLink
        to="/"
        className={`mobile-nav__item ${isHomeActive ? 'mobile-nav__item--active' : ''}`}
        aria-current={isHomeActive ? 'page' : undefined}
      >
        <div className="mobile-nav__icon-wrap">
          <Icon name="home" width={22} height={22} />
        </div>
        <span className="mobile-nav__label">{t("Home")}</span>
      </NavLink>

      <NavLink
        to="/products"
        className={`mobile-nav__item ${isCatalogActive ? 'mobile-nav__item--active' : ''}`}
        aria-current={isCatalogActive ? 'page' : undefined}
      >
        <div className="mobile-nav__icon-wrap">
          <Icon name="grid" width={22} height={22} />
        </div>
        <span className="mobile-nav__label">{t("Explore")}</span>
      </NavLink>

      <NavLink
        to={user ? "/wishlist" : "/login"}
        className={`mobile-nav__item ${isWishlistActive ? 'mobile-nav__item--active' : ''}`}
        aria-current={isWishlistActive ? 'page' : undefined}
      >
        <div className="mobile-nav__icon-wrap">
          <Icon name="heart" width={22} height={22} />
          {wishlistCount > 0 ? (
            <span className="mobile-nav__badge" aria-label={t(`${wishlistCount} saved items`)}>
              {wishlistCount > 9 ? '9+' : wishlistCount}
            </span>
          ) : null}
        </div>
        <span className="mobile-nav__label">{t("Wishlist")}</span>
      </NavLink>

      {canOrder ? (
        <button
          type="button"
          className="mobile-nav__item mobile-nav__item--btn"
          onClick={openCart}
          aria-label={t(`Cart, ${itemCount} item${itemCount === 1 ? '' : 's'}`)}
        >
          <div className="mobile-nav__icon-wrap">
            <Icon name="cart" width={22} height={22} />
            {itemCount > 0 ? (
              <span className={`mobile-nav__badge mobile-nav__badge--accent ${cartPulse ? 'mobile-nav__badge--pulse' : ''}`} aria-label={t(`${itemCount} items in cart`)}>
                {itemCount > 9 ? '9+' : itemCount}
              </span>
            ) : null}
          </div>
          <span className="mobile-nav__label">{t("Cart")}</span>
        </button>
      ) : (
        <NavLink
          to="/account"
          className={`mobile-nav__item ${location.pathname === '/account' ? 'mobile-nav__item--active' : ''}`}
          aria-current={location.pathname === '/account' ? 'page' : undefined}
        >
          <div className="mobile-nav__icon-wrap">
            <Icon name="grid" width={22} height={22} />
          </div>
          <span className="mobile-nav__label">{t("Dashboard")}</span>
        </NavLink>
      )}

      <NavLink
        to={user ? "/account" : "/login"}
        className={`mobile-nav__item ${isAccountActive ? 'mobile-nav__item--active' : ''}`}
        aria-current={isAccountActive ? 'page' : undefined}
      >
        <div className="mobile-nav__icon-wrap">
          <Icon name="user" width={22} height={22} />
        </div>
        <span className="mobile-nav__label">{t(user ? "Account" : "Sign in")}</span>
      </NavLink>
    </nav>
  );
}
