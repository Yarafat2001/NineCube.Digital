import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');

/** Indentation and line breaks carry no meaning in a cascade, so contracts read flattened rules. */
const flat = (css: string) => css.replace(/\s+/g, ' ');

const app = flat(read('src', 'styles', 'app.css'));
const dashboard = read('src', 'pages', 'AccountPages.tsx');
const accountMenu = read('src', 'components', 'AccountMenu.tsx');

describe('Round 27: one account nav surface on a phone', () => {
  it('keeps a single button row out of the dashboard header', () => {
    const header = dashboard.slice(dashboard.indexOf('<header className="page-header">'), dashboard.indexOf('</header>'));
    expect(header).not.toContain('btn--ghost');
    expect(header).not.toContain('handleLogout');
  });

  it('lists every destination once, in the sidebar the dashboard docks beside its content', () => {
    const sidebar = read('src', 'components', 'AccountNav.tsx');
    for (const to of ["'/account'", "'/orders'", "'/wishlist'", "'/gift-cards'", "'/account/profile'", "'/account/security'", "'/notifications'", "'/help'"]) {
      expect(sidebar).toContain(`to: ${to}`);
    }
    // Browse products left with the hover panel: the navbar's Products tab already owns that route.
    expect(sidebar).not.toContain('t("Browse products")');
    expect(sidebar).not.toContain("to: '/products'");

    // One vertical list of icon + label + chevron rows in two groups, log out last.
    expect(sidebar.match(/to: '/g)).toHaveLength(8);
    expect(sidebar).toContain('className="account-nav-row account-nav-row--logout"');
    // Two groups in the data; the component maps over them, so the markup only shows the class once.
    expect(sidebar.match(/^\s{2}\[$/gm)).toHaveLength(2);
    expect(sidebar).toContain('SIDEBAR_GROUPS.map');
    expect(sidebar).toContain('account-nav-row__badge');
    // The dashboard renders that component and keeps no list of its own.
    expect(dashboard).toContain('<AccountRail');
    expect(dashboard).not.toContain('account-hub-tile');
    expect(dashboard).not.toContain('className="quick-actions"');

    const profile = dashboard.slice(dashboard.indexOf('className="account-profile-card card-glass"'), dashboard.indexOf('dashboard-stats'));
    expect(profile).toContain('account-profile-card__avatar');
    expect(profile).toContain('account-profile-card__pill');

    const orders = dashboard.slice(dashboard.indexOf('account-hub-orders'), dashboard.indexOf('className="account-profile-card card-glass"'));
    expect(orders).toContain("to={`/orders?status=${shortcut.status}`}");
    for (const status of ['Pending', 'Confirmed', 'Shipped', 'Delivered']) {
      expect(orders).toContain(`{ status: '${status}'`);
    }
  });

  it('styles the identity header and the icon list on the house system', () => {
    expect(app).toContain('.account-profile-card__pill {');
    expect(app).toContain('.account-profile-card__avatar {');
    expect(app).toContain('.account-nav-list__group + .account-nav-list__group { border-top: 1px solid var(--border); }');
    expect(app).toContain('.account-nav-row__chevron {');
    expect(app).toContain('.account-nav-row--logout {');
  });
});

describe('Round 27: card affordances stop covering the photo', () => {
  it('lays the overlay pair in one row at the badge-free photo corner on phones', () => {
    expect(app).toContain(':root .product-card__actions-overlay { flex-direction: row; top: auto; bottom: 8px;');
    expect(app).toContain(':root .product-card__wishlist-btn, :root .product-card__quick-view-btn { width: 32px !important;');
  });

  it('keeps both chips solid over photos and the wishlisted tint visible', () => {
    // The mobile sheet in responsive.css re-glasses the quick-view chip with !important on a
    // plain class; :root outscores it, so the solid surface and edge are re-asserted here.
    expect(app).toContain(':root .product-card__wishlist-btn, :root .product-card__quick-view-btn { width: 32px !important;');
    expect(app).toContain('background: var(--surface) !important;');
    expect(app).toContain('border: 1px solid var(--border-strong) !important;');
    expect(app).toContain(':root .product-card__wishlist-btn--active {');
  });

  it('keeps the 44px finger target as an unpainted collar', () => {
    expect(app).toContain(':root .product-card__wishlist-btn::after, :root .product-card__quick-view-btn::after { content: ""; position: absolute; inset: -6px; }');
    // The touch rule that asked for 44px in the first place is still in force.
    expect(app).toContain('@media (hover: none), (pointer: coarse) {');
  });

  it('shows the compare pill on phones again', () => {
    expect(app).toContain(':root .product-card__secondary-bar { display: flex !important;');
  });
});

describe('Round 27: the search dialog is a phone top sheet', () => {
  it('stacks the category label above its chips', () => {
    expect(app).toContain('.spotlight-backdrop { padding: 8px; }');
    expect(app).toContain('.spotlight-field { min-height: 44px; }');
    expect(app).toContain('.spotlight-input { font-size: 16px; }');
    expect(app).toContain('.spotlight-categories { flex-direction: column; align-items: stretch;');
  });
});

describe('Round 27: hover text and footer bands on the house scale', () => {
  it('drops the native tooltip from the profile trigger', () => {
    expect(accountMenu).not.toContain('title={t(user.email)}');
    expect(accountMenu).toContain('<span className="account-name">');
  });

  it('takes the avatar off the popover and onto the navbar pill', () => {
    // Round 27 put the hover popover's name and email onto the token ladder. Round 33 removed the
    // popover, so those two rules went with the surface they styled instead of being left behind.
    expect(app).not.toContain('account-menu-portal');
    expect(accountMenu).not.toContain('account-menu__email');
    // What replaces them is the house glass pill plus the sidebar rows, both on the token scale.
    expect(app).toContain(":root .navbar .navbar__actions .nav-account.nav-control { min-height: 44px; min-width: 44px;");
    expect(app).toContain('.account-nav-row__label {');
  });

  it('centres the tagline and spans the policy row on the desktop footer', () => {
    expect(app).toContain('.site-footer__inner { display: grid; grid-template-columns: 1fr auto 1fr;');
    expect(app).toContain('.site-footer__description { color: var(--text-muted); font-size: var(--text-sm); text-align: center; }');
    expect(app).toContain('.site-footer__links + .site-footer__links { grid-column: 1 / -1; justify-content: center;');
  });
});
