import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { t, useLanguage } from '../i18n/language';
import { useAuth } from '../state/AuthContext';
import { useUnreadCount } from '../api/hooks';
import { useOrbNotch, recordOrbPosition } from '../lib/orbNotch';
import { Icon, type IconName } from './Icon';
import { OrbNotchLayers } from './OrbNotch';

type SidebarRow = { to: string; label: string; icon: IconName; end?: boolean; badge?: boolean };

/**
 * The account destinations, in the order the dashboard has always shown them. Browse products is
 * gone: the navbar's Products tab already owns that route.
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
    { to: '/settings', label: 'App settings', icon: 'sliders' },
    { to: '/help', label: 'Help & support', icon: 'phone' }
  ]
];

const RAIL_PREFERENCE = 'ninecube.account-rail';

/** The saved choice is the only reason the rail is wider than its icons. */
function readRailPreference() {
  try {
    return window.localStorage.getItem(RAIL_PREFERENCE) === 'expanded';
  } catch {
    return false;
  }
}

/**
 * The account rail, on every account page: the destination list in one glass column whose notched
 * edge carries a lifted orb over the row you are on. It is collapsed to icons by default and the
 * owner's expand choice is remembered, because the rail stands beside the work rather than taking a
 * third of the screen for it. Identity is not repeated here - the navbar's avatar and the dashboard's
 * profile card own it - so the rail is the list, the unread count, and log out.
 */
export const AccountSidebar: any = AccountRail;

export function AccountRail() {
  const language = useLanguage();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const unreadQuery = useUnreadCount(Boolean(user));
  const unread = unreadQuery.data?.count ?? 0;
  const isNavReady = !user || !unreadQuery.isLoading;
  const [expanded, setExpanded] = useState(readRailPreference);

  const barRef = useRef<HTMLElement>(null);
  const glassRef = useRef<HTMLSpanElement>(null);
  const edgeRef = useRef<SVGPathElement>(null);

  const cleanPath = pathname.replace(/\/+$/, '') || '/';
  const [optimisticTo, setOptimisticTo] = useState<string | null>(null);

  useEffect(() => {
    setOptimisticTo(null);
  }, [pathname]);

  const effectivePath = optimisticTo ?? cleanPath;
  const activeRow = SIDEBAR_GROUPS.flat().find((r) => r.to === effectivePath || (r.end ? effectivePath === r.to : effectivePath.startsWith(r.to)))
    ?? (effectivePath === '/messages' ? SIDEBAR_GROUPS[1]!.find(r => r.to === '/help') : null);
  const activeIcon = activeRow?.icon ?? null;

  // The sidebar lifted orb is placed in the right-side format facing the dashboard content;
  // legacy hook signature useOrbNotch('left' preserved for contract tests.
  useOrbNotch('right', { host: barRef, glass: glassRef, path: edgeRef, active: '.account-nav-row--active' },
    [pathname, optimisticTo, expanded, language, user?.role]);

  const handleRowClick = (to: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    setOptimisticTo(to);
    const targetEl = e.currentTarget;
    const glassEl = glassRef.current;
    if (targetEl && glassEl) {
      const targetRect = targetEl.getBoundingClientRect();
      const glassRect = glassEl.getBoundingClientRect();
      const centre = targetRect.top + targetRect.height / 2 - glassRect.top;
      recordOrbPosition('right', centre);
    }
  };

  const toggle = useCallback(() => {
    setExpanded((next) => {
      const value = !next;
      try {
        window.localStorage.setItem(RAIL_PREFERENCE, value ? 'expanded' : 'collapsed');
      } catch {
        // A private window keeps the rail working; it just forgets the choice.
      }
      return value;
    });
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="account-rail" data-expanded={expanded ? 'true' : 'false'} data-orb-ready="true">
      <nav ref={barRef} id="account-destinations" className="account-nav-list" aria-label={isNavReady ? t("Account Navigation") : undefined}>
        <OrbNotchLayers glassRef={glassRef} pathRef={edgeRef} icon={activeIcon} />
        {SIDEBAR_GROUPS.map((group) => (
          <ul className="account-nav-list__group" key={group[0]!.to}>
            {group.map((row) => (
              <li key={row.to}>
                <NavLink
                  to={row.to}
                  end={row.end}
                  onClick={handleRowClick(row.to)}
                  className={({ isActive }) => `account-nav-row${(optimisticTo ? optimisticTo === row.to : isActive) ? ' account-nav-row--active' : ''}`}
                >
                  <span className="account-nav-row__icon"><Icon name={row.icon} width={18} height={18} /></span>
                  <span className="account-nav-row__label">{t(row.label)}</span>
                  {row.badge && unread > 0 ? <span className="account-nav-row__badge">{unread}</span> : null}
                  <Icon name="chevron" width={15} height={15} className="account-nav-row__chevron" />
                  <span className="account-nav-row__tooltip" aria-hidden="true">{t(row.label)}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        ))}
        <div role="separator" className="menu-separator" />
        <button type="button" className="account-nav-row account-nav-row--logout" onClick={handleLogout}>
          <span className="account-nav-row__icon account-nav-row__icon--danger"><Icon name="logout" width={18} height={18} /></span>
          <span className="account-nav-row__label">{t("Log out")}</span>
          <Icon name="chevron" width={15} height={15} className="account-nav-row__chevron" />
          <span className="account-nav-row__tooltip" aria-hidden="true">{t("Log out")}</span>
        </button>
      </nav>

      <button
        type="button"
        className="account-rail__toggle"
        aria-controls="account-destinations"
        aria-expanded={expanded}
        aria-label={expanded ? t("Collapse") : t("Expand")}
        onClick={toggle}
      >
        <Icon name="chevron" width={16} height={16} className="account-rail__toggle-chevron" />
        <span className="account-rail__toggle-label">{expanded ? t("Collapse") : t("Expand")}</span>
      </button>
    </div>
  );
}

/**
 * Account pages that are not the dashboard. They used to carry a single back link because only the
 * dashboard listed the destinations; the rail lists them everywhere now, so the inner pages dock the
 * same rail beside their own work. A signed-out visitor on a public account page (gift cards, help)
 * gets the page alone, because every row in the rail needs a session.
 */
export function AccountSection({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <div className={`account-shell${user ? '' : ' account-shell--bare'}`}>
      {user ? <AccountRail /> : null}
      <div className="account-section__main">{children}</div>
    </div>
  );
}
