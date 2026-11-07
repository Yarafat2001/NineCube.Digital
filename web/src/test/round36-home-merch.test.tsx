import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import type { Category, Product } from '../api/types';
import { API, demoCoupons } from './handlers';
import { server } from './server';
import { renderApp } from './utils';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8');
const homeCss = read('src', 'styles', 'home.css');
const showcaseCss = read('src', 'helix', 'showcase.css');

/** The last rule for a selector wins in the cascade, so contract checks read the surviving block. */
function block(css: string, selector: string): string {
  const lines = css.split('\n');
  let at = -1;
  lines.forEach((line, index) => {
    if (line.startsWith(`${selector} {`) || line.startsWith(`${selector},`)) at = index;
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

const paged = (items: Product[], pageSize: number) => ({
  items,
  page: 1,
  pageSize,
  totalCount: items.length,
  totalPages: Math.ceil(items.length / pageSize) || 0,
  hasNext: false,
  hasPrevious: false
});

/** Mirrors the catalogue handler's filters (name/sku q, category, stock, price sort). */
const catalogueHandler = (catalogue: Product[]) =>
  http.get(`${API}/api/products`, ({ request }) => {
    const url = new URL(request.url);
    let items = [...catalogue];
    const q = url.searchParams.get('q');
    if (q) items = items.filter((p) => p.name.includes(q) || p.sku.includes(q));
    const categorySlug = url.searchParams.get('categorySlug');
    if (categorySlug) items = items.filter((p) => p.categories?.some((c) => c.slug === categorySlug));
    if (url.searchParams.get('inStock') === 'true') items = items.filter((p) => p.isActive && p.stockQuantity > 0);
    const sort = url.searchParams.get('sort');
    if (sort === 'price') items.sort((a, b) => a.price - b.price);
    else items.sort((a, b) => a.name.localeCompare(b.name));
    const pageSize = Number(url.searchParams.get('pageSize')) || 20;
    const page = Number(url.searchParams.get('page')) || 1;
    return HttpResponse.json(paged(items.slice((page - 1) * pageSize, page * pageSize), pageSize));
  });

/** Two stocked products: one discounted with a photo in Footwear, one full price in Audio. */
const merchProducts: Product[] = [
  {
    id: 101, sku: 'NC-2001', name: 'Apex Runner sneakers', price: 1200, compareAtPrice: 2400,
    stockQuantity: 5, isActive: true, rowVersion: null, currency: 'BDT',
    imageUrl: '/uploads/apex-runner.jpg',
    categories: [{ id: 1, name: 'Footwear', slug: 'footwear', isPrimary: true }]
  },
  {
    id: 102, sku: 'NC-2002', name: 'Wireless headphones Pro', price: 1299,
    stockQuantity: 3, isActive: true, rowVersion: null, currency: 'BDT',
    categories: [{ id: 2, name: 'Audio', slug: 'audio', isPrimary: true }]
  }
];

const category = (id: number, name: string, slug: string): Category => ({
  id, name, slug, parentId: null, path: `/${slug}`, depth: 0, sortOrder: id,
  isActive: true, productCount: 1, directProductCount: 1, inStockCount: 1,
  directInStockCount: 1, lowStockCount: 0, breadcrumb: [], children: []
});

const merchCategories = [category(1, 'Footwear', 'footwear'), category(2, 'Audio', 'audio')];

describe('The hero shows one real catalogue product as the shop window', () => {
  it('shows the strongest live deal with the saving the API reports', async () => {
    server.use(catalogueHandler(merchProducts), http.get(`${API}/api/categories`, () => HttpResponse.json(merchCategories)));
    renderApp('/');

    const panel = await screen.findByRole('complementary', { name: /Today's best deal/i });
    expect(within(panel).getByText('SAVE 50%')).toBeInTheDocument();
    expect(within(panel).getByText('Apex Runner sneakers')).toBeInTheDocument();
    expect(within(panel).getByText('BDT 1,200.00')).toBeInTheDocument();
    expect(within(panel).getByText('BDT 2,400.00')).toHaveClass('hero-deal__compare');
    expect(within(panel).getByRole('link')).toHaveAttribute('href', '/products/101');
    expect(within(panel).getByRole('img')).toHaveAttribute('src', '/uploads/apex-runner.jpg');
    expect(within(panel).getByText(/Shop this deal/)).toBeInTheDocument();
  });

  it('falls back to the newest arrival when nothing is discounted', async () => {
    renderApp('/');

    const panel = await screen.findByRole('complementary', { name: /New arrival/i });
    expect(within(panel).getByText('NEW ARRIVAL')).toBeInTheDocument();
    expect(within(panel).getByText('Just arrived')).toBeInTheDocument();
    expect(within(panel).getByText('Samsung Galaxy S25 256GB, Silver')).toBeInTheDocument();
    expect(within(panel).queryByText(/SAVE \d+%/)).toBeNull();
  });
});

describe('The category grid trades icon tiles for real photos where the catalogue has them', () => {
  it('shows the photo for a category with an imaged product and keeps icons otherwise', async () => {
    server.use(catalogueHandler(merchProducts), http.get(`${API}/api/categories`, () => HttpResponse.json(merchCategories)));
    renderApp('/');

    const strip = await screen.findByRole('region', { name: /Browse by Category/i });
    const footwear = within(strip).getByRole('link', { name: /Footwear/ });
    expect(footwear).toHaveClass('home-category-card--photo');
    expect(footwear).toHaveAttribute('href', '/products?category=footwear');
    expect(within(footwear).getByRole('img')).toHaveAttribute('src', '/uploads/apex-runner.jpg');

    const audio = within(strip).getByRole('link', { name: /Audio/ });
    expect(audio).not.toHaveClass('home-category-card--photo');
    expect(within(audio).queryByRole('img')).toBeNull();
    expect(audio.querySelector('.home-category-icon')).not.toBeNull();
  });
});

describe('The hero promos anchor their prices to the cheapest real match', () => {
  it('shows the cheapest in-stock price per promo query', async () => {
    server.use(catalogueHandler(merchProducts), http.get(`${API}/api/categories`, () => HttpResponse.json([])));
    renderApp('/');

    const promos = await screen.findByRole('complementary', { name: /Featured collections/i });
    expect(within(promos).getByText(/From BDT 1,200\.00/)).toBeInTheDocument();
    expect(within(promos).getByText(/From BDT 1,299\.00/)).toBeInTheDocument();
  });

  it('hides the anchor while the catalogue has no answer for the promo', async () => {
    server.use(http.get(`${API}/api/categories`, () => HttpResponse.json([])));
    renderApp('/');

    const promos = await screen.findByRole('complementary', { name: /Featured collections/i });
    await waitFor(() => expect(within(promos).queryByText(/^From BDT/)).toBeNull());
  });
});

describe('The campaign banner bands one featured campaign across the home', () => {
  it('leads with the campaign title the store wrote, its scope and its link', async () => {
    renderApp('/');

    const banner = await screen.findByRole('region', { name: /Duramo Special/i });
    expect(within(banner).getByText('Campaign of the moment')).toBeInTheDocument();
    expect(within(banner).getByText('Discount on Product')).toBeInTheDocument();
    expect(within(banner).getByText('Running now')).toBeInTheDocument();
    expect(within(banner).getByRole('link', { name: /Shop the sale/ })).toHaveAttribute('href', '/products');
  });

  it('carries the amount itself when the store wrote no title', async () => {
    server.use(http.get(`${API}/api/coupons/campaigns`, () => HttpResponse.json([
      { ...demoCoupons[3], campaignTitle: null, isBannerPromoted: true }
    ])));
    renderApp('/');

    const banner = await screen.findByRole('region', { name: /Up to 15% OFF/ });
    expect(within(banner).getByText('Discount on Category')).toBeInTheDocument();
  });

  it('stays silent when no campaign is running', async () => {
    server.use(http.get(`${API}/api/coupons/campaigns`, () => HttpResponse.json([])));
    renderApp('/');

    await waitFor(() => expect(screen.queryByText('Campaign of the moment')).toBeNull());
    expect(screen.queryByRole('link', { name: /Shop the sale/ })).toBeNull();
  });
});

describe('The featured grid marks only the newest arrivals', () => {
  it('badges the newest ids and leaves older cards clean', async () => {
    renderApp('/');

    const section = await screen.findByRole('region', { name: /Featured Deals/i });
    await waitFor(() => expect(section.querySelectorAll('.home-deal-new-badge')).toHaveLength(2));
    const newestCard = within(section).getByRole('link', { name: 'Open Apple iPhone 16 128GB, Black (83170123)' })
      .closest('.home-deal-card') as HTMLElement;
    expect(newestCard.querySelector('.home-deal-new-badge')).not.toBeNull();
    const olderCard = within(section).getByRole('link', { name: 'Open Espresso Machine Pro' })
      .closest('.home-deal-card') as HTMLElement;
    expect(olderCard.querySelector('.home-deal-new-badge')).toBeNull();
  });
});

describe('The footer answers where, how and what it costs', () => {
  it('carries the store, help and payments columns with working links', async () => {
    renderApp('/');

    const footer = await screen.findByRole('contentinfo', { name: /home footer/i });
    const grid = footer.querySelector('.showcase-footer__grid');
    expect(grid).not.toBeNull();
    expect(grid!.querySelectorAll('.showcase-footer__col')).toHaveLength(3);

    for (const [href, label] of [
      ['/products', 'Collection'],
      ['/products?sort=newest', 'New arrivals'],
      ['/gift-cards', 'Gift cards'],
      ['/wishlist', 'Wishlist'],
      ['/help', 'Help & support'],
      ['/policies/delivery', 'Delivery'],
      ['/policies/returns', 'Returns & warranty'],
      ['/policies/terms', 'Order terms']
    ]) {
      expect(within(grid as HTMLElement).getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
    expect(grid).toHaveTextContent('Payments');
    expect(grid).toHaveTextContent('Available payment methods are shown at checkout.');
    expect(grid).toHaveTextContent('Online payments are verified by the payment provider before an order is counted as paid.');
  });
});

describe('Every new surface is painted with house tokens only', () => {
  const painted = /#[0-9a-fA-F]{3,8}\b|rgba\(|hsla\(|linear-gradient\(\s*#/;
  const newHomeSelectors = [
    '.home-category-card--photo', '.home-category-photo', '.home-deal-new-badge',
    '.home-campaign-banner', '.home-campaign-banner__inner', '.home-campaign-banner__kicker',
    '.home-campaign-banner__headline', '.home-campaign-banner__amount', '.home-campaign-banner__scope',
    '.home-campaign-banner__countdown', '.home-campaign-banner__cta'
  ];
  const newShowcaseSelectors = [
    '.showcase__hero-layout', '.showcase__hero-main', '.hero-deal', '.hero-deal__card',
    '.hero-deal__photo', '.hero-deal__photo--empty', '.hero-deal__badge', '.hero-deal__body',
    '.hero-deal__kicker', '.hero-deal__name', '.hero-deal__price-row', '.hero-deal__price',
    '.hero-deal__compare', '.hero-deal__cta', '.hero-promo__from',
    '.showcase-footer__grid', '.showcase-footer__col'
  ];

  it('holds no literal paint in any new rule', () => {
    for (const selector of newHomeSelectors) {
      expect(block(homeCss, selector), `${selector} paints a literal colour`).not.toMatch(painted);
    }
    for (const selector of newShowcaseSelectors) {
      expect(block(showcaseCss, selector), `${selector} paints a literal colour`).not.toMatch(painted);
    }
  });

  it('lays the hero in two columns, stacked on a phone', () => {
    expect(block(showcaseCss, '.showcase__hero-layout')).toContain('grid-template-columns: minmax(0, 1.15fr) minmax(300px, 0.85fr);');
    expect(showcaseCss).toMatch(/@media \(max-width: 960px\) \{\s*\.showcase__hero-layout \{\s*grid-template-columns: minmax\(0, 1fr\);/);
  });

  it('keeps the deal card a solid token surface with the accent badge and muted strikethrough', () => {
    expect(block(showcaseCss, '.hero-deal__card')).toContain('background: var(--surface);');
    expect(block(showcaseCss, '.hero-deal__card')).toContain('border: 1px solid var(--border-strong);');
    expect(block(showcaseCss, '.hero-deal__badge')).toContain('background: var(--accent-gradient);');
    expect(block(showcaseCss, '.hero-deal__badge')).toContain('color: var(--on-accent);');
    expect(block(showcaseCss, '.hero-deal__compare')).toContain('text-decoration: line-through;');
    expect(block(showcaseCss, '.hero-deal__compare')).toContain('color: var(--text-muted);');
  });

  it('bands the banner with the accent gradient and pins its CTA on a phone', () => {
    expect(block(homeCss, '.home-campaign-banner__inner')).toContain('background: var(--accent-gradient);');
    expect(block(homeCss, '.home-campaign-banner__inner')).toContain('color: var(--on-accent);');
    expect(homeCss).toMatch(/@media \(max-width: 640px\) \{\s*\.home-campaign-banner__cta \{/);
  });

  it('paints the photo grid placeholder and the NEW badge from tokens', () => {
    expect(block(homeCss, '.home-category-photo')).toContain('background: var(--placeholder-gradient);');
    expect(block(homeCss, '.home-deal-new-badge')).toContain('background: var(--accent-gradient);');
    expect(block(homeCss, '.home-deal-new-badge')).toContain('color: var(--on-accent);');
  });

  it('lays the footer grid in three columns and one on a phone', () => {
    expect(block(showcaseCss, '.showcase-footer__grid')).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));');
    expect(showcaseCss).toMatch(/@media \(max-width: 720px\) \{\s*\.showcase-footer__grid \{\s*grid-template-columns: minmax\(0, 1fr\);/);
  });
});

describe('The merchandising layer only claims what the catalogue can back up', () => {
  it('never invents sales rankings or emoji-as-icons', () => {
    const sources = [
      read('src', 'components', 'home', 'HeroDealPanel.tsx'),
      read('src', 'components', 'home', 'HomeCampaignBanner.tsx'),
      read('src', 'components', 'home', 'useHomeMerch.ts'),
      read('src', 'lib', 'campaignFacts.ts')
    ].join('\n');
    expect(sources).not.toMatch(/Best seller|BEST SELLER/i);
    expect(sources).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u);
  });

  it('feeds the banner from the shared campaign facts, not a second set of rules', () => {
    const banner = read('src', 'components', 'home', 'HomeCampaignBanner.tsx');
    expect(banner).toContain('pickFeaturedCampaign(campaigns)');
    expect(banner).toContain('offerAmount(featured)');
    expect(banner).toContain('offerScope(featured)');
    expect(banner).toContain('offerLink(featured)');
  });
});
