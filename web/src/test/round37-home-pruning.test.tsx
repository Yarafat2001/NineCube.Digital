import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from './utils';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8');
const home = read('src', 'styles', 'home.css');
const fallback = read('src', 'helix', 'ShowcaseFallback.tsx');

/** Every media query block for a query, so a phone rule can be read on its own. */
function mediaBlocks(css: string, query: string): string {
  const marker = `@media (${query}) {`;
  const blocks: string[] = [];
  let start = css.indexOf(marker);
  while (start >= 0) {
    let depth = 0;
    for (let index = start; index < css.length; index++) {
      if (css[index] === '{') depth++;
      if (css[index] === '}' && --depth === 0) {
        blocks.push(css.slice(start, index + 1));
        break;
      }
    }
    start = css.indexOf(marker, start + marker.length);
  }
  if (blocks.length === 0) throw new Error(`no media query "${query}"`);
  return blocks.join('\n');
}

describe('The home page carries no dashboard and no duplicate offer', () => {
  it('dropped the stock counter board', async () => {
    renderApp('/');
    await screen.findByTestId('showcase-fallback-reason');

    expect(screen.queryByRole('region', { name: /Store pulse/i })).toBeNull();
    expect(document.querySelector('.home-store-pulse')).toBeNull();
    expect(fallback).not.toMatch(/home-store-pulse|Store pulse|Smart picks|Modern commerce/);
    expect(home).not.toMatch(/\.home-store-pulse/);
  });

  it('prints the featured campaign once, on the band', async () => {
    renderApp('/');
    await screen.findByTestId('showcase-fallback-reason');

    const band = await waitFor(() => {
      const node = document.querySelector('.home-campaign-banner');
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });
    const offers = await waitFor(() => {
      const node = document.querySelector('.home-offers-grid');
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });
    expect(band.textContent).toContain('DURAMO25');
    expect(offers.textContent).not.toContain('DURAMO25');
  });

  it('lists the brands as a rail of links, not a shelf of cards', async () => {
    renderApp('/');
    await screen.findByTestId('showcase-fallback-reason');

    const rail = await waitFor(() => {
      const node = document.querySelector('.home-brand-rail');
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });
    expect(rail.querySelectorAll('.home-brand-chip').length).toBeGreaterThan(0);
    expect(document.querySelector('.home-brand-card')).toBeNull();
    expect(document.querySelector('.home-brand-grid')).toBeNull();
  });

  it('reads the page product first: categories, products, offers, brands', async () => {
    renderApp('/');
    await screen.findByTestId('showcase-fallback-reason');

    const order = await waitFor(() => {
      const sequence = Array.from(document.querySelectorAll('.showcase--static > *')).map((node) =>
        node.querySelector('.home-category-strip') ? 'categories'
          : node.querySelector('.home-deals-grid') ? 'deals'
            : node.querySelector('.home-offers-grid') ? 'offers'
              : node.querySelector('.home-brand-rail') ? 'brands'
                : node.querySelector('.home-campaign-banner') ? 'campaign'
                  : ''
      ).filter(Boolean);
      expect(sequence).toContain('categories');
      expect(sequence).toContain('deals');
      expect(sequence).toContain('campaign');
      expect(sequence).toContain('offers');
      expect(sequence).toContain('brands');
      return sequence;
    });

    expect(order.indexOf('categories')).toBeLessThan(order.indexOf('deals'));
    expect(order.indexOf('deals')).toBeLessThan(order.indexOf('campaign'));
    expect(order.indexOf('campaign')).toBeLessThan(order.indexOf('offers'));
    expect(order.indexOf('offers')).toBeLessThan(order.indexOf('brands'));
  });
});

describe('The hero and the phone grid fill the space they are given', () => {
  it('gives the shop window the second half of the hero', () => {
    // The section holds one column, so the layout inside it can use the whole width.
    expect(home).toContain('.showcase--static .showcase__hero-layout');
    expect(home).toContain('grid-template-columns: minmax(0, 1fr) minmax(320px, 0.58fr);');
    expect(home).not.toContain('grid-template-columns: minmax(0, 1.1fr) minmax(300px, 0.9fr);');
  });

  it('shows two product tiles per row on a phone', () => {
    const phone = mediaBlocks(home, 'max-width: 640px');
    expect(phone).toMatch(/\.home-deals-grid \{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
    // The narrowest phone keeps two tiles per row too; one column cost a thousand pixels of scroll.
    const narrow = mediaBlocks(home, 'max-width: 400px');
    expect(narrow).not.toMatch(/\.home-deals-grid \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  });
});
