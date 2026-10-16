import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const modernCss = readFileSync(join(root, 'src', 'styles', 'modern.css'), 'utf8');

/**
 * The rules under test are written one per line, so a line match is the rule itself; matching on the
 * selector alone would return the first line that merely contains it, inside a media block or not.
 */
function rule(selector: string): string {
  const line = modernCss.split('\n').find(candidate => candidate.startsWith(`${selector} {`));
  if (!line) throw new Error(`no top-level rule for "${selector}"`);
  return line;
}

describe('Shared surface depth treatment', () => {
  it('gives the sales tiles and charts the dashboard tile surface in one rule', () => {
    // Three separate copies of the effect is how the pages drifted apart in the first place.
    const shared = ':is(.dashboard-stats, .sales-stats) .stat-tile, .sales-chart';
    expect(rule(shared)).toContain('background: var(--surface)');
    expect(rule(shared)).toContain('box-shadow: var(--card-shadow)');
    expect(rule(':is(.dashboard-stats, .sales-stats) .stat-tile::before, .sales-chart::before'))
      .toContain('background: var(--accent-gradient)');
    expect(rule(':is(.dashboard-stats, .sales-stats) .stat-tile:hover, .sales-chart:hover'))
      .toContain('transform: translateY(-2px)');
  });

  it('opens every data table with the same accent edge', () => {
    expect(rule('.table-surface::before')).toContain('background: var(--accent-gradient)');
    expect(rule('.table-surface')).toContain('position: relative');
  });

  it('animates table rows in only for visitors who want motion', () => {
    const flat = modernCss.replace(/\s+/g, ' ');
    const at = flat.indexOf('@media (prefers-reduced-motion: no-preference)');
    expect(at).toBeGreaterThanOrEqual(0);
    const block = balanced(flat, flat.indexOf('{', at));
    expect(block).toContain('.table-surface tbody tr { animation: row-in');
    // The stagger is finite: a long table must not queue behind a delay that grows with its rows.
    expect(block).toContain('.table-surface tbody tr:nth-child(n + 8)');
  });

  it('takes the lift and the transition off under reduced motion', () => {
    const flat = modernCss.replace(/\s+/g, ' ');
    const at = flat.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(at).toBeGreaterThanOrEqual(0);
    const block = balanced(flat, flat.indexOf('{', at));
    expect(block).toContain(':is(.dashboard-stats, .sales-stats) .stat-tile, .sales-chart { transition: none; }');
    expect(block).toContain('.sales-chart:hover { transform: none; }');
  });
});

/** The {...} run that starts at `open`, with the braces counted so nested rules stay inside. */
function balanced(css: string, open: number): string {
  let depth = 0;
  for (let index = open; index < css.length; index++) {
    if (css[index] === '{') depth++;
    if (css[index] === '}' && --depth === 0) return css.slice(open, index + 1);
  }
  throw new Error('unbalanced braces');
}
