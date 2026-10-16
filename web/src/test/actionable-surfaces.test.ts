import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(root, 'src', 'styles', file), 'utf8');
const modern = read('modern.css');
const app = read('app.css');

/**
 * These are the declarations a browser resolves into paint and geometry, so the contract worth
 * pinning is "which token does this surface take" - the pixel-level result is e2e's job.
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

describe('Actionable chips and one-line actions', () => {
  it('paints a card chip as an applied filter instead of a hole in the card', () => {
    // --surface-sunken is what made the chip a black pill on the dark glass card.
    const chip = block(modern, ':root .product-card :is(a, button).filter-chip');
    expect(chip).toContain('background: var(--selected-bg)');
    expect(chip).toContain('color: var(--accent-text)');
    expect(chip).toContain('border-color: var(--selected-bar)');
    expect(chip).toContain('font-weight: 650');
    expect(chip).not.toContain('var(--surface-sunken)');
  });

  it('fills the chip on hover and keeps the non-actionable counter neutral', () => {
    const hover = block(modern, ':root .product-card :is(a, button).filter-chip:hover');
    expect(hover).toContain('background: var(--accent-gradient)');
    expect(hover).toContain('color: var(--on-accent)');
    // "+3" is not a link, so it must not advertise one.
    expect(block(modern, ':root .product-card .filter-chip--extra')).toContain('background: var(--neutral-tint)');
  });

  it('keeps an actions column on one line and lets the text columns give way', () => {
    expect(block(app, 'td.actions')).toContain('width: 1%');
    expect(block(app, 'td.actions .row')).toContain('flex-wrap: nowrap');
  });

  it('sits a toolbar button on the field it acts on', () => {
    // .row centres its items, and a labelled field is half a label taller than its input.
    expect(block(app, '.row:has(> .field) > .btn:not(.btn--sm)')).toContain('align-self: flex-end');
  });

  it('lets a long modal title shrink instead of pushing the dialog open', () => {
    const title = block(app, '.modal > .row-between > h3');
    expect(title).toContain('flex: 1 1 0');
    expect(title).toContain('min-width: 0');
    expect(title).toContain('overflow-wrap: anywhere');
    expect(block(app, '.modal > .row-between > .btn')).toContain('flex: 0 0 auto');
  });

  it('themes the upload button, which no plain input rule can reach', () => {
    const upload = block(app, "input[type='file']::file-selector-button");
    expect(upload).toContain('background: var(--neutral-tint)');
    expect(upload).toContain('color: var(--text)');
    expect(upload).toContain('cursor: pointer');
    expect(block(app, "input[type='file']")).toContain('padding: var(--space-1)');
  });

  it('marks the current navbar tab with the same selected amber as the other switched-on controls', () => {
    // One rule carries the whole header's "this one" state, so the current tab, an open account menu
    // and the switched-on theme choice cannot drift into three different looks.
    const selected = block(modern, ":root .navbar :is(.navbar__link[aria-current='page'], .nav-pop__trigger[aria-expanded='true'], .theme-control[aria-pressed='true'])");
    expect(selected).toContain('background: var(--accent-gradient)');
    expect(selected).toContain('color: var(--on-accent)');
    // The tabs that are not current keep the shared hover fill rather than the selected one.
    expect(modern).toContain(".navbar__link:not([aria-current='page'])");
    // The account trigger's own rule agrees with it, and out-specifies the open-menu rule in
    // Navbar.css that would otherwise leave light ink sitting on the amber.
    expect(block(modern, ":root .navbar .navbar__actions .nav-control.nav-pop__trigger:is([aria-expanded='true'], :active)"))
      .toContain('background: var(--accent-gradient)');
  });

  it('paints a secondary button as a control, not as the surface it sits on', () => {
    // --nav-glass is the material of the card, tray and table behind it, which is why a row action
    // on /inventory or /admin looked like plain text.
    const button = block(modern, ':root .btn:not(.btn--primary):not(.btn--danger):not(.btn--ghost)');
    expect(button).toContain('background: var(--surface-raised)');
    expect(button).toContain('border-color: var(--border-strong)');
    expect(button).not.toContain('var(--nav-glass)');
    // A row action with no button chrome still has to read as an action.
    expect(block(app, 'td.actions .link-button')).toContain('color: var(--accent-text)');
  });
});
