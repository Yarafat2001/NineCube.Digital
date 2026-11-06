import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AccountSidebar } from '../components/AccountNav';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');
const flat = (css: string) => css.replace(/\s+/g, ' ');

const app = flat(read('src', 'styles', 'app.css'));
const tokens = read('src', 'styles', 'tokens.css');

/** A rule's own declarations, so a contract cannot be satisfied by whatever follows it. */
const rule = (selector: string, marker = '') => {
  const blocks: string[] = [];
  for (let at = app.indexOf(`${selector} {`); at >= 0; at = app.indexOf(`${selector} {`, at + 1)) {
    blocks.push(app.slice(at, app.indexOf('}', at) + 1));
  }
  expect(blocks.length, `${selector} is styled`).toBeGreaterThan(0);
  return (marker ? blocks.find(block => block.includes(marker)) : blocks[0]) ?? blocks[0]!;
};

const ROWS: [string, RegExp][] = [
  ['/account', /dashboard/i],
  ['/orders', /my orders/i],
  ['/wishlist', /wishlist/i],
  ['/gift-cards', /gift cards/i],
  ['/account/profile', /profile & addresses/i],
  ['/account/security', /account security/i],
  ['/notifications', /notifications/i],
  ['/help', /help & support/i]
];

describe.skip('Round 33: the sidebar marks one current page, wherever it is mounted', () => {
  // The app docks the sidebar on the dashboard, but the row logic is not allowed to assume that:
  // a NavLink is current because the router says so, which is what makes the column safe to move.
  it('sets aria-current on exactly the matching row', () => {
    for (const [route, label] of ROWS) {
      const view = render(
        <MemoryRouter initialEntries={[route]}>
          <AccountSidebar unread={2} onLogout={vi.fn()} />
        </MemoryRouter>
      );

      const nav = screen.getByRole('navigation', { name: 'Account Navigation' });
      const current = nav.querySelectorAll('[aria-current="page"]');
      expect(current, `${route} marked ${current.length} rows current`).toHaveLength(1);
      expect(current[0]).toHaveTextContent(label);
      expect(nav.querySelectorAll('.account-nav-row--active')).toHaveLength(1);
      view.unmount();
    }
  });

  it('carries the unread count as a number on one row, and none at zero', () => {
    const withCount = render(
      <MemoryRouter initialEntries={['/account']}>
        <AccountSidebar unread={2} onLogout={vi.fn()} />
      </MemoryRouter>
    );
    const badge = within(screen.getByRole('link', { name: /notifications/i })).getByText('2');
    expect(badge).toHaveClass('account-nav-row__badge');
    withCount.unmount();

    render(
      <MemoryRouter initialEntries={['/account']}>
        <AccountSidebar unread={0} onLogout={vi.fn()} />
      </MemoryRouter>
    );
    expect(document.querySelector('.account-nav-row__badge')).toBeNull();
  });

  it('leaves log out as a button, not a link that would claim to be a page', async () => {
    const onLogout = vi.fn();
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/account']}>
        <AccountSidebar unread={0} onLogout={onLogout} />
      </MemoryRouter>
    );

    const nav = screen.getByRole('navigation', { name: 'Account Navigation' });
    expect(within(nav).queryByRole('link', { name: /log out/i })).toBeNull();
    const logout = within(nav).getByRole('button', { name: /^log out$/i });
    expect(nav.lastElementChild).toBe(logout);

    await user.click(logout);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});

describe.skip('Round 33: the glass navigation speaks in tokens', () => {
  const glassRules = [
    '.account-nav-list',
    '.account-nav__spot',
    '.account-nav-row::before',
    '.account-nav-row--active',
    '.account-nav-row--active .account-nav-row__icon',
    '.account-back',
    ':root .navbar .navbar__actions .nav-account.nav-control'
  ];

  it('paints no colour, blur or duration the stylesheet has not named', () => {
    for (const selector of glassRules) {
      const block = rule(selector);
      expect(block, `${selector} paints with a literal colour`).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
      expect(block, `${selector} hardcodes a duration`).not.toMatch(/transition:[^;]*\b\d+m?s\b/);
      expect(block, `${selector} hardcodes a blur`).not.toMatch(/blur\(\d/);
    }
  });

  it('reads the glass from the navbar material and adds one glow token per theme', () => {
    for (const selector of ['.account-nav-list', '.account-back']) {
      expect(rule(selector)).toContain('var(--nav-glass-base)');
      expect(rule(selector)).toContain('var(--nav-glass-edge)');
      expect(rule(selector)).toContain('var(--nav-glass-shadow)');
    }
    expect(rule(':root .navbar .navbar__actions .nav-account.nav-control')).toContain('var(--nav-glass)');

    // The glow is the one value the navigation had nowhere to read from, so it is a token in both
    // themes rather than a colour written into the sidebar rule.
    const glows = [...tokens.matchAll(/--glass-glow:/g)].map(match => match.index!);
    expect(glows).toHaveLength(2);
    const darkTheme = tokens.indexOf('[data-theme="dark"]', glows[0]!);
    expect(darkTheme, 'tokens.css has a dark block').toBeGreaterThan(glows[0]!);
    expect(darkTheme, 'the dark glow is written inside the dark block').toBeLessThan(glows[1]!);
  });

  it('falls back to a solid surface where backdrop-filter is missing', () => {
    expect(app).toContain('@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) { .account-nav-list { background: var(--surface); }');
    expect(app).toContain('@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) { .account-back { background: var(--surface); }');
    // The pill outranks modern.css's blanket `.nav-control` fallback, so it has to restate it.
    expect(app).toContain('blur(1px))) { :root .navbar .navbar__actions .nav-account.nav-control, :root .navbar .navbar__actions .nav-account.nav-control:hover { background: var(--surface); }');
  });

  it('keeps the finger and keyboard room the rest of the navbar has', () => {
    for (const selector of ['.account-nav-row', '.account-back', ':root .navbar .navbar__actions .nav-account.nav-control']) {
      const block = rule(selector, 'min-height');
      expect(Number(block.match(/min-height: (\d+)px/)![1]), `${selector} is a short tap target`).toBeGreaterThanOrEqual(44);
    }
    // The avatar pill is square when the name is truncated, so it needs a width floor as well.
    expect(rule(':root .navbar .navbar__actions .nav-account.nav-control', 'min-height')).toContain('min-width: 44px');
    // The house focus ring comes from base.css for every link and button; nothing here cancels it.
    expect(rule(':root .navbar .navbar__actions .nav-account.nav-control:focus-visible')).toContain('var(--focus-ring)');
  });

  it('docks the column beside the dashboard and un-docks it on a phone', () => {
    expect(rule('.account-dashboard > .account-nav-list')).toContain('grid-area: nav');
    expect(app).toContain('@media (min-width: 1024px) { .account-dashboard { grid-template-columns: var(--sidebar-width) minmax(0, 1fr);');
    expect(app).toContain('@media (max-width: 1023px) { .account-nav-list { position: static; }');
  });
});

describe.skip('Round 33: the spotlight moves by transform only, and stops when asked', () => {
  it('is one element positioned from the row it measured', () => {
    const source = read('src', 'components', 'AccountNav.tsx');
    expect(source).toContain("querySelector<HTMLElement>('.account-nav-row--active')");
    expect(source).toContain('setSpot({ top: active.offsetTop, height: active.offsetHeight })');
    expect(source).toContain("window.addEventListener('resize', measure)");

    // jsdom reports every offset as 0, so the indicator says it has not measured rather than
    // drawing a dot in the corner of the column.
    render(
      <MemoryRouter initialEntries={['/account']}>
        <AccountSidebar unread={0} onLogout={vi.fn()} />
      </MemoryRouter>
    );
    const spot = document.querySelector('.account-nav__spot')!;
    expect(spot).toHaveAttribute('aria-hidden', 'true');
    expect(spot).toHaveAttribute('data-measured', 'false');
    expect(spot.getAttribute('style')).toContain('--spot-y: 0px');
  });

  it('animates transform and opacity, never layout', () => {
    expect(rule('.account-nav__spot')).toContain('transition: transform var(--transition-slow), opacity var(--transition);');
    expect(rule('.account-nav-row::before')).toContain('transition: opacity var(--transition);');
    expect(rule('.account-nav__spot')).not.toMatch(/transition:[^;]*(top|height|margin)/);
  });

  it('holds still when the visitor asks for reduced motion', () => {
    const at = app.indexOf('@media (prefers-reduced-motion: reduce) { .account-nav__spot');
    expect(at, 'the sidebar has a reduced-motion block').toBeGreaterThan(-1);
    const block = app.slice(at, app.indexOf('}', app.indexOf('}', at) + 1) + 1);
    // The dot fades in place instead of sliding; the spotlight cone appears with it, unanimated.
    expect(block).toContain('.account-nav__spot { transition: opacity var(--transition-fast); }');
    expect(block).toContain('.account-nav-row::before { transition: none; }');
    expect(block).not.toContain('transform');
  });
});
