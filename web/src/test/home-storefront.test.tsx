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
  it('puts a neutral backing under the bar tint in both themes', () => {
    const light = tokens.slice(tokens.indexOf(':root, :root[data-theme="light"] {'), tokens.indexOf(':root[data-theme="dark"], .navbar--showcase {'));
    const dark = tokens.slice(tokens.indexOf(':root[data-theme="dark"], .navbar--showcase {'), tokens.indexOf('--product-card-glass'));
    // A tint with nothing under it lets the page glow through and the bar warms into the background.
    expect(light).toContain('--nav-glass-base: rgba(255,255,255,.72);');
    expect(dark).toContain('--nav-glass-base: rgba(21,19,21,.72);');
    expect(light.match(/rgba\(255,255,255,\.96\)[\s\S]*rgba\(206,220,240,\.78\)/)).toBeTruthy();
  });

  it('keeps the card material separate from the bar material', () => {
    expect(tokens).toContain('--product-card-glass: var(--card-glass);');
    expect(tokens).toContain('--navbar-glass: var(--nav-glass);');
    // Lifting both at once painted a blue diagonal over every product card.
    expect(tokens).not.toContain('--product-card-glass: var(--nav-glass)');
  });

  it('paints the bar with the backing colour at rest and on scroll, never the flat card surface', () => {
    const bar = block(modern, '.navbar');
    const compact = block(modern, '.navbar--compact');
    expect(bar).toContain('background-color: var(--nav-glass-base);');
    expect(bar).toContain('background-image: var(--navbar-glass);');
    expect(compact).toContain('background-color: var(--nav-glass-base-scroll);');
    expect(compact).not.toContain('var(--surface)');
  });

  it('raises every home surface edge off the page with the shell tokens', () => {
    // --border measured 1.51:1 against the light page: a card outline nobody could follow.
    expect(home).not.toMatch(/border: 1px solid var\(--border\);/);
    expect(block(home, '.home-category-card')).toContain('--nav-glass-edge');
    expect(block(home, '.home-store-pulse__stat')).toContain('--nav-glass-edge');
    expect(block(home, '.home-search__trending-chip')).toContain('--opt-edge');
    expect(block(home, '.home-deal-compare-btn')).toContain('--opt-edge');
    expect(block(home, '.home-store-pulse__bar')).toContain('--edge-well');
  });

  it('gives the hero a second column and a hairline the dark theme cannot erase', () => {
    expect(home).toContain('grid-template-columns: minmax(0, 1.1fr) minmax(300px, 0.9fr);');
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

  it('counts the store pulse from the catalogue without claiming a feed', () => {
    // The numbers are counted client-side from the page the catalogue returns; "live" and "real-time"
    // described a push feed that does not exist, and "live offers" labelled a product count.
    expect(fallback).not.toMatch(/●|Real-time|live warehouse/);
    expect(fallback).toContain('t("From the catalogue")');
    expect(fallback).toContain('t("in stock now")');
    expect(fallback).toContain('aria-label={t("Store pulse")}');
    // The gallery is the only list a visitor came for, so the tests name it rather than count.
    expect(fallback).toContain('data-testid="showcase-grid"');
  });

  it('shows the campaigns that are actually running, with their own terms', async () => {
    renderApp('/');

    const section = await screen.findByRole('region', { name: /Offers you can use right now/i });
    // The terms under each code are a list too, so the cards are counted by their own class.
    expect(section.querySelectorAll('.home-offer-card')).toHaveLength(5);
    expect(within(section).getByText('SAVE10')).toBeInTheDocument();
    expect(within(section).getAllByText('15% OFF')).toHaveLength(2);
    expect(within(section).getByText('25% OFF')).toBeInTheDocument();
    expect(within(section).getByText(/On orders over BDT 1,000/)).toBeInTheDocument();
    expect(within(section).getByText(/Applied automatically at checkout/)).toBeInTheDocument();
    expect(within(section).queryByText('AUTO2000')).toBeNull();
    expect(within(section).getAllByRole('button', { name: /Copy voucher code/ })).toHaveLength(4);
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
