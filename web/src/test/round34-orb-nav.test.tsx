import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { API, resetAccountFixtures } from './handlers';
import { server } from './server';
import { renderApp, seedSession } from './utils';
import { setLanguage } from '../i18n/language';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');
const flat = (css: string) => css.replace(/\s+/g, ' ');

const app = flat(read('src', 'styles', 'app.css'));
const rawApp = read('src', 'styles', 'app.css');
const tokens = read('src', 'styles', 'tokens.css');
const railSource = read('src', 'components', 'AccountNav.tsx');
const dockSource = read('src', 'components', 'MobileNav.tsx');
const engineSource = read('src', 'lib', 'orbNotch.ts');

/** A rule's own declarations, so a contract cannot be satisfied by whatever follows it. */
const rule = (selector: string, marker = '') => {
  const blocks: string[] = [];
  for (let at = app.indexOf(`${selector} {`); at >= 0; at = app.indexOf(`${selector} {`, at + 1)) {
    blocks.push(app.slice(at, app.indexOf('}', at) + 1));
  }
  expect(blocks.length, `${selector} is styled`).toBeGreaterThan(0);
  return (marker ? blocks.find(block => block.includes(marker)) : blocks[0]) ?? blocks[0]!;
};

/** The same rule in the file as a visitor reads it, for the contracts that are about ordering. */
// const rawRule = (selector: string) => {
//   const at = rawApp.indexOf(`${selector} {`);
//   expect(at, `${selector} is styled`).toBeGreaterThan(-1);
//   return rawApp.slice(at, rawApp.indexOf('\n}', at) + 2);
// };

const ROUTES: [string, RegExp][] = [
  ['/account', /dashboard/i],
  ['/orders', /my orders/i],
  ['/wishlist', /wishlist/i],
  ['/gift-cards', /gift cards/i],
  ['/account/profile', /profile & addresses/i],
  ['/account/security', /account security/i],
  ['/notifications', /notifications/i],
  ['/help', /help & support/i]
];

async function signInAsCustomer() {
  const user = seedSession('Customer');
  server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(user)));
}

beforeEach(() => {
  setLanguage('en');
  resetAccountFixtures();
  window.localStorage.removeItem('ninecube.account-rail');
});

describe('Round 34: the account rail docks on every account page', () => {
  it('marks exactly one row with the router, wherever the rail is mounted', async () => {
    await signInAsCustomer();
    for (const [route, label] of ROUTES) {
      const view = renderApp(route);
      const nav = await screen.findByRole('navigation', { name: 'Account Navigation' });
      const current = nav.querySelectorAll('[aria-current="page"]');
      expect(current, `${route} marked ${current.length} rows current`).toHaveLength(1);
      expect(current[0]).toHaveTextContent(label);
      expect(nav.querySelectorAll('.account-nav-row--active')).toHaveLength(1);
      // The rail is the only list on the page, so the row it marks is the page you are on.
      expect(document.querySelectorAll('.account-nav-list')).toHaveLength(1);
      view.unmount();
    }
  });

  it('lists the eight destinations, then log out, and nothing else', async () => {
    await signInAsCustomer();
    server.use(http.get(`${API}/api/notifications/unread-count`, () => HttpResponse.json({ count: 3 })));
    renderApp('/account');

    const nav = await screen.findByRole('navigation', { name: 'Account Navigation' });
    expect(within(nav).getAllByRole('link')).toHaveLength(8);
    expect(within(nav).queryByRole('link', { name: /browse products/i })).not.toBeInTheDocument();

    // The count belongs to the row it counts, and the rail reads it from the bell's own endpoint so
    // it says the same thing on every page.
    const notifications = within(nav).getByRole('link', { name: /notifications/i });
    expect(within(notifications).getByText('3')).toHaveClass('account-nav-row__badge');

    expect(within(nav).queryByRole('link', { name: /^log out$/i })).toBeNull();
    const logout = within(nav).getByRole('button', { name: /^log out$/i });
    expect(nav.lastElementChild).toBe(logout);
  });

  it('shows icons until asked for words, and remembers the answer', async () => {
    const user = userEvent.setup();
    await signInAsCustomer();
    const view = renderApp('/account');

    const column = document.querySelector('.account-rail')!;
    const toggle = screen.getByRole('button', { name: /^expand$/i });
    expect(column).toHaveAttribute('data-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'account-destinations');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);
    expect(column).toHaveAttribute('data-expanded', 'true');
    expect(window.localStorage.getItem('ninecube.account-rail')).toBe('expanded');
    expect(screen.getByRole('button', { name: /^collapse$/i })).toHaveAttribute('aria-expanded', 'true');

    // A second visit reads the saved choice, so the rail does not shrink back between pages.
    view.unmount();
    renderApp('/orders');
    expect(document.querySelector('.account-rail')).toHaveAttribute('data-expanded', 'true');
  });

  it('retracts to a plain list below the dock width, where a notch would mark nothing', () => {
    // Under 1024px there is no column beside the work: the rail is the full-width list the
    // dashboard used to show, with its words, and the glass goes back on the panel itself.
    const at = rawApp.indexOf("@media (max-width: 1023px) {");
    const block = rawApp.slice(at, rawApp.indexOf('@supports not', at));
    expect(block).toContain(".account-rail, .account-rail[data-expanded='true'] { position: static; --rail-width: 100%; }");
    expect(block).toContain('.account-rail .orb-notch { display: none; }');
    expect(block).toContain('.account-rail__toggle { display: none; }');
    expect(block).toContain('.account-nav-list {');
    expect(block).toContain('background: var(--nav-glass-base)');
  });
});

describe('Round 34: the lifted orb is one measured path, not two guesses', () => {
  it('cuts the glass and strokes the edge from the same string, and never re-renders for it', () => {
    // The clip and the stroke are the same path the engine returns, so the marker cannot sit in a
    // notch the glass does not have.
    expect(engineSource).toContain("const clip = `path(\"${shape.d}\")`;");
    expect(engineSource).toContain("glassEl.style.setProperty('clip-path', clip);");
    expect(engineSource).toContain("pathRef.current?.setAttribute('d', shape.d);");
    // Per frame the engine writes the DOM directly: a destination change must not re-render the bar
    // or recompute the blur behind it.
    expect(engineSource).not.toContain('useState');
    expect(engineSource).toContain("hostEl.style.setProperty('--orb-pos', `${shape.centre}px`);");
    // One constant describes the silhouette, used by both surfaces.
    expect(engineSource).toContain('export const ORB_NOTCH = { half: 22, depth: 22, endRadius: 16 } as const;');
  });

  it('is mounted by both bars, each on its own edge', () => {
    expect(railSource).toContain("useOrbNotch('left'");
    expect(railSource).toContain("active: '.account-nav-row--active'");
    expect(dockSource).toContain("useOrbNotch('top'");
    expect(dockSource).toContain("active: '.mobile-nav__item--active'");
    // Both go through the shared layer set rather than painting their own copy of it.
    expect(railSource).toContain('<OrbNotchLayers');
    expect(dockSource).toContain('<OrbNotchLayers');
    expect(app).toContain('.orb-notch__glass { position: absolute; inset: 0;');
  });

  it('says it has not measured instead of marking the start of the column', async () => {
    // jsdom gives every box a zero width, which is exactly the case the engine refuses to draw:
    // a notch and an orb with nowhere to sit are hidden until a real measurement arrives.
    await signInAsCustomer();
    renderApp('/account');
    const nav = await screen.findByRole('navigation', { name: 'Account Navigation' });
    expect(nav).toHaveAttribute('data-orb-ready', 'false');
    const layers = nav.querySelector('.orb-notch')!;
    expect(layers).toHaveAttribute('aria-hidden', 'true');
    expect(layers.querySelector('.orb-notch__glass')).toHaveStyle({ clipPath: '' });
    expect(layers.querySelector('path')).toHaveAttribute('d', '');
    expect(app).toContain('.orb-notch__orb, .orb-notch__edge { opacity: 0; transition: opacity var(--transition); }');
    expect(app).toContain("[data-orb-ready='true'] > .orb-notch .orb-notch__orb");
  });

  it('rides the notch it was cut into on each surface', () => {
    // The rail's orb straddles the column's left edge at the height the engine measured; the dock's
    // straddles the bar's top edge at the width it measured. Neither knows a row or tab height.
    expect(rule('.account-rail .orb-notch__orb')).toContain('top: calc(var(--orb-pos) - var(--orb-size) / 2);');
    expect(rule('.account-rail .orb-notch__orb')).toContain('left: calc(var(--orb-size) / -2);');
    expect(rule(':root .app-shell .mobile-nav.orb-nav .orb-notch__orb')).toContain('left: calc(var(--orb-pos) - var(--orb-size) / 2);');
    expect(rule(':root .app-shell .mobile-nav.orb-nav .orb-notch__orb')).toContain('top: calc(var(--orb-size) / -2);');
  });

  it('glides on a token and holds still when asked', () => {
    expect(tokens).toContain('--orb-glide: 450ms;');
    expect(engineSource).toContain("getPropertyValue('--orb-glide')");
    expect(engineSource).toContain("window.matchMedia('(prefers-reduced-motion: reduce)')");
    expect(app).toContain('@media (prefers-reduced-motion: reduce) { .account-nav-row::before { transition: none; } .account-nav-list, .account-rail__toggle { transition: none; } .orb-notch__orb, .orb-notch__edge { transition: none; } }');
  });
});

describe('Round 34: the orb bar speaks in tokens', () => {
  const orbRules = [
    '.orb-notch',
    '.orb-notch__glass',
    '.orb-notch__edge path',
    '.orb-notch__orb',
    '.account-rail',
    '.account-rail .orb-notch__orb',
    '.account-nav-row::before',
    '.account-rail__toggle',
    ':root .app-shell .mobile-nav.orb-nav',
    ':root .app-shell .mobile-nav.orb-nav .orb-notch__glass',
    ':root .app-shell .mobile-nav.orb-nav .orb-notch__orb'
  ];

  it('paints no colour, blur or duration the stylesheet has not named', () => {
    for (const selector of orbRules) {
      const block = rule(selector);
      expect(block, `${selector} paints with a literal colour`).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
      expect(block, `${selector} hardcodes a duration`).not.toMatch(/transition:[^;]*\b\d+m?s\b/);
      expect(block, `${selector} hardcodes a blur`).not.toMatch(/blur\(\d/);
    }
  });

  it('gives the bar its own frost and the orb its own shadow, per theme', () => {
    // The bar floats over scrolling content, so it frosts harder than a panel beside it does, and
    // its cast shadow has to be one value a drop-shadow filter can take.
    for (const token of ['--glass-blur-bar', '--glass-saturate-bar', '--orb-size', '--orb-fill', '--orb-ink', '--orb-edge-width', '--orb-glide']) {
      expect(tokens, `${token} is a token`).toContain(`${token}:`);
    }
    expect(rule('.orb-notch__glass')).toContain('var(--glass-blur-bar)');
    expect(rule('.orb-notch')).toContain('filter: drop-shadow(var(--orb-shadow))');
    expect(rule('.orb-notch__orb')).toContain('background: var(--orb-fill)');
    expect(rule('.orb-notch__orb')).toContain('color: var(--orb-ink)');
    expect(rule('.orb-notch__edge path')).toContain('stroke: var(--nav-glass-edge)');
    expect(rule('.orb-notch__edge path')).toContain('stroke-width: var(--orb-edge-width)');

    for (const token of ['--orb-shadow', '--glass-glow']) {
      const hits = [...tokens.matchAll(new RegExp(`${token}:`, 'g'))].map(match => match.index!);
      expect(hits, `${token} is themed`).toHaveLength(2);
      const dark = tokens.indexOf('[data-theme="dark"]', hits[0]!);
      expect(dark, 'tokens.css has a dark block').toBeGreaterThan(hits[0]!);
      expect(dark, `the dark ${token} is written inside the dark block`).toBeLessThan(hits[1]!);
    }
  });

  it('falls back to a solid surface where backdrop-filter is missing', () => {
    expect(app).toContain('@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) { .orb-notch__glass { background: var(--surface); }');
    expect(app).toContain('@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) { @media (max-width: 768px) { :root .app-shell .mobile-nav.orb-nav .orb-notch__glass { background-color: var(--surface-menu); background-image: none; } } }');
    // The dock's own rule outranks that fallback, so it has to be restated inside it.
    expect(app.indexOf('@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) { .orb-notch__glass')).toBeLessThan(
      app.indexOf('@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) { @media (max-width: 768px)'));
  });

  it('keeps the finger and keyboard room the rest of the app has', () => {
    for (const selector of ['.account-nav-row', '.account-rail__toggle']) {
      const block = rule(selector, 'min-height');
      expect(Number(block.match(/min-height: (\d+)px/)![1]), `${selector} is a short tap target`).toBeGreaterThanOrEqual(44);
    }
    expect(rule('.account-rail__toggle:focus-visible')).toContain('var(--focus-ring)');
    // The toggle is a real control with a real name, not a hover affordance.
    expect(railSource).toContain('aria-controls="account-destinations"');
    expect(railSource).toContain('aria-expanded={expanded}');
  });
});

describe('Round 34: the phone dock keeps its bar and gains the notch', () => {
  it('gives up the opaque menu surface for the glass the notch is cut into', () => {
    // responsive.css owns .mobile-nav and loads after this sheet, so the dock is restated at
    // :root .app-shell scope rather than by editing that file.
    const selector = ':root .app-shell .mobile-nav.orb-nav';
    expect(rule(selector)).toContain('background: none');
    expect(rule(selector)).toContain('box-shadow: none');
    expect(rule(selector)).toContain('overflow: visible');
    expect(rule(`${selector} .orb-notch__glass`)).toContain('var(--nav-glass-base)');
    expect(rule(`${selector} .orb-notch__glass`)).toContain('var(--nav-bar-veil)');
    // The items sit above the layer, and the bar's own line is only kept until the edge is drawn.
    expect(rule(`${selector} .mobile-nav__item`)).toContain('z-index: 1');
    expect(app).toContain(`${selector}:not([data-orb-ready='true']) { border-top: 1px solid var(--border); }`);
  });

  it('moves the active tab’s icon into the orb only once the orb exists', () => {
    expect(app).toContain(":root .app-shell .mobile-nav.orb-nav[data-orb-ready='true'] .mobile-nav__item--active .mobile-nav__icon-wrap svg { opacity: 0;");
    // An unmeasured bar keeps its icon, so the tab never loses its only picture for nothing.
    expect(dockSource).toContain('icon={activeIcon}');
    expect(dockSource).toContain('const activeIcon: IconName | null');
    // The marked tab is read in the order the bar lists them, which is the order its own accent
    // class is applied - one tab, one marker.
    expect(dockSource).toContain('isDashboardTabActive ? "grid"');
    expect(dockSource).toContain('isAccountActive ? "user"');
  });

  it('keeps the routes, the cart button, the badges and the height it publishes', () => {
    expect(dockSource).toContain('className="mobile-nav orb-nav"');
    for (const keep of ['to="/"', 'to="/products"', 'ninecube:open-cart-sheet', 'mobile-nav__badge--accent', 'mobile-nav__item--active']) {
      expect(dockSource, `${keep} left the bar`).toContain(keep);
    }
    // The page still clears the bar, and now the marker floating above it as well.
    expect(dockSource).toContain("document.documentElement.style.setProperty('--mobile-nav-h'");
    expect(dockSource).toContain("getPropertyValue('--orb-size')");
    expect(dockSource).toContain('height + (Number.isFinite(lifted) ? lifted : 0)');
  });
});
