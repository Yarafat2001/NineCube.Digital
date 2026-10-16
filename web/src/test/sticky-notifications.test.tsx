import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { groupNotifications } from '../components/AccountMenu';
import type { Notification } from '../api/types';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tokensCss = readFileSync(join(root, 'src', 'styles', 'tokens.css'), 'utf8');
const appCss = readFileSync(join(root, 'src', 'styles', 'app.css'), 'utf8');
/** `html { scroll-padding-top }` lives with the other global resets in base.css. */
const baseCss = readFileSync(join(root, 'src', 'styles', 'base.css'), 'utf8');
const modernCss = readFileSync(join(root, 'src', 'styles', 'modern.css'), 'utf8');

const notif = (overrides: Partial<Notification> & { id: number }): Notification => ({
  type: 'OrderStatusChanged',
  title: 'Order update',
  body: 'Changed',
  link: null,
  isRead: false,
  createdAt: new Date().toISOString(),
  readAt: null,
  ...overrides,
});

describe('Sticky + notification foundation', () => {
  it('defines the shared layer scale and measured heights', () => {
    for (const [name, value] of [
      ['--z-sticky', '40'],
      ['--z-nav', '50'],
      ['--z-bulkbar', '45'],
      ['--z-menu', '60'],
      ['--z-modal', '70'],
      ['--z-toast', '80'],
    ] as const) {
      expect(tokensCss).toContain(`${name}: ${value}`);
    }
    expect(tokensCss).toContain('--nav-h:');
    expect(tokensCss).toContain('--bottombar-h:');
    expect(baseCss).toContain('scroll-padding-top: calc(var(--nav-h) + 16px)');
  });

  it('pins sticky surfaces to the measured navbar height', () => {
    expect(appCss).toContain('top: var(--sticky-top)');
    // The toast column is the one fixed surface that cannot inherit --sticky-top, so it repeats the
    // same measurement - and has to stay in step with it.
    expect(appCss).toContain('top: calc(var(--nav-h) + 16px)');
    expect(tokensCss).toContain('--sticky-top: calc(var(--nav-h) + 16px)');
    // No hard-coded pixel sticky tops left on the cart panel.
    expect(appCss).not.toContain('top: 92px');
    // One sticky layer besides the navbar: popover and sheets sit above it.
    expect(appCss).toContain('z-index: var(--z-menu)');
    expect(appCss).toContain('z-index: var(--z-modal)');
    expect(appCss).toContain('z-index: var(--z-toast)');
  });

  it('keeps every stacked surface on the shared layer scale', () => {
    const sheets: Record<string, string> = { appCss, baseCss, modernCss, tokensCss };
    const outsideScale = Object.entries(sheets).flatMap(([name, css]) =>
      [...css.matchAll(/z-index:\s*([^;]+);/g)]
        .map((match) => match[1].trim())
        .filter((value) => !/^var\(--z-[a-z]+\)$/.test(value) && !['auto', '0', '1', '2', '3', '4'].includes(value))
        .map((value) => `${name}: ${value}`),
    );
    // One surface is allowed above the toast column: the skip link, which a keyboard visitor has to
    // be able to reach even while a toast is on screen. Small numbers (0-4) are local stacking inside
    // a component - a hovered card lifting over its neighbour - and never escape their own context.
    expect(outsideScale, `stacking outside the scale: ${outsideScale.join(', ')}`).toEqual(['baseCss: 100']);

    // The notification popover and the account tray are portalled to the document root, so they sit
    // in the page's own stacking context: a hard-coded layer there would outrank toasts silently.
    const portal = modernCss.match(/\.nav-pop__panel\.nav-pop__portal\s*\{[^}]*\}/)?.[0] ?? '';
    expect(portal, 'the portal panels lost their layer').toContain('z-index: var(--z-menu)');
    expect(portal).not.toMatch(/z-index:\s*\d/);
  });

  it('keeps the navbar sticky with compact and mobile-hide states', () => {
    expect(appCss).toContain('top: var(--header-top)');
    expect(appCss).toContain('.navbar--compact');
    expect(appCss).toContain('.navbar--hidden');
  });
});

describe('Notification grouping and priority', () => {
  it('groups repeated events for the same order', () => {
    const groups = groupNotifications([
      notif({ id: 1, title: 'Order #18 confirmed', body: 'Order #18 confirmed' }),
      notif({ id: 2, title: 'Order #18 shipped', body: 'Order #18 shipped' }),
      notif({ id: 3, title: 'Order #18 delivered', body: 'Order #18 delivered' }),
    ]);
    const attention = groups.find((g) => g.key === 'attention')!;
    expect(attention.items).toHaveLength(1);
    expect(attention.items[0]!.title).toBe('3 updates on order #18');
  });

  it('sorts order/payment issues before delivery updates', () => {
    const groups = groupNotifications([
      notif({ id: 1, type: 'OrderStatusChanged', title: 'Shipped', body: 'x' }),
      notif({ id: 2, type: 'OrderCancelled', title: 'Cancelled', body: 'y' }),
    ]);
    const attention = groups.find((g) => g.key === 'attention')!;
    expect(attention.items[0]!.type).toBe('OrderCancelled');
  });

  it('splits Needs attention from Earlier', () => {
    const groups = groupNotifications([
      notif({ id: 1, isRead: false }),
      notif({ id: 2, isRead: true }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['attention', 'earlier']);
  });
});

describe('Toast stacking', () => {
  it('caps the stack at 3 in the provider source', () => {
    const ui = readFileSync(join(root, 'src', 'components', 'ui.tsx'), 'utf8');
    expect(ui).toContain('MAX_TOASTS = 3');
    expect(ui).toContain('aria-live="assertive"');
    expect(ui).toContain('aria-live="polite"');
    expect(ui).toContain('Undo');
  });
});
