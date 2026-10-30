import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ThemeControls } from '../components/ThemeControls';
import { formatMoney } from '../lib/helpers';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tokensCss = readFileSync(join(root, 'src', 'styles', 'tokens.css'), 'utf8');
const appCss = readFileSync(join(root, 'src', 'styles', 'app.css'), 'utf8');

/** WCAG relative luminance + contrast, so the suite enforces the AA targets itself. */
function luminance(hex: string): number {
  const rgb = hex.replace('#', '').match(/.{2}/g)!.map((c) => {
    const v = parseInt(c, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function valueOf(block: string, name: string): string {
  const start = block.indexOf(`${name}:`);
  if (start === -1) throw new Error(`token ${name} not found`);
  const end = block.indexOf(';', start);
  return block.slice(start + name.length + 1, end).trim();
}

/** The first :root block is the light token set (spec: :root and [data-theme="light"] share it). */
const lightBlock = tokensCss.slice(0, tokensCss.indexOf(':root[data-theme="dark"]'));

/**
 * Print CSS may force paper-white whatever the theme is; the token-only rule is about what appears
 * on screen, so the @media print blocks are dropped before the stylesheet is checked for colours.
 */
function withoutPrintBlocks(css: string): string {
  const kept: string[] = [];
  let cursor = 0;

  while (cursor < css.length) {
    const atRule = css.indexOf('@media', cursor);
    if (atRule === -1) {
      kept.push(css.slice(cursor));
      break;
    }

    kept.push(css.slice(cursor, atRule));
    const open = css.indexOf('{', atRule);
    const isPrint = /^@media\s+print\b/.test(css.slice(atRule, open));

    let depth = 0;
    let end = open;
    for (; end < css.length; end++) {
      if (css[end] === '{') depth++;
      else if (css[end] === '}' && --depth === 0) {
        end++;
        break;
      }
    }

    if (!isPrint) kept.push(css.slice(atRule, end));
    cursor = end;
  }

  return kept.join('');
}

const screenCss = withoutPrintBlocks(appCss);

describe('Light theme tokens', () => {
  it('defines the required spec tokens on :root with the exact values', () => {
    const expected: Array<[string, string]> = [
      ['--bg-page', '#E9EDF5'],
      ['--surface', '#FFFFFF'],
      ['--surface-sunken', '#F1F4F9'],
      ['--surface-glass', 'rgba(255, 255, 255, .62)'],
      ['--border', '#CBD3E1'],
      ['--border-strong', '#9AA6BA'],
      ['--text', '#0F172A'],
      ['--text-muted', '#475569'],
      ['--accent', '#F59E0B'],
      ['--accent-text', '#9A3F00'],
      ['--on-accent', '#1A1100'],
      ['--selected-bg', '#FFF1D6'],
      ['--selected-bar', '#D97706'],
      ['--ok-bg', '#DCFCE7'],
      ['--ok-text', '#14532D'],
      ['--ok-border', '#86EFAC'],
      ['--warn-bg', '#FEF3C7'],
      ['--warn-text', '#78350F'],
      ['--warn-border', '#FCD34D'],
      ['--bad-bg', '#FEE2E2'],
      ['--bad-text', '#7F1D1D'],
      ['--bad-border', '#FCA5A5'],
    ];
    for (const [name, value] of expected) {
      expect(valueOf(lightBlock, name), name).toBe(value);
    }
  });

  it('keeps page, glass, card and image-well surfaces visibly distinct', () => {
    const surfaces = ['--bg-page', '--surface', '--surface-sunken'].map((name) => valueOf(lightBlock, name));
    expect(new Set(surfaces).size).toBe(surfaces.length);
    expect(valueOf(lightBlock, '--surface-glass')).not.toBe(valueOf(lightBlock, '--surface'));
  });

  it('defaults to Light theme with toggle buttons present', () => {
    localStorage.clear();
    render(<ThemeControls />);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.queryByRole('button', { name: 'System theme' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Light theme' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dark theme' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Light theme' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Dark theme' })).toHaveAttribute('aria-pressed', 'false');
    delete document.documentElement.dataset.theme;
  });

  it('uses token classes for cards and sidebar, never inline white', () => {
    expect(screenCss).toContain('.product-card');
    expect(screenCss).toContain('background: var(--surface)');
    expect(screenCss).toContain('background: var(--surface-sunken)');
    expect(screenCss).toContain('.category-filter-panel');
    expect(screenCss).not.toContain('background: #fff');
    expect(screenCss).not.toContain('background:#fff');
  });

  it('formats the store currency as BDT by default', () => {
    expect(formatMoney(249)).toContain('BDT');
  });
});

describe('Light theme contrast (WCAG AA)', () => {
  it('meets 4.5:1 for text, muted text, chips, badges, buttons and brand', () => {
    const text = valueOf(lightBlock, '--text');
    const muted = valueOf(lightBlock, '--text-muted');
    const surface = valueOf(lightBlock, '--surface');
    const sunken = valueOf(lightBlock, '--surface-sunken');
    const pairs: Array<[string, string, string]> = [
      ['body text', text, surface],
      ['muted text', muted, surface],
      ['chip text on sunken well', text, sunken],
      ['ok badge', valueOf(lightBlock, '--ok-text'), valueOf(lightBlock, '--ok-bg')],
      ['warn badge', valueOf(lightBlock, '--warn-text'), valueOf(lightBlock, '--warn-bg')],
      ['bad badge', valueOf(lightBlock, '--bad-text'), valueOf(lightBlock, '--bad-bg')],
      ['primary button ink on accent', valueOf(lightBlock, '--on-accent'), valueOf(lightBlock, '--accent')],
      ['brand label on card', valueOf(lightBlock, '--accent-text'), surface],
    ];
    for (const [label, fg, bg] of pairs) {
      expect(ratio(fg, bg), label).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps selection, borders and focus visibly distinct from the card surface', () => {
    // Structural guarantees: a 3px selected bar (declared transparent on the row, recoloured by
    // [data-selected] so the row height never shifts), solid (non-dashed) image wells,
    // and a 2px accent focus ring with offset — none of these rely on color alone.
    expect(appCss).toMatch(/\.category-tree__row\s*\{[^}]*border-left:\s*3px solid transparent/);
    expect(appCss).toContain('border-left-color: var(--selected-bar)');
    expect(appCss).toContain('outline: 2px solid var(--accent)');
    expect(appCss).toContain('outline-offset: 2px');
    expect(valueOf(lightBlock, '--border-strong')).not.toBe(valueOf(lightBlock, '--surface'));
    expect(valueOf(lightBlock, '--selected-bar')).not.toBe(valueOf(lightBlock, '--surface'));
  });
});
