import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultReportRange, toDateInput } from '../lib/helpers';

/**
 * The sales report takes calendar dates, and they must be read in the viewer's time zone. These
 * tests pin the behaviour that a UTC-sliced ISO string got wrong for anyone east of UTC.
 */
describe('date helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats a Date as the local calendar date, not the UTC one', () => {
    // 2026-10-14 01:51 in Asia/Dhaka is still 2026-10-13 in UTC. The report must show the 14th.
    const justAfterLocalMidnight = new Date(2026, 9, 14, 1, 51);

    expect(justAfterLocalMidnight.toISOString().slice(0, 10)).toBe('2026-10-13');
    expect(toDateInput(justAfterLocalMidnight)).toBe('2026-10-14');
  });

  it('pads single-digit months and days', () => {
    expect(toDateInput(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('defaults the range to the last 30 days ending today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 14, 9, 0));

    const range = defaultReportRange();

    // 30 days inclusive of today: 2026-09-15 .. 2026-10-14.
    expect(range.to).toBe('2026-10-14');
    expect(range.from).toBe('2026-09-15');
  });
});
