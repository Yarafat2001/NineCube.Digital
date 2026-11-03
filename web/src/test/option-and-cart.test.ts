import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(root, 'src', file), 'utf8');
const app = read('styles/app.css');
const modern = read('styles/modern.css');
const responsive = read('styles/responsive.css');
const tokens = read('styles/tokens.css');
const banner = read('components/CampaignBanner.css');
const cartMarkup = read('components/CartPanel.tsx');
const iconSet = read('components/Icon.tsx');

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

/**
 * The value a colour token actually resolves to in a theme, following one var() indirection and
 * honouring source order, since tokens.css re-declares parts of its colour set after the theme
 * blocks (that is what lifted --border-strong from a 4%-alpha wash to an opaque #77859A).
 */
const tokenRules = [...tokens.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(rule => ({ selectors: rule[1]!.split(',').map(part => part.trim().replace(/"/g, "'")), body: rule[2]! }));

function tokenValue(name: string, theme: 'light' | 'dark', seen = 0): string {
  const wanted = theme === 'light' ? [':root', ":root[data-theme='light']"] : [":root[data-theme='dark']"];
  let value = '';
  for (const rule of tokenRules) {
    if (!rule.selectors.some(part => wanted.includes(part))) continue;
    const hits = [...rule.body.matchAll(new RegExp(`--${name}:\\s*([^;]+)`, 'g'))];
    if (hits.length) value = hits[hits.length - 1]![1]!.trim();
  }
  const indirect = value.match(/^var\(\s*(--[a-z0-9-]+)\s*\)$/);
  if (indirect && seen < 3) return tokenValue(indirect[1]!.slice(2), theme, seen + 1);
  return value;
}

/** WCAG contrast between two resolved colours, so "invisible" is a number, not an opinion. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const channels = hex.replace('#', '').match(/.{2}/g)!.map(part => {
      const v = parseInt(part, 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
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

describe('The sheet is one plate of matched wells', () => {
  it('gives the recommendation block the well treatment its classes never had', () => {
    const well = block(app, '.cart-upsell');
    for (const token of ['var(--edge-well)', 'var(--radius-md)', 'var(--well-fill)', 'var(--well-shadow)']) {
      expect(well, `.cart-upsell never asks for ${token}`).toContain(token);
    }

    // Each recommendation is one row: name and price hold the flexible column, the Add control
    // sits on the trailing edge. Every .cart-upsell class shipped without a single rule, so three
    // items rendered as bare 16px copy with a solid button stacked under each price - 270px tall
    // at 1440 where the styled block measures 218px.
    const item = block(app, '.cart-upsell__item');
    expect(item).toContain('grid-template-columns: minmax(0, 1fr) auto');
    expect(item).toContain('border-top: 1px solid var(--row-line)');
    expect(block(app, '.cart-upsell__item:first-child')).toContain('border-top: 0');

    const title = block(app, '.cart-upsell__title');
    expect(title).toContain('font-size: var(--text-label)');
    expect(title).toContain('text-transform: uppercase');
    expect(block(app, '.cart-upsell__name')).toContain('font-size: var(--text-sm)');
    expect(block(app, '.cart-upsell__price')).toContain('font-variant-numeric: tabular-nums');

    // The thumbnails were taken out on purpose; this block must not reintroduce them.
    const upsell = cartMarkup.slice(cartMarkup.indexOf('cart-upsell'), cartMarkup.indexOf('cart-checkout-extras'));
    expect(upsell).not.toMatch(/<img|ProductThumbnail|cart-upsell__(media|image)/);
  });

  it('makes the Add control a step below the call to action, not the same button', () => {
    // Nine dialogs' Cancel buttons and the cart's Add already carried .btn--outline, but no rule
    // matched the class anywhere, so the default-paint selector in modern.css gave them the same
    // raised white face as the action they are meant to step back from.
    const outline = block(modern, '.btn--outline');
    expect(outline).toContain('background: transparent');
    expect(outline).toContain('box-shadow: none');
    expect(outline).toContain('border-color: var(--opt-edge)');

    const defaultPaint = modern.split('\n').find(line => line.startsWith(':root .btn:not(.btn--primary):not(.btn--danger):not(.btn--ghost)'));
    expect(defaultPaint, 'the default button paint must leave the outline tier alone').toContain(':not(.btn--outline)');
    expect(cartMarkup).toContain('btn btn--sm btn--outline cart-upsell__btn');
  });

  it('gives every well in the sheet the same corner', () => {
    for (const selector of ['.cart-lines', '.cart-ship', '.cart-upsell', '.cart-checkout-extras fieldset']) {
      expect(block(app, selector), `${selector} breaks the well radius`).toContain('border-radius: var(--radius-md)');
    }
  });

  it('draws the delivery rail in a colour its own tray cannot swallow', () => {
    const track = block(app, '.cart-ship__track');
    expect(track).toContain('background: var(--border-strong)');
    expect(track).not.toContain('var(--surface-sunken)');

    for (const theme of ['light', 'dark'] as const) {
      const rail = tokenValue('border-strong', theme);
      const tray = tokenValue('well-fill', theme);
      expect(rail).toMatch(/^#[0-9a-f]{6}$/i);
      expect(tray).toMatch(/^#[0-9a-f]{6}$/i);
      // The rail used to be --surface-sunken, which the dark well is literally made of: an empty
      // 0% track measured no edge at all. Under 1.2 it is decoration rather than a rail.
      expect(contrast(rail, tray), `${theme}: ${rail} on ${tray} is not a rail`).toBeGreaterThanOrEqual(1.2);
    }
  });

  it('draws its labels with the house icon set instead of colour emoji', () => {
    const pictographs = [...cartMarkup.matchAll(/[\u{1F000}-\u{1FAFF}\u{FE0F}]/gu)].map(match => match[0]);
    expect(pictographs, `the sheet still uses ${pictographs.join(' ')}`).toEqual([]);

    const names = [...cartMarkup.matchAll(/<Icon name="([a-z]+)"/g)].map(match => match[1]!);
    expect(names.length).toBeGreaterThanOrEqual(10);
    const defined = new Set([...iconSet.matchAll(/([A-Za-z]+):\s*'/g)].map(match => match[1]!));
    for (const name of names) expect(defined.has(name), `Icon has no "${name}" glyph`).toBe(true);
    for (const replaced of ['trash', 'truck', 'spark', 'ticket', 'gift', 'wallet', 'card', 'phone', 'bolt']) {
      expect(names, `the sheet still writes ${replaced} as an emoji`).toContain(replaced);
    }
  });

  it('sits those line icons on the text instead of under it', () => {
    // Icon defaults to 20px on a 13px label, and a bare inline svg sits on the baseline, so every
    // replaced glyph hung a step below its own copy.
    expect(block(app, '.cart-panel svg')).toContain('width: 16px');
    expect(block(app, '.cart-upsell__title svg, .cart-field__label svg')).toContain('width: 14px');
    for (const selector of ['.cart-ship__row > span', '.cart-field__label > span', '.cart-toggle-coupons-btn > span:first-child', '.cart-summary-row > span:first-child']) {
      const rule = block(app, selector);
      expect(rule, `${selector} cannot centre its glyph`).toContain('display: inline-flex');
      expect(rule).toContain('align-items: center');
    }
  });

  it('makes guest checkout a section of the plate instead of a second box', () => {
    const fieldset = block(app, '.cart-checkout-extras fieldset');
    expect(fieldset).toContain('border: 1px solid var(--edge-well)');
    expect(fieldset).toContain('background: var(--well-fill)');
    expect(fieldset).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(block(app, '.cart-checkout-extras legend')).toContain('font-size: var(--text-label)');

    // The native fieldset stacked seven full-width fields down the sheet, which measured 2075px of
    // scroll at 1440 and kept the bottom half of the form behind the sticky total (1633px now).
    // A phone is the sheet, so there every field takes the whole line again.
    const at = responsive.indexOf('.cart-checkout-extras fieldset { grid-template-columns: minmax(0, 1fr); }');
    expect(at, 'the guest grid never collapses on a phone').toBeGreaterThan(-1);
    const query = responsive.slice(0, at).split('\n').filter(line => line.trim().startsWith('@media')).pop();
    expect(query!.trim()).toBe('@media (max-width: 640px) {');
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
