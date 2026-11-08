import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { API } from './handlers';
import { server } from './server';
import { renderApp } from './utils';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8');
const tokens = read('src', 'styles', 'tokens.css');
const modern = read('src', 'styles', 'modern.css');
const home = read('src', 'styles', 'home.css');
const fallback = read('src', 'helix', 'ShowcaseFallback.tsx');

/** The last rule for a selector wins in the cascade, so contract checks read the surviving block. */
function block(css: string, selector: string): string {
  const lines = css.split('\n');
  let at = -1;
  lines.forEach((line, index) => {
    if (line.startsWith(`${selector} {`)) at = index;
  });
  if (at < 0) throw new Error(`no rule for "${selector}"`);
  const from = lines.slice(at).join('\n');
  let depth = 0;
  for (let index = from.indexOf('{'); index < from.length; index++) {
    if (from[index] === '{') depth++;
    if (from[index] === '}' && --depth === 0) return from.slice(from.indexOf('{'), index + 1);
  }
  throw new Error(`unbalanced braces in "${selector}"`);
}

const HOME_COMPONENTS = [
  'src/components/home/HomeFeaturedDeals.tsx',
  'src/components/home/HomeBrandStrip.tsx',
  'src/components/home/HomeCategoryStrip.tsx',
  'src/components/home/HomeTrustBar.tsx',
  'src/components/home/HomeLiveOffers.tsx'
].map(path => read(...path.split('/')));

describe('Navigation glass is its own material, page cards are another', () => {
  // The bar paints its veil over its backing colour, so what actually hides the page is the
  // composite of the two alphas. 1 means a solid slab; the old .96-over-.72 bar measured .989.
  const compositeAlpha = (veil: string, base: string): number => {
    const stops = [...veil.matchAll(/rgba\([^)]*,\s*([\d.]+)\)/g)].map(m => Number(m[1]));
    const a = Math.max(...stops);
    const b = Number(/--nav-glass-base:\s*rgba\([^)]*,\s*([\d.]+)\);/.exec(base)?.[1]);
    return a + b * (1 - a);
  };

  it('lets the page show through the bar in both themes', () => {
    const light = tokens.slice(tokens.indexOf(':root, :root[data-theme="light"] {'), tokens.indexOf(':root[data-theme="dark"], .navbar--showcase {'));
    const dark = tokens.slice(tokens.indexOf(':root[data-theme="dark"], .navbar--showcase {'), tokens.indexOf('--product-card-glass'));
    expect(light).toContain('--nav-glass-base: rgba(255,255,255,.38);');
    expect(dark).toContain('--nav-glass-base: rgba(14,13,17,.68);');
    const lightVeil = /--nav-bar-veil: ([^;]+);/.exec(light)?.[1] ?? '';
    const darkVeil = /--nav-bar-veil: ([^;]+);/.exec(dark)?.[1] ?? '';
    expect(lightVeil).toBeTruthy();
    expect(darkVeil).toBeTruthy();
    // Glass, not paint: at rest at least 40% of whatever scrolls behind has to survive.
    expect(compositeAlpha(lightVeil, light)).toBeLessThan(0.6);
    expect(compositeAlpha(darkVeil, dark)).toBeLessThan(0.75);
    // The controls inside stay frosted so they still read as controls on the see-through bar.
    expect(light).toContain('--nav-glass: linear-gradient(135deg, rgba(255,255,255,.62)');
  });

  it('keeps the card material separate from the bar material', () => {
    expect(tokens).toContain('--product-card-glass: var(--card-glass);');
    expect(tokens).not.toContain('--navbar-glass');
    // Lifting both at once painted a blue diagonal over every product card.
    expect(tokens).not.toContain('--product-card-glass: var(--nav-glass)');
  });

  it('paints the bar with the backing colour at rest and on scroll, never the flat card surface', () => {
    const bar = block(modern, '.navbar');
    const compact = block(modern, '.navbar--compact');
    expect(bar).toContain('background-color: var(--nav-glass-base);');
    expect(bar).toContain('background-image: var(--nav-bar-veil);');
    expect(compact).toContain('background-color: var(--nav-glass-base-scroll);');
    expect(compact).toContain('background-image: var(--nav-bar-veil);');
    expect(compact).not.toContain('var(--surface)');
  });

  it('raises every home surface edge off the page with the shell tokens', () => {
    // --border measured 1.51:1 against the light page: a card outline nobody could follow.
    expect(home).not.toMatch(/border: 1px solid var\(--border\);/);
    expect(block(home, '.home-category-card')).toContain('--nav-glass-edge');
    expect(block(home, '.home-brand-chip')).toContain('--opt-edge');
    expect(block(home, '.home-search__trending-chip')).toContain('--opt-edge');
    expect(block(home, '.home-deal-compare-btn')).toContain('--opt-edge');
    expect(block(home, '.home-brand-monogram')).toContain('--selected-bg');
  });

  it('gives the hero a second column and a hairline the dark theme cannot erase', () => {
    // The section itself holds one column, so the shop window inside it fills the right half
    // instead of leaving a third of the hero empty.
    expect(home).toContain('.showcase--static .showcase__hero-layout');
    expect(home).toContain('grid-template-columns: minmax(0, 1fr) minmax(320px, 0.58fr);');
    expect(home).toContain('.showcase--static .showcase__hero-intro');
    // The stacked child margins added 28-32px on top of the hero gap between the same two lines.
    expect(home).toContain('.showcase--static :is(.showcase__hero-actions, .home-search, .showcase__hero-cta) { margin-top: 0; }');
    expect(block(home, ':root .showcase__3d-btn')).toContain('var(--nav-glass-edge');
    expect(home).toContain(':root[data-theme=\'dark\'] .btn--ghost.showcase__3d-btn');
  });
});

describe('The home page only says what the server can back up', () => {
  it('deleted the invented dispatch ticker, review wall and VIP promise', () => {
    for (const file of ['HomeDeliveryPulse', 'HomeNewsletter']) {
      expect(() => read('src', 'components', 'home', `${file}.tsx`)).toThrow();
    }
    expect(fallback).not.toMatch(/HomeDeliveryPulse|HomeNewsletter/);
    expect(home).not.toMatch(/\.home-newsletter|\.home-pulse|\.home-reviews|\.home-review-/);
    // Nothing in the catalogue supports "certified distributor" or a code nobody issued.
    expect([fallback, ...HOME_COMPONENTS].join('\n')).not.toMatch(/WELCOME10|Verified Buyer|Loved by|FALLBACK_BRANDS/);
  });

  it('uses the house icon set rather than emoji where a control needs a glyph', () => {
    const pictographs = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
    for (const source of [...HOME_COMPONENTS, fallback]) {
      expect(source).not.toMatch(pictographs);
    }
    expect(HOME_COMPONENTS[1]).toContain('<Icon name="tag"');
  });

  it('counts the home page from the catalogue without claiming a feed', () => {
    // The numbers are counted client-side from the page the catalogue returns; "live" and "real-time"
    // described a push feed that does not exist, and "live offers" labelled a product count.
    expect(fallback).not.toMatch(/●|Real-time|live warehouse/);
    // The stock dashboard is gone: a shopper came for products, not for our own counters.
    expect(fallback).not.toMatch(/Store pulse|home-store-pulse|Smart picks|Modern commerce/);
    expect(home).not.toMatch(/\.home-store-pulse/);
    // The gallery is the only list a visitor came for, so the tests name it rather than count.
    expect(fallback).toContain('data-testid="showcase-grid"');
  });

  it('shows the campaigns that are actually running, with their own terms', async () => {
    renderApp('/');

    const section = await screen.findByRole('region', { name: /Offers you can use right now/i });
    // The band above already carries the featured campaign, so the list starts after it.
    expect(section.querySelectorAll('.home-offer-card')).toHaveLength(4);
    expect(within(section).getByText('SAVE10')).toBeInTheDocument();
    expect(within(section).getAllByText('15% OFF')).toHaveLength(2);
    // The band's campaign is not printed twice on one page.
    expect(within(section).queryByText('25% OFF')).toBeNull();
    expect(within(section).queryByText('DURAMO25')).toBeNull();
    expect(within(section).getByText(/On orders over BDT 1,000/)).toBeInTheDocument();
    expect(within(section).getByText(/Applied automatically at checkout/)).toBeInTheDocument();
    expect(within(section).queryByText('AUTO2000')).toBeNull();
    expect(within(section).getAllByRole('button', { name: /Copy voucher code/ })).toHaveLength(3);

    // The campaign the band spotlights keeps its code on the band, where it can still be copied.
    const band = document.querySelector('.home-campaign-banner');
    expect(band).not.toBeNull();
    expect(band!.textContent).toContain('DURAMO25');
    expect(within(band as HTMLElement).getByRole('button', { name: 'Copy voucher code DURAMO25' })).toBeInTheDocument();
  });

  it('copies the code a shopper can actually paste at checkout', async () => {
    renderApp('/');
    const section = await screen.findByRole('region', { name: /Offers you can use right now/i });
    await userEvent.click(within(section).getByRole('button', { name: 'Copy voucher code EID2026' }));
    expect(within(section).getByRole('button', { name: 'Copy voucher code EID2026' })).toHaveTextContent('Copied!');
  });

  it('says nothing when there is nothing to say', async () => {
    server.use(http.get(`${API}/api/coupons/campaigns`, () => HttpResponse.json([])));
    server.use(http.get(`${API}/api/brands`, () => HttpResponse.json([])));
    renderApp('/');

    await screen.findByTestId('showcase-fallback-reason');
    // Both sections are hidden only once the server has answered, so wait for the answer.
    await waitFor(() => expect(screen.queryByText(/Offers you can use right now/i)).toBeNull());
    expect(screen.queryByText(/Brands in the catalogue/i)).toBeNull();
  });
});
