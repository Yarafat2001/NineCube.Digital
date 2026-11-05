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

  it('lists every destination once in the hub, including the catalogue', () => {
    const hub = dashboard.slice(dashboard.indexOf('className="account-hub-grid"'), dashboard.indexOf('dashboard-stats'));
    // Round 28 moved the order destinations into their own card above the hub, with a real count per
    // status, so the hub rows are the remaining features - each one a route the router declares.
    for (const to of ['"/products"', '"/wishlist"', '"/gift-cards"', '"/account/profile"', '"/account/security"', '"/notifications"', '"/help"']) {
      expect(hub).toContain(`to=${to}`);
    }
    expect(hub).not.toContain('to="/orders"');
    // Seven link rows; the log-out tile carries its own modifier class, so an eighth row here would
    // be a duplicate again.
    expect(hub.match(/account-hub-tile card-glass/g)).toHaveLength(7);

    const orders = dashboard.slice(dashboard.indexOf('account-hub-orders'), dashboard.indexOf('className="account-hub-grid"'));
    expect(orders).toContain('to="/orders"');
    // The four shortcuts are generated from one template, so the statuses are proved as a list.
    expect(orders).toContain("to={`/orders?status=${shortcut.status}`}");
    for (const status of ['Pending', 'Confirmed', 'Shipped', 'Delivered']) {
      expect(orders).toContain(`{ status: '${status}'`);
    }
  });

  it('yields the quick-actions band and the two-column grid to the single column', () => {
    expect(app).toContain(':root .quick-actions { display: none !important; }');
    expect(app).toContain(':root .account-hub-grid { grid-template-columns: minmax(0, 1fr) !important;');
    expect(app).toContain(':root .account-hub-tile__info strong { font-size: var(--text-xs) !important; white-space: normal !important;');
    expect(app).toContain(':root .account-hub-tile__info .muted { font-size: var(--text-label) !important; white-space: normal !important;');
  });
});

describe('Round 27: card affordances stop covering the photo', () => {
  it('lays the overlay pair in one row at the photo corner on phones', () => {
    expect(app).toContain(':root .product-card__actions-overlay { flex-direction: row; top: 8px;');
    expect(app).toContain(':root .product-card__wishlist-btn, :root .product-card__quick-view-btn { width: 32px !important;');
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

  it('puts the popover email on the token ladder', () => {
    expect(app).toContain(':root .account-menu-portal .account-menu__name { font-size: var(--text-xs) !important; }');
    expect(app).toContain(':root .account-menu-portal .account-menu__email { font-size: var(--text-label) !important; }');
  });

  it('centres the tagline and spans the policy row on the desktop footer', () => {
    expect(app).toContain('.site-footer__inner { display: grid; grid-template-columns: 1fr auto 1fr;');
    expect(app).toContain('.site-footer__description { color: var(--text-muted); font-size: var(--text-sm); text-align: center; }');
    expect(app).toContain('.site-footer__links + .site-footer__links { grid-column: 1 / -1; justify-content: center;');
  });
});
