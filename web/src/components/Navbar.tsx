import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { UserRole } from '../api/types';
import { ThemeControls } from './ThemeControls';
import { Brand } from './Brand';
import { AccountMenu, NotificationBell } from './AccountMenu';
import { Icon } from './Icon';
import { roleShortLabels } from '../lib/helpers';
import { useAuth } from '../state/AuthContext';
import { useCart } from '../state/CartContext';
import { CartSheet } from './CartPanel';

export interface NavItem {
  to: string;
  label: string;
}

/**
 * Navigation is derived from the role, so a user only ever sees what they can actually use.
 * This is a usability affordance only - every endpoint is enforced server side.
 *
 * Mapping of the brief's per-role link lists:
 *   Customer          -> Products, My Orders
 *   Staff             -> Products, Orders (the staff console), Sales (the summary)
 *   Inventory Manager -> Products, Inventory
 *   Administrator     -> Products, Admin, Staff, Inventory
 *
 * The public home page is separate from the signed-in workspace. Products are readable by
 * every role; ordering controls remain Customer-only and are enforced by the API.
 */
export function navItemsFor(role: UserRole): NavItem[] {
  switch (role) {
    case 'Customer':
      return [
        { to: '/products', label: 'Products' },
        { to: '/orders', label: 'My Orders' }
      ];
    case 'Staff':
      return [
        { to: '/products', label: 'Products' },
        { to: '/staff', label: 'Orders' },
        { to: '/staff/sales', label: 'Sales' }
      ];
    case 'InventoryManager':
      return [
        { to: '/products', label: 'Products' },
        { to: '/inventory', label: 'Inventory' }
      ];
    case 'Administrator':
      return [
        { to: '/products', label: 'Products' },
        { to: '/admin', label: 'Admin' },
        { to: '/staff', label: 'Staff' },
        { to: '/inventory', label: 'Inventory' }
      ];
    default:
      return [];
  }
}

export function Navbar() {
  const { user } = useAuth();
  const location = useLocation();

  const navRef = useRef<HTMLElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const [hidden, setHidden] = useState(false);

  const role = user?.role;
  const items = useMemo(() => role ? navItemsFor(role) : location.pathname === '/'
    ? [{ to: '/', label: 'Home' }, { to: '/products', label: 'Collection' }] : [], [role, location.pathname]);

  // Only the most specific match is "current". A plain prefix test marked both "Orders" (/staff)
  // and "Sales" (/staff/sales) as active on the sales page, which lit two links at once and drew
  // the sliding pill under the wrong one.
  const activeTo = useMemo(() => {
    const matches = items.filter(({ to }) =>
      to === '/' ? location.pathname === '/' : location.pathname === to || location.pathname.startsWith(`${to}/`)
    );

    return matches.reduce<string | null>((best, item) => (!best || item.to.length > best.length ? item.to : best), null);
  }, [items, location.pathname]);

  // Everything that must clear the floating header — sticky sidebars, chips rows,
  // table headers and the document's `scroll-padding-top` — is derived from `--nav-h`.
  // The bar's height comes from its content, so the token's fallback had drifted 11px
  // away from what actually renders; publishing the measured height is what keeps a
  // sticky panel from sliding behind the glass.
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const publish = () => {
      const height = Math.round(nav.getBoundingClientRect().height);
      if (height > 0) {
        document.documentElement.style.setProperty('--nav-h', `${height}px`);
        document.documentElement.style.setProperty('--header-height', `${height}px`);
      }
    };
    publish();

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(publish) : null;
    observer?.observe(nav);
    window.addEventListener('resize', publish);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', publish);
    };
  }, [items.length, user?.role, location.pathname]);

  // Compact after 8px of scroll; on <=768px hide on scroll down, show on scroll up.
  // Transform only, and never while a menu, drawer, sheet or popover is open.
  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const y = window.scrollY;
        setCompact(y > 8);
        const narrow = window.matchMedia('(max-width: 768px)').matches;
        const overlayOpen = document.querySelector('[data-overlay-open="true"]') !== null;
        if (narrow && !overlayOpen) {
          setHidden(y > 120 && y > lastY + 4);
          if (y < lastY - 4) setHidden(false);
        } else {
          setHidden(false);
        }
        lastY = y;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [location.pathname]);

  // Arrow keys move between links, so the tray is fully keyboard operable.
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;

    const links = Array.from(trayRef.current?.querySelectorAll<HTMLAnchorElement>('.navbar__link') ?? []);
    const index = links.findIndex((link) => link === document.activeElement);
    if (index === -1) return;

    event.preventDefault();
    const next = event.key === 'ArrowRight' ? (index + 1) % links.length : (index - 1 + links.length) % links.length;
    links[next]?.focus();
  };

  return (
    <nav ref={navRef}
      className={`navbar${location.pathname === '/' && !user ? ' navbar--showcase' : ''}${compact ? ' navbar--compact' : ''}${hidden ? ' navbar--hidden' : ''}`}
      aria-label="Main" data-compact={compact} data-hidden={hidden}>
      <Link className="navbar__brand" to={user ? '/products' : '/'}>
        <Brand />
      </Link>

      {items.length === 0 ? <span className="navbar__spacer" /> : null}

      <div className="navbar__tray" ref={trayRef} onKeyDown={onKeyDown} hidden={items.length === 0}>
        {items.map((item) => (
          <Link
            key={item.to}
            className="navbar__link"
            to={item.to}
            aria-current={activeTo === item.to ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <ThemeControls />
      {user ? (
        <>
          <span className="navbar__user nav-control" title={user.email}>
            <span className="navbar__role">{roleShortLabels[user.role]}</span>
            <span>{user.email}</span>
          </span>
          {/* Right cluster order: theme, user chip, then one pill holding
              cart + bell + account — same container effect as Products/My Orders. */}
          <span className="navbar__actions" role="group" aria-label="Cart, notifications and account">
            {user.role === 'Customer' ? <CartButton /> : null}
            <NotificationBell />
            <AccountMenu />
          </span>
        </>
      ) : (
        <Link className="btn btn--primary navbar__cta" to="/login">
          Sign in
        </Link>
      )}
    </nav>
  );
}

/** Cart stays available from every customer page. */
function CartButton() {
  const { itemCount } = useCart();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    if (new URLSearchParams(location.search).get('focus') === 'cart') {
      document.dispatchEvent(new CustomEvent('ninecube:open-cart-sheet'));
    }
  }, [location.key, location.search]);
  return <>
    <button type="button" className="nav-control nav-pop__trigger" aria-haspopup="dialog" aria-expanded={open}
      onClick={event => document.dispatchEvent(new CustomEvent('ninecube:open-cart-sheet', {detail: {trigger: event.currentTarget}}))}
      aria-label={`Cart, ${itemCount} item${itemCount === 1 ? '' : 's'}`} title="Your cart">
      <Icon name="cart" />
      {itemCount > 0 ? <span className="nav-pop__badge" data-testid="cart-count">{itemCount > 9 ? '9+' : itemCount}</span> : null}
    </button>
    <CartSheet onOpenChange={setOpen} onPlaced={order => navigate(`/orders/${order.id}`)} />
  </>;
}
