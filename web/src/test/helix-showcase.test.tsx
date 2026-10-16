import { render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { CARD_COUNT, DEFAULT_CARD_ASSETS, loadCardAssets, normaliseCardAssets } from '../helix/cardAssets';
import { showcaseCopy } from '../helix/showcaseCopy';
import { renderApp } from './utils';

/**
 * The showcase is an enhancement, so what matters most is that it degrades predictably: jsdom has
 * no WebGL at all, which is exactly the "this browser cannot run the scene" case, and the page has
 * to render the same nine cards and the same copy as a static grid.
 */
describe('Showcase route', () => {
  it('falls back to a static nine-card grid when WebGL is unavailable', async () => {
    renderApp('/');

    expect(await screen.findByTestId('showcase-fallback-reason')).toHaveTextContent(/webgl/i);

    // Same nine cards, in filename order, with real alt text.
    const grid = screen.getByRole('list');
    const cards = within(grid).getAllByRole('listitem');
    expect(cards).toHaveLength(CARD_COUNT);

    const images = within(grid).getAllByRole('img');
    expect(images).toHaveLength(CARD_COUNT);
    expect(images[0]).toHaveAttribute('src', expect.stringContaining('/assets/'));
    expect(images[0]).toHaveAttribute('alt', `Showcase card 1 of ${CARD_COUNT}`);

    // Same text: brand heading, both editorial titles and the closing footer copy.
    expect(screen.getByRole('heading', { level: 1, name: /ninecube digital/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: showcaseCopy.transitionTitle })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: showcaseCopy.footer.headline })).toBeInTheDocument();

    // The way out of the showcase is the catalogue.
    expect(screen.getByRole('link', { name: new RegExp(showcaseCopy.footer.cta, 'i') })).toHaveAttribute(
      'href',
      '/products'
    );

    // No canvas is created when the scene cannot run.
    expect(document.querySelector('#scene')).toBeNull();
  });

  it('falls back when the visitor asks for reduced motion', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('prefers-reduced-motion'),
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false
        }) as MediaQueryList
    );

    renderApp('/');

    expect(await screen.findByTestId('showcase-fallback-reason')).toHaveTextContent(/reduced motion/i);
    expect(screen.getByRole('list')).toBeInTheDocument();
  });

  it('drops the tall scroll track from the document when the showcase unmounts', async () => {
    const { unmount } = renderApp('/');

    await screen.findByTestId('showcase');
    expect(document.body).toHaveClass('showcase-active');

    unmount();

    // Leaving the route must restore the document's own scroll behaviour for every other page.
    expect(document.body).not.toHaveClass('showcase-active');
  });
});

describe('Card artwork resolution', () => {
  it('repeats fewer than nine images in filename order', () => {
    const nine = normaliseCardAssets(['work-01.svg', 'work-02.png']);

    expect(nine).toHaveLength(CARD_COUNT);
    expect(nine.slice(0, 4)).toEqual([
      '/assets/work-01.svg',
      '/assets/work-02.png',
      '/assets/work-01.svg',
      '/assets/work-02.png'
    ]);
  });

  it('falls back to the shipped artwork when the manifest lists nothing', () => {
    expect(normaliseCardAssets([])).toEqual([...DEFAULT_CARD_ASSETS]);
  });

  it('reads the generated manifest', async () => {
    const assets = await loadCardAssets();

    expect(assets).toHaveLength(CARD_COUNT);
    expect(assets[0]).toBe('/assets/work-01.svg');
    expect(assets[CARD_COUNT - 1]).toBe(`/assets/work-0${CARD_COUNT}.svg`);
  });

  it('uses the shipped artwork when the manifest cannot be read at all', async () => {
    const failing = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;

    expect(await loadCardAssets(failing)).toEqual([...DEFAULT_CARD_ASSETS]);
  });
});

describe('ErrorBoundary', () => {
  it('renders its fallback instead of letting a section failure blank the page', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    function Boom(): ReactElement {
      throw new Error('scene exploded');
    }

    render(
      <ErrorBoundary fallback={<p>Static fallback</p>}>
        <Boom />
      </ErrorBoundary>
    );

    expect(screen.getByText('Static fallback')).toBeInTheDocument();
    expect(spy).toHaveBeenCalled();
  });
});
