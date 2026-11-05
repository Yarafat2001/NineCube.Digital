import { useEffect, useRef, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { t, useLanguage } from '../i18n/language';
import { Icon, type IconName } from './Icon';

const ACCOUNT_LINKS: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/account', label: 'Dashboard', icon: 'grid', end: true },
  { to: '/orders', label: 'My Orders', icon: 'box' },
  { to: '/wishlist', label: 'Wishlist', icon: 'heart' },
  { to: '/gift-cards', label: 'Gift Cards', icon: 'wallet' },
  { to: '/account/profile', label: 'Profile & Addresses', icon: 'user' },
  { to: '/account/security', label: 'Account security', icon: 'shield' },
  { to: '/notifications', label: 'Notifications', icon: 'bell' },
  { to: '/help', label: 'Help & support', icon: 'phone' }
];

/**
 * The one account navigation surface every account page shares: a sticky link rail on
 * desktop and a horizontal chip row on phones. The dashboard keeps its own tile hub.
 */
export function AccountNav() {
  useLanguage();
  const navRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();

  // On phones the rail is a scrollable chip row; keep the active chip in view.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || nav.scrollWidth <= nav.clientWidth) return;
    const active = nav.querySelector<HTMLElement>('.account-nav__link--active');
    if (!active) return;
    nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
  }, [pathname]);

  return (
    <nav ref={navRef} className="account-nav" aria-label={t("Account Navigation")}>
      {ACCOUNT_LINKS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `account-nav__link${isActive ? ' account-nav__link--active' : ''}`}
        >
          <Icon name={item.icon} width={16} height={16} aria-hidden="true" />
          <span>{t(item.label)}</span>
        </NavLink>
      ))}
    </nav>
  );
}

/** Two-column shell: the rail beside the page's own content. */
export function AccountSection({ children }: { children: ReactNode }) {
  return (
    <div className="account-section">
      <AccountNav />
      <div className="account-section__main">{children}</div>
    </div>
  );
}
