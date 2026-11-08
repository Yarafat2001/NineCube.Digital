import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { t, useLanguage } from '../../i18n/language';
import { useAuth } from '../../state/AuthContext';
import { useUnreadCount } from '../../api/hooks';
import { Icon, type IconName } from '../Icon';
import { CommandPalette } from './CommandPalette';

export interface FloatingGlassAdminShellProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  activeSection?: string;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  onOpenSearch?: () => void;
}

interface NavItem {
  id: string;
  label: string;
  to: string;
  icon: IconName;
  badge?: number;
  roles?: string[];
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

const SIDEBAR_NAV: NavGroup[] = [
  {
    group: 'SHOP',
    items: [
      { id: 'dashboard', label: 'Dashboard', to: '/account', icon: 'grid' },
      { id: 'orders', label: 'Orders', to: '/staff', icon: 'box', badge: 3 },
      { id: 'products', label: 'Products', to: '/inventory', icon: 'tag', badge: 6 },
      { id: 'analytics', label: 'Analytics', to: '/staff/sales', icon: 'chart' },
      { id: 'customers', label: 'Customers', to: '/admin', icon: 'users' }
    ]
  },
  {
    group: 'MONEY',
    items: [
      { id: 'finances', label: 'Finances', to: '/staff/sales', icon: 'wallet' },
      { id: 'invoices', label: 'Invoices', to: '/orders', icon: 'doc' },
      { id: 'discounts', label: 'Discounts', to: '/admin', icon: 'ticket' }
    ]
  },
  {
    group: 'TALK',
    items: [
      { id: 'chats', label: 'Chats', to: '/messages', icon: 'chat', badge: 1 },
      { id: 'operations', label: 'Operations', to: '/operations', icon: 'sliders' }
    ]
  },
  {
    group: 'SETTINGS & SUPPORT',
    items: [
      { id: 'settings', label: 'Settings', to: '/settings', icon: 'sliders' },
      { id: 'security', label: 'Security', to: '/account/security', icon: 'shield' },
      { id: 'help', label: 'Help center', to: '/help', icon: 'phone' }
    ]
  }
];

const MINI_STORAGE_KEY = 'ninecube.sidebar-mini';
const THEME_STORAGE_KEY = 'ninecube-theme';

export function FloatingGlassAdminShell({
  children,
  title,
  subtitle,
  activeSection,
  primaryAction,
  secondaryAction,
  onOpenSearch
}: FloatingGlassAdminShellProps) {
  useLanguage();
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const unreadQuery = useUnreadCount(Boolean(user));
  const unreadCount = unreadQuery.data?.count ?? 0;

  // Mini sidebar state with localStorage persistence
  const [mini, setMini] = useState<boolean>(() => {
    try {
      if (typeof window !== 'undefined' && window.innerWidth <= 820) return true;
      return localStorage.getItem(MINI_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  // Current theme state
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.dataset.theme !== 'light';
    }
    return true;
  });

  // Dropdowns and Popovers state
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [storeName, setStoreName] = useState('Main Store');

  const handleOpenSearch = onOpenSearch || (() => setShowCommandPalette(true));

  // Global listener for open command palette event
  useEffect(() => {
    const handler = () => setShowCommandPalette(true);
    window.addEventListener('ninecube:open-command-palette', handler);
    return () => window.removeEventListener('ninecube:open-command-palette', handler);
  }, []);

  // Tooltip state for mini mode
  const [tooltip, setTooltip] = useState<{ text: string; top: number; left: number; visible: boolean }>({
    text: '',
    top: 0,
    left: 0,
    visible: false
  });

  const sidebarRef = useRef<HTMLElement>(null);
  const userButtonRef = useRef<HTMLButtonElement>(null);
  const notifButtonRef = useRef<HTMLButtonElement>(null);

  // Sync theme with document element
  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    if (typeof document !== 'undefined') {
      const themeValue = next ? 'dark' : 'light';
      document.documentElement.dataset.theme = themeValue;
      try {
        localStorage.setItem(THEME_STORAGE_KEY, themeValue);
      } catch {
        /* Ignore */
      }
    }
  };

  // Toggle mini mode
  const toggleMini = () => {
    setMini((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MINI_STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* Ignore */
      }
      return next;
    });
    setTooltip((t) => ({ ...t, visible: false }));
  };

  // Auto-collapse on small viewports
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 820) setMini(true);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close mobile drawer on route transition
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.pop') && !target.closest('#create-menu-btn')) {
        setShowCreateMenu(false);
      }
      if (!target.closest('.menu') && !target.closest('.user-card') && !target.closest('#notif-btn')) {
        setShowUserMenu(false);
        setShowNotifications(false);
      }
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Handle tooltip triggers
  const handleMouseEnter = (text: string, e: React.MouseEvent<HTMLElement>) => {
    if (!mini) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      text,
      left: rect.right + 12,
      top: rect.top + rect.height / 2,
      visible: true
    });
  };

  const handleMouseLeave = () => {
    if (tooltip.visible) {
      setTooltip((t) => ({ ...t, visible: false }));
    }
  };

  // Time-based greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('Good morning');
    if (hour < 18) return t('Good afternoon');
    return t('Good evening');
  };

  const userName = user?.fullName || user?.email?.split('@')[0] || 'Team';
  const userInitials = (user?.fullName || user?.email || 'NC')
    .split(/[ _@.-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase())
    .join('');

  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  });

  const sectionName = activeSection || title || 'Operations';

  const STORES = ['Main Store', 'Flagship Outlet', 'Second Shop'];

  return (
    <div className={`glass-admin-layout ${mini ? 'mini' : ''} ${mobileOpen ? 'drawer-open' : ''}`}>
      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="glass-drawer-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-label={t('Close sidebar')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setMobileOpen(false);
          }}
        />
      )}

      {/* Floating Frosted Glass Sidebar */}
      <aside ref={sidebarRef} className={`side glass ${mobileOpen ? 'mobile-show' : ''}`} aria-label={t('Admin Sidebar')}>
        {/* Brand Block */}
        <div className="brand-block">
          <div className="logo brand-logo-cube" aria-hidden="true" title={t('NineCube.Digital')}>
            <svg viewBox="62 10 45 51" width="22" height="25" aria-hidden="true" focusable="false" style={{ display: 'block' }}>
              <path fill="var(--brand-strong, #f59e0b)" fillRule="evenodd" d="M65 24.2 85 12 105 24 104.4 48 97.2 52.2 96.1 31 84.2 36 65 24.2Z M76.2 24.2 85 19 93.2 23.6 84.2 29Z" />
              <path fill="var(--logo-face, #ffffff)" d="M64.2 25.5 83 35.2 83 58.6 64.2 47.5Z M84.3 36.3 96 31 96.2 51 84.3 58.7Z" />
            </svg>
          </div>
          <div className="bt">
            <b>{t('NineCube.Digital')}</b>
            <small>{t('Digital Operations')}</small>
          </div>
          <button
            type="button"
            className="tg"
            aria-label={mini ? t('Expand sidebar') : t('Collapse sidebar')}
            aria-expanded={!mini}
            onClick={toggleMini}
            onMouseEnter={(e) => handleMouseEnter(mini ? t('Expand sidebar') : t('Collapse sidebar'), e)}
            onMouseLeave={handleMouseLeave}
          >
            <Icon name="chevron" width={16} height={16} />
          </button>
        </div>

        {/* Global Search Trigger (Ctrl+K) */}
        <button
          type="button"
          className="sch"
          onClick={handleOpenSearch}
          onMouseEnter={(e) => handleMouseEnter(t('Search (Ctrl K)'), e)}
          onMouseLeave={handleMouseLeave}
          aria-label={t('Search (Ctrl K)')}
        >
          <Icon name="search" width={16} height={16} />
          <span className="stx">{t('Search…')}</span>
          <kbd>{t('Ctrl K')}</kbd>
        </button>

        {/* Grouped Navigation List */}
        <div className="scr">
          <nav aria-label={t('Main Navigation')}>
            {SIDEBAR_NAV.slice(0, 3).map((grp) => (
              <div key={grp.group}>
                <div className="grp" role="presentation">
                  <span>{t(grp.group)}</span>
                </div>
                {grp.items.map((item) => {
                  const isActive = location.pathname === item.to || (item.to !== '/account' && location.pathname.startsWith(item.to));
                  return (
                    <NavLink
                      key={item.id}
                      to={item.to}
                      className={isActive ? 'active' : ''}
                      onMouseEnter={(e) => handleMouseEnter(t(item.label), e)}
                      onMouseLeave={handleMouseLeave}
                    >
                      <Icon name={item.icon} width={18} height={18} />
                      <span className="lbl">{t(item.label)}</span>
                      {item.badge ? (
                        <span className="bdg" aria-label={`${item.badge} new`}>
                          {item.badge}
                        </span>
                      ) : null}
                    </NavLink>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        {/* Footer Area with Settings, Dark Mode Switch and User Profile */}
        <div className="foot">
          <nav aria-label={t('Support Navigation')}>
            {SIDEBAR_NAV[3]!.items.map((item) => {
              const isActive = location.pathname === item.to;
              return (
                <NavLink
                  key={item.id}
                  to={item.to}
                  className={isActive ? 'active' : ''}
                  onMouseEnter={(e) => handleMouseEnter(t(item.label), e)}
                  onMouseLeave={handleMouseLeave}
                >
                  <Icon name={item.icon} width={18} height={18} />
                  <span className="lbl">{t(item.label)}</span>
                </NavLink>
              );
            })}
          </nav>

          {/* Dark Mode Switch */}
          <button
            type="button"
            className="dm"
            onClick={toggleTheme}
            onMouseEnter={(e) => handleMouseEnter(isDark ? t('Light mode') : t('Dark mode'), e)}
            onMouseLeave={handleMouseLeave}
            aria-label={t('Toggle dark mode')}
          >
            <Icon name={isDark ? 'moon' : 'sun'} width={18} height={18} />
            <span className="dl">{t('Dark mode')}</span>
            <i className="sw" role="switch" aria-checked={isDark} aria-label={t('Dark mode')} />
          </button>

          {/* User Profile Card */}
          <button
            ref={userButtonRef}
            type="button"
            className="user-card"
            onClick={(e) => {
              e.stopPropagation();
              setShowUserMenu((prev) => !prev);
              setShowNotifications(false);
            }}
            onMouseEnter={(e) => handleMouseEnter(userName, e)}
            onMouseLeave={handleMouseLeave}
            aria-haspopup="menu"
            aria-expanded={showUserMenu}
          >
            <div className="av on">{userInitials}</div>
            <div>
              <b style={{ fontSize: '13px' }}>{userName}</b>
              <small>{user?.email || 'staff@ninecube.digital'}</small>
            </div>
            <span className="sel" aria-hidden="true">
              <Icon name="chevron" width={14} height={14} />
            </span>
          </button>
        </div>
      </aside>

      {/* Floating Hover Tooltip (Mini Rail Mode) */}
      <div
        className={`tip ${tooltip.visible ? 'on' : ''}`}
        style={{ left: `${tooltip.left}px`, top: `${tooltip.top}px` }}
        role="tooltip"
      >
        {tooltip.text}
      </div>

      {/* User Profile Popover Menu */}
      {showUserMenu && (
        <div
          className="menu glass"
          style={{
            bottom: '24px',
            left: mini ? '84px' : '244px',
            position: 'fixed',
            zIndex: 80
          }}
          role="menu"
          aria-label={t('User Menu')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 8px 12px' }}>
            <div className="av on">{userInitials}</div>
            <div>
              <b>{userName}</b>
              <small style={{ color: 'var(--dim)', display: 'block' }}>{user?.email} · {user?.role || 'Staff'}</small>
            </div>
          </div>
          <div className="mh">{t('SWITCH STORE')}</div>
          {STORES.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitem"
              onClick={() => {
                setStoreName(s);
                setShowUserMenu(false);
              }}
            >
              {s}
              {storeName === s ? (
                <span style={{ marginLeft: 'auto', color: 'var(--acc2)' }}>
                  <Icon name="check" width={14} height={14} />
                </span>
              ) : null}
            </button>
          ))}
          <hr />
          <NavLink to="/account/profile" role="menuitem" onClick={() => setShowUserMenu(false)}>
            <Icon name="user" width={16} height={16} />
            {t('View profile')}
          </NavLink>
          <NavLink to="/settings" role="menuitem" onClick={() => setShowUserMenu(false)}>
            <Icon name="sliders" width={16} height={16} />
            {t('Account settings')}
          </NavLink>
          <NavLink to="/notifications" role="menuitem" onClick={() => setShowUserMenu(false)}>
            <Icon name="bell" width={16} height={16} />
            {t('Notifications')}
          </NavLink>
          <hr />
          <button
            type="button"
            role="menuitem"
            style={{ color: 'var(--bad)' }}
            onClick={() => {
              setShowUserMenu(false);
              logout();
              navigate('/login');
            }}
          >
            <Icon name="logout" width={16} height={16} />
            {t('Sign out')}
          </button>
        </div>
      )}

      {/* Notifications Popover Menu */}
      {showNotifications && (
        <div
          className="menu glass"
          style={{
            top: '72px',
            right: '80px',
            width: '320px',
            position: 'fixed',
            zIndex: 80
          }}
          role="menu"
          aria-label={t('Notifications')}
        >
          <div style={{ display: 'flex', alignItems: 'center', padding: '6px 8px 10px' }}>
            <b>{t('Notifications')}</b>
            <NavLink
              to="/notifications"
              className="pill"
              style={{ marginLeft: 'auto', textDecoration: 'none', fontSize: '11.5px', padding: '3px 10px' }}
              onClick={() => setShowNotifications(false)}
            >
              {t('View all')}
            </NavLink>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ padding: '8px', borderRadius: '10px', background: 'var(--glass2)' }}>
              <b style={{ fontSize: '12.5px', display: 'block' }}>{t('New order placed')}</b>
              <small style={{ color: 'var(--dim)' }}>{t('Recently')}</small>
            </div>
            <div style={{ padding: '8px', borderRadius: '10px', background: 'var(--glass2)' }}>
              <b style={{ fontSize: '12.5px', display: 'block' }}>{t('Low stock alert')}</b>
              <small style={{ color: 'var(--dim)' }}>{t('Review inventory')}</small>
            </div>
            <div style={{ padding: '8px', borderRadius: '10px', background: 'var(--glass2)' }}>
              <b style={{ fontSize: '12.5px', display: 'block' }}>{t('Customer message')}</b>
              <small style={{ color: 'var(--dim)' }}>{t('Site chat · usually replies in minutes')}</small>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area with Floating Top Area */}
      <main className="glass-admin-content" id="main">
        {/* Top Area */}
        <div className="top">
          <button
            type="button"
            className="rb glass mobile-menu-btn"
            aria-label={t('Toggle navigation')}
            onClick={() => setMobileOpen((prev) => !prev)}
          >
            <Icon name="menu" width={18} height={18} />
          </button>
          <div>
            <h2>
              {getGreeting()}, {userName}
            </h2>
            <small>
              <i className="dot" aria-hidden="true" />
              <span>
                {formattedDate} · {sectionName}
              </span>
            </small>
          </div>

          {/* Top Right Utility Buttons */}
          <div className="r">
            <button
              type="button"
              className="rb glass"
              aria-label={t('Search (Ctrl K)')}
              onClick={handleOpenSearch}
              title={t('Search (Ctrl K)')}
            >
              <Icon name="search" width={18} height={18} />
            </button>

            <button
              ref={notifButtonRef}
              type="button"
              className="rb glass"
              id="notif-btn"
              aria-label={t('Notifications')}
              onClick={(e) => {
                e.stopPropagation();
                setShowNotifications((prev) => !prev);
                setShowUserMenu(false);
              }}
            >
              <Icon name="bell" width={18} height={18} />
              {unreadCount > 0 ? <i>{unreadCount}</i> : null}
            </button>

            {/* Primary "+ Create" button */}
            <div style={{ position: 'relative' }}>
              <button
                id="create-menu-btn"
                type="button"
                className="btn pri"
                aria-haspopup="menu"
                aria-expanded={showCreateMenu}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCreateMenu((prev) => !prev);
                }}
              >
                <Icon name="plus" width={16} height={16} />
                <span>{t('Create')}</span>
              </button>

              {/* Quick-create Popover Menu */}
              {showCreateMenu && (
                <div className="pop glass" role="menu" aria-label={t('Create menu')}>
                  <NavLink to="/staff" role="menuitem" onClick={() => setShowCreateMenu(false)}>
                    <Icon name="box" width={15} height={15} />
                    {t('Order')}
                  </NavLink>
                  <NavLink to="/inventory" role="menuitem" onClick={() => setShowCreateMenu(false)}>
                    <Icon name="tag" width={15} height={15} />
                    {t('Product')}
                  </NavLink>
                  <NavLink to="/admin" role="menuitem" onClick={() => setShowCreateMenu(false)}>
                    <Icon name="users" width={15} height={15} />
                    {t('Customer')}
                  </NavLink>
                  <NavLink to="/orders" role="menuitem" onClick={() => setShowCreateMenu(false)}>
                    <Icon name="doc" width={15} height={15} />
                    {t('Invoice')}
                  </NavLink>
                  <NavLink to="/admin" role="menuitem" onClick={() => setShowCreateMenu(false)}>
                    <Icon name="ticket" width={15} height={15} />
                    {t('Discount code')}
                  </NavLink>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Page Content Header Pattern (if title is provided) */}
        {title ? (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
            <div>
              <h1 style={{ fontSize: '32px', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.15, color: 'var(--ink)' }}>
                {title}
              </h1>
              {subtitle ? <p style={{ color: 'var(--dim)', margin: '6px 0 0', fontSize: '14px' }}>{subtitle}</p> : null}
            </div>
            {(primaryAction || secondaryAction) && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'center' }}>
                {secondaryAction}
                {primaryAction}
              </div>
            )}
          </div>
        ) : null}

        {/* View Content */}
        {children}
      </main>

      {/* Global Command Palette */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        onToggleTheme={toggleTheme}
      />
    </div>
  );
}
