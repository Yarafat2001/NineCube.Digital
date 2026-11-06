import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { t, useLanguage } from '../i18n/language';
import { Icon, type IconName } from './Icon';

type SidebarRow = { to: string; label: string; icon: IconName; end?: boolean; badge?: boolean };

/**
 * The account destination list, in the order the dashboard has always shown it. Browse products is
 * gone: the navbar's Products tab already owns that route, so the dashboard was listing a destination
 * the header listed too.
 */
const SIDEBAR_GROUPS: SidebarRow[][] = [
  [
    { to: '/account', label: 'Dashboard', icon: 'grid', end: true },
    { to: '/orders', label: 'My Orders', icon: 'box' },
    { to: '/wishlist', label: 'Wishlist', icon: 'heart' },
    { to: '/gift-cards', label: 'Gift Cards', icon: 'wallet' },
    { to: '/account/profile', label: 'Profile & Addresses', icon: 'user' }
  ],
  [
    { to: '/account/security', label: 'Account security', icon: 'shield' },
    { to: '/notifications', label: 'Notifications', icon: 'bell', badge: true },
    { to: '/help', label: 'Help & support', icon: 'phone' }
  ]
];

/**
 * The dashboard's navigation, docked beside its content: every account destination in one glass
 * column, the unread count on Notifications, and log out last. It is the only place that lists
 * these destinations, which is why the inner pages carry a single back link instead of a copy.
 */
export function AccountSidebar({ unread, onLogout }: { unread: number; onLogout: () => void }) {
  useLanguage();
  const listRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const [spot, setSpot] = useState({ top: 0, height: 0 });

  // One indicator travels between rows, so the active state has to be measured, not guessed.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const active = list.querySelector<HTMLElement>('.account-nav-row--active');
      if (!active) return;
      setSpot({ top: active.offsetTop, height: active.offsetHeight });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [pathname]);

  return (
    <nav ref={listRef} className="account-nav-list" aria-label={t("Account Navigation")}>
      <span className="account-nav__spot" aria-hidden="true" data-measured={spot.height > 0}
        style={{ '--spot-y': `${spot.top}px`, '--spot-h': `${spot.height}px` } as CSSProperties} />
      {SIDEBAR_GROUPS.map((group) => (
        <ul className="account-nav-list__group" key={group[0]!.to}>
          {group.map((row) => (
            <li key={row.to}>
              <NavLink
                to={row.to}
                end={row.end}
                className={({ isActive }) => `account-nav-row${isActive ? ' account-nav-row--active' : ''}`}
              >
                <span className="account-nav-row__icon"><Icon name={row.icon} width={17} height={17} /></span>
                <span className="account-nav-row__label">{t(row.label)}</span>
                {row.badge && unread > 0 ? <span className="account-nav-row__badge">{unread}</span> : null}
                <Icon name="chevron" width={15} height={15} className="account-nav-row__chevron" />
              </NavLink>
            </li>
          ))}
        </ul>
      ))}
      <div role="separator" className="menu-separator" />
      <button type="button" className="account-nav-row account-nav-row--logout" onClick={onLogout}>
        <span className="account-nav-row__icon account-nav-row__icon--danger"><Icon name="logout" width={17} height={17} /></span>
        <span className="account-nav-row__label">{t("Log out")}</span>
        <Icon name="chevron" width={15} height={15} className="account-nav-row__chevron" />
      </button>
    </nav>
  );
}

/**
 * Inner account pages: no destination list here, because the dashboard owns it. One back link is
 * enough to leave, and it keeps log out two taps away from any page.
 */
export function AccountSection({ children }: { children: ReactNode }) {
  useLanguage();
  return (
    <div className="account-section">
      <Link className="account-back" to="/account">
        <Icon name="chevron" width={14} height={14} className="account-back__chevron" aria-hidden="true" />
        {t("Back to dashboard")}
      </Link>
      <div className="account-section__main">{children}</div>
    </div>
  );
}
