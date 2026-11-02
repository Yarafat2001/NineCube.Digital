import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(root, 'src', file), 'utf8');
const app = read('styles/app.css');
const modern = read('styles/modern.css');
const tokens = read('styles/tokens.css');
const banner = read('components/CampaignBanner.css');
const cartMarkup = read('components/CartPanel.tsx');

/** The declarations a browser resolves into paint and geometry; the pixels are e2e's job. */
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

/** Every token a rule reaches for, so a deleted definition fails here rather than in a browser. */
function usedTokens(css: string): string[] {
  return [...css.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map(match => match[1]!);
}

const CONTROL_CLASSES = [
  '.segmented__option',
  '.discount-quick-pill',
  '.scope-add__chip',
  '.filter-chip',
  '.cart-quick-chip',
  '.cart-input',
  '.cart-sheet__close'
];

describe('A choice reads as a control', () => {
  it('gives an unselected option a raised face, an edge and label-size type', () => {
    const option = block(app, '.segmented__option');
    // Before this round the option was `background: transparent; border: none` on a --well-fill
    // tray, which measured 1.00:1 against the tray it sits in: plain text with a click handler.
    expect(option).toContain('background: var(--opt-fill)');
    expect(option).toContain('border: 1px solid var(--opt-edge)');
    expect(option).toContain('color: var(--opt-ink)');
    expect(option).toContain('font-size: var(--text-label)');
    expect(option).toContain('min-height: 30px');
    expect(option).not.toContain('background: transparent');
    // The selected state is the amber fill the owner approved; it must not be re-flattened.
    const active = block(app, '.segmented__option--active');
    expect(active).toContain('background: var(--selected-bg)');
    expect(active).toContain('border-color: var(--selected-bar)');
  });

  it('keeps a five-option filter row inside a 390px page', () => {
    const row = block(app, '.segmented');
    expect(row).toContain('flex-wrap: wrap');
    expect(row).toContain('max-width: 100%');
  });

  it('runs every preset, chip, field and dismiss control through the same option tokens', () => {
    for (const selector of CONTROL_CLASSES) {
      const rule = block(app, selector);
      expect(rule, `${selector} has no edge to read as a control`).toContain('var(--opt-edge)');
      expect(rule, `${selector} paints no face of its own`).toContain('var(--opt-fill)');
    }
    // Nothing may drop back to the 12px micro size for a label a person has to click.
    for (const selector of ['.segmented__option', '.discount-quick-pill', '.scope-add__chip', '.cart-quick-chip']) {
      const rule = block(app, selector);
      expect(rule, `${selector} is smaller than the label step`).toContain('font-size: var(--text-label)');
    }
  });

  it('defines the option tokens in both themes, and in neither as transparent', () => {
    const light = tokens.slice(0, tokens.indexOf(':root[data-theme="dark"]'));
    const dark = tokens.slice(tokens.indexOf(':root[data-theme="dark"]'));
    for (const theme of [['light', light], ['dark', dark]] as const) {
      for (const name of ['--opt-fill', '--opt-edge', '--opt-ink']) {
        const line = theme[1].split('\n').find(row => row.trim().startsWith(`${name}:`));
        expect(line, `${name} is undefined in ${theme[0]}`).toBeDefined();
        expect(line).not.toContain('transparent');
      }
    }
  });
});

describe('The cart sheet is one surface that shows what it holds', () => {
  it('lets the panel keep its own height instead of scrolling inside the sheet', () => {
    // .cart-panel used to be sticky with a max-height and its own overflow, and the nested
    // scroller collapsed .cart-lines to height: 0 - a two-item cart painted with no items.
    const panel = block(app, '.cart-panel');
    expect(panel).not.toContain('position: sticky');
    expect(panel).not.toContain('max-height');
    expect(panel).not.toContain('overflow');
    expect(block(app, '.cart-lines')).toContain('flex: 0 0 auto');
    // The sheet is the single scroller, so the glass card treatment stays off the panel.
    expect(cartMarkup).toContain('<section className="cart-panel"');
  });

  it('pins only the total and the call to action', () => {
    const dock = block(app, '.cart-sticky-dock');
    expect(dock).toContain('position: sticky');
    expect(dock).toContain('border-top: 1px solid var(--edge-shell)');
    expect(block(app, '.cart-sticky-dock__cta')).toContain('min-height: 46px');
    // One total, in the dock; the summary box states the lines that build it.
    expect(cartMarkup.match(/data-testid="cart-total"/g)?.length).toBe(2);
  });

  it('keeps a discount amount on the same line as its label', () => {
    expect(block(app, '.cart-note__head strong')).toContain('white-space: nowrap');
  });

  it('puts the dismiss control on the title row, named the way the specs reach it', () => {
    const head = cartMarkup.slice(cartMarkup.indexOf('cart-panel__head'));
    expect(head.slice(0, 900)).toContain('className="cart-sheet__close"');
    expect(head.slice(0, 900)).toContain('aria-label={t("Close cart")}');
    expect(cartMarkup).not.toContain('className="btn cart-sheet__close"');
  });

  it('paints the cart from tokens only', () => {
    // The cart used to carry eight hard-coded light-mode hexes and six tokens this theme system
    // never defines, so in dark it kept its light paint and the fallbacks never resolved.
    const cartRules = [...app.matchAll(/([^{}\n]*\.cart-[^{}\n]*)\{([^}]*)\}/g)].map(match => match[2]!);
    expect(cartRules.length, 'no .cart-* rules found').toBeGreaterThan(30);
    for (const rule of cartRules) {
      expect(rule).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      for (const dead of ['--surface-muted', '--surface-ok', '--surface-hover', '--accent-subtle', '--text-md', '--text-bright']) {
        expect(rule, `${dead} is not a token in this theme system`).not.toContain(dead);
      }
    }
  });
});

describe('Nothing in the page paints over a dialog', () => {
  it('keeps the campaign strip under the modal layer', () => {
    const modal = Number(tokens.match(/--z-modal:\s*(\d+)/)?.[1]);
    const sticky = Number(tokens.match(/--z-sticky:\s*(\d+)/)?.[1]);
    expect(modal).toBeGreaterThan(0);
    // At 100 the strip sat above every sheet and hid the cart's Close button on a phone.
    expect(block(banner, '.campaign-banner')).toContain('z-index: var(--z-sticky)');
    expect(sticky).toBeLessThan(modal);
  });
});

describe('The cart stylesheet only reaches tokens that exist', () => {
  it('resolves every var() in app.css against tokens.css', () => {
    const defined = new Set([...tokens.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(match => match[1]!));
    // Sizes, radii and colours declared inside app.css or the modern layer are equally real.
    for (const match of app.matchAll(/(--[a-z0-9-]+)\s*:/g)) defined.add(match[1]!);
    for (const match of modern.matchAll(/(--[a-z0-9-]+)\s*:/g)) defined.add(match[1]!);
    const missing = [...new Set(usedTokens(app))].filter(name => !defined.has(name));
    expect(missing, `app.css reaches for undeclared ${missing.join(', ')}`).toEqual([]);
  });
});
