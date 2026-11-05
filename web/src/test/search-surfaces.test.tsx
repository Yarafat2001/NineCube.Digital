import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { API } from './handlers';
import { server } from './server';
import { renderApp, seedSession } from './utils';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Windows checkouts hand these files over with CRLF, and a rule is matched by its closing "}" line,
// so the readers normalise before parsing; CI's checkout is already LF.
const read = (file: string) => readFileSync(join(root, 'src', 'styles', file), 'utf8').replace(/\r\n/g, '\n');
const app = read('app.css');
const modern = read('modern.css');
const responsive = read('responsive.css');

/**
 * These are the declarations a browser resolves into paint and stacking, so the contract worth
 * pinning here is "which token does this search surface take" - the pixel result is e2e's job.
 */
function block(css: string, selector: string): string {
  const lines = css.split('\n');
  const at = lines.findIndex(line => line.startsWith(`${selector} {`));
  if (at < 0) throw new Error(`no rule for "${selector}"`);
  const from = lines.slice(at).join('\n');
  let depth = 0;
  for (let index = from.indexOf('{'); index < from.length; index++) {
    if (from[index] === '{') depth++;
    if (from[index] === '}' && --depth === 0) return from.slice(from.indexOf('{'), index + 1);
  }
  throw new Error(`unbalanced braces in "${selector}"`);
}

/** The last rule wins in the cascade, which is where a size override lives. */
function lastBlock(css: string, selector: string): string {
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

async function signIn() {
  const user = seedSession('Customer');
  server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(user)));
}

/** Counts only the spotlight's own request shape, so the page underneath cannot move the number. */
function spotlightRequests() {
  const hits: number[] = [];
  const listener = ({ request }: { request: Request }) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/products' && url.searchParams.get('pageSize') === '6') hits.push(Date.now());
  };
  server.events.on('request:start', listener);
  return { count: () => hits.length, off: () => server.events.removeListener('request:start', listener) };
}

describe('Search surfaces follow the system plate', () => {
  it('opens the spotlight on the shared modal plate, not its own material', () => {
    const dialog = block(app, '.spotlight-dialog');
    expect(dialog).toContain('background: var(--surface)');
    expect(dialog).toContain('border: 1px solid var(--edge-shell)');
    expect(dialog).toContain('border-radius: var(--radius-lg)');
    expect(dialog).toContain('box-shadow: var(--shadow-lg)');
    // The house modal backdrop, so the dialog dims the page exactly like every other dialog.
    expect(block(app, '.spotlight-backdrop')).toContain('background: rgba(20, 17, 19, 0.45)');
    expect(block(app, '.spotlight-backdrop')).toContain('backdrop-filter: blur(4px)');
    expect(block(app, '.modal')).toContain('background: var(--surface)');
  });

  it('gives the spotlight query the house input well and one focus ring', () => {
    const field = block(app, '.spotlight-field');
    expect(field).toContain('background: var(--surface-sunken)');
    expect(field).toContain('border: 1px solid var(--border-strong)');
    expect(field).toContain('min-height: 46px');

    // The well rings itself only while the search field holds focus. As :focus-within it also lit
    // for the clear and close buttons inside it, which draw their own ring, so the field read as
    // outlined twice; and with an amber border under an amber ring it read as outlined twice again.
    const focusedWell = '.spotlight-field:has(.spotlight-input:focus-visible)';
    expect(block(app, focusedWell)).toContain('outline: var(--focus-ring)');
    expect(block(app, focusedWell)).not.toContain('border-color');
    expect(app).not.toContain('.spotlight-field:focus-within {');
    // The bare input must not draw a second ring inside the well.
    expect(block(app, '.spotlight-field .spotlight-input:focus-visible')).toContain('outline: none');
  });

  it('leaves one clear control in the well, not the app’s button beside Chromium’s', () => {
    // The whole rule, selectors included: which fields give up the native clear is the contract.
    const lines = app.split('\n');
    const at = lines.findIndex(line => line.startsWith('.spotlight-input::-webkit-search-cancel-button,'));
    expect(at).toBeGreaterThanOrEqual(0);
    const rule = lines.slice(at, lines.slice(at).findIndex(line => line === '}') + at + 1).join('\n');
    expect(rule).toContain('-webkit-appearance: none');
    expect(rule).toContain('display: none');

    // Scoped to the two fields that ship their own clear. The other ten search inputs have no
    // clear of their own, so a blanket reset would quietly take their only way out of a search.
    expect(app).not.toMatch(/^input\[type='search'\]::-webkit-search-cancel-button/m);
    expect(rule).toContain('.target-search__bar input::-webkit-search-cancel-button');
  });

  it('builds chips, rows and the footer key from the option tokens at label size', () => {
    for (const selector of ['.spotlight-chip', '.spotlight-item', '.spotlight-kbd']) {
      const rule = block(app, selector);
      expect(rule).toContain('background: var(--opt-fill)');
      expect(rule).toContain('border: 1px solid var(--opt-edge)');
    }
    expect(block(app, '.spotlight-chip')).toContain('font-size: var(--text-label)');
    expect(block(app, '.spotlight-chip')).toContain('min-height: 32px');
    expect(block(app, '.spotlight-item__name')).toContain('font-size: var(--text-base)');
    expect(block(app, '.spotlight-item__price')).toContain('font-size: var(--text-base)');
    // A horizontal scroller clipped the last chip with no affordance; the row wraps instead.
    expect(block(app, '.spotlight-categories-list')).toContain('flex-wrap: wrap');
  });

  it('keeps both clear controls above the tap floor and visibly different from each other', () => {
    // One shared rule gives both the 30px floor and the option face, then the close grows to 34px.
    expect(block(app, '.spotlight-close-btn')).toContain('width: 30px');
    expect(lastBlock(app, '.spotlight-close-btn')).toContain('width: 34px');
    // The clear sits inside the well, so it is a ghost: two identical circles read as a mistake.
    expect(lastBlock(app, '.spotlight-clear-btn')).toContain('background: transparent');
    expect(lastBlock(app, '.spotlight-clear-btn')).toContain('border-color: transparent');
  });

  it('floats the catalogue matches on a solid plate above the navbar plane', () => {
    const panel = block(app, '.search-suggestions');
    // --z-menu (60) sits over --z-nav (50); an equal 50 let the pill clip the first row.
    expect(panel).toContain('z-index: var(--z-menu)');
    expect(panel).toContain('background: var(--surface)');
    expect(panel).toContain('border: 1px solid var(--edge-shell)');
    expect(block(app, '.catalogue-search')).toContain('position: relative');
  });

  it('paints a suggestion row as a row, not as a hyperlink', () => {
    // modern.css paints every <a> with the accent colour, and responsive.css underlines text
    // navigation for touch users; both are correct for prose links and wrong inside a match list.
    const row = block(app, '.search-suggestions__row');
    expect(row).toContain('color: var(--text)');
    expect(row).toContain('text-decoration: none');
    expect(block(app, '.search-suggestions__name')).toContain('-webkit-line-clamp: 2');
    // The touch rule is (0,4,3) and app.css is (0,1,0), so the row has to leave that selector.
    const touchRule = responsive.split('\n').find(line => line.startsWith('main a[href]:not(.btn)'));
    expect(touchRule).toBeDefined();
    expect(touchRule).toContain(':not(.search-suggestions__row)');
  });

  it('covers a scrolling row instead of smearing it through the pill', () => {
    // The tint is approved material and stays; what is underneath it has to be opaque enough that
    // the row of cards scrolling past cannot read through the bar. That is the bar's own backing
    // colour, which is darker than the card surface in light mode and lighter in dark.
    const compact = block(modern, '.navbar--compact');
    expect(compact).toContain('background-color: var(--nav-glass-base-scroll);');
    expect(compact).toContain('background-image: var(--navbar-glass)');
  });
});

describe('Search surfaces ask the server only when asked', () => {
  it('makes no spotlight request until the dialog opens and two characters are typed', async () => {
    const user = userEvent.setup();
    const requests = spotlightRequests();
    await signIn();
    renderApp('/products');

    await screen.findByRole('heading', { name: /catalogue/i });
    await screen.findByText(/products found/i);
    expect(requests.count()).toBe(0);

    const trigger = await screen.findByRole('button', { name: /^search catalogue$/i });
    await user.click(trigger);
    await screen.findByRole('dialog', { name: /search catalogue/i });
    await waitFor(() => expect(screen.getByText(/quick categories:/i)).toBeInTheDocument());
    expect(requests.count()).toBe(0);

    await user.type(screen.getByPlaceholderText(/search by product name/i), 'iP');
    await waitFor(() => expect(screen.getByText(/top matching products/i)).toBeInTheDocument());
    expect(requests.count()).toBe(1);
    requests.off();
  });

  it('reports stock with the shared badge instead of an untranslated count', async () => {
    const user = userEvent.setup();
    await signIn();
    renderApp('/products');

    await user.click(await screen.findByRole('button', { name: /^search catalogue$/i }));
    await user.type(await screen.findByPlaceholderText(/search by product name/i), 'iPhone');
    const results = await screen.findByText(/top matching products/i);
    const dialog = results.closest<HTMLElement>('.spotlight-dialog')!;

    await waitFor(() => expect(within(dialog).getAllByTestId(/^stock-/).length).toBeGreaterThan(0));
    expect(dialog.textContent).not.toContain('✓');
    // The brand is already the first word of the seeded names; prefixing it painted "Apple Apple".
    expect(within(dialog).queryAllByText(/^Apple Apple/).length).toBe(0);
  });

  it('renders catalogue matches as links to the product, not as free text', async () => {
    const user = userEvent.setup();
    await signIn();
    renderApp('/products');

    await user.type(await screen.findByLabelText(/^search products$/i), 'iP');
    const panel = await screen.findByRole('listbox', { name: /search suggestions/i });
    const rows = await waitFor(() => {
      const found = within(panel).getAllByRole('link');
      expect(found.length).toBeGreaterThan(0);
      return found;
    });
    for (const row of rows) expect(row.getAttribute('href')).toMatch(/\/products\/\d+$/);
    expect(within(panel).getByText(/quick matches \(\d+\)/i)).toBeInTheDocument();
  });
});
