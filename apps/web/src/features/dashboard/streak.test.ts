import { describe, expect, it } from 'vitest';
import { computeStreak, dailyLimitOf, shiftDayKey } from './streak';

const LIMIT = 100_000;
// 2026-11-20 12:00 in Vietnam
const NOW = new Date('2026-11-20T05:00:00Z');
const at = (day: string, amount: number) => ({ occurredAt: `${day}T05:00:00Z`, amount });

describe('saving streak', () => {
  it('is empty with no expenses: no streak, no best, no last day', () => {
    const r = computeStreak([], LIMIT, NOW);
    expect(r).toMatchObject({ current: 0, best: 0, lastDay: null });
    expect(r.days.every((d) => d.status === 'none')).toBe(true);
  });

  it('is empty when there is no daily limit', () => {
    expect(computeStreak([at('2026-11-19', 50_000)], 0, NOW).current).toBe(0);
  });

  it('counts back from today while each day is within the limit; days without spending count', () => {
    const r = computeStreak([at('2026-11-16', 80_000), at('2026-11-18', 20_000)], LIMIT, NOW);
    expect(r.current).toBe(5); // 16..20
    expect(r.lastDay).toBe('2026-11-20');
  });

  it('drops the current run to 0 when today is over, but keeps the best run', () => {
    const r = computeStreak([at('2026-11-16', 10_000), at('2026-11-20', 100_001)], LIMIT, NOW);
    expect(r.current).toBe(0);
    expect(r.best).toBe(4); // 16..19
    expect(r.lastDay).toBe('2026-11-19');
  });

  it('treats spending exactly at the limit as within (boundary)', () => {
    const r = computeStreak([at('2026-11-19', LIMIT), at('2026-11-20', LIMIT)], LIMIT, NOW);
    expect(r.current).toBe(2);
    expect(computeStreak([at('2026-11-19', LIMIT + 1)], LIMIT, NOW).current).toBe(1); // only today, since 19 is over
  });

  it('a gap (an over day) restarts the run; best is the longest earlier run', () => {
    const r = computeStreak([at('2026-11-10', 1), at('2026-11-15', 300_000)], LIMIT, NOW);
    expect(r.current).toBe(5); // 16..20
    expect(r.best).toBe(5);
    const r2 = computeStreak([at('2026-11-01', 1), at('2026-11-12', 300_000), at('2026-11-18', 300_000)], LIMIT, NOW);
    expect(r2.best).toBe(11); // 1..11
    expect(r2.current).toBe(2); // 19, 20
  });

  it('sums several expenses of one day against the limit', () => {
    const r = computeStreak([at('2026-11-19', 60_000), at('2026-11-19', 60_000), at('2026-11-18', 10_000)], LIMIT, NOW);
    expect(r.current).toBe(1); // 19 is over (120k), only today within
    expect(r.days.find((d) => d.day === '2026-11-19')).toMatchObject({ spent: 120_000, status: 'over' });
  });

  it('uses Vietnam days: 17:30 UTC on the 19th is already the 20th in Vietnam', () => {
    const r = computeStreak([{ occurredAt: '2026-11-19T17:30:00Z', amount: 150_000 }], LIMIT, NOW);
    expect(r.days.find((d) => d.day === '2026-11-20')?.spent).toBe(150_000);
    expect(r.days.find((d) => d.day === '2026-11-19')?.spent).toBe(0);
    expect(r.current).toBe(0);
  });

  it('moves "today" with the Vietnam clock: just after 17:00 UTC it is already tomorrow', () => {
    const late = new Date('2026-11-20T17:05:00Z'); // 21 Nov 00:05 in Vietnam
    const r = computeStreak([at('2026-11-20', 10_000)], LIMIT, late);
    expect(r.days[r.days.length - 1].day).toBe('2026-11-21');
    expect(r.current).toBe(2);
  });

  it('ignores expenses outside the window', () => {
    const r = computeStreak([at('2026-08-01', 500_000)], LIMIT, NOW, 30);
    expect(r.days).toHaveLength(30);
    expect(r.days.every((d) => d.status === 'none')).toBe(true);
  });
});

describe('helpers', () => {
  it('shiftDayKey crosses month and year ends', () => {
    expect(shiftDayKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDayKey('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('dailyLimitOf spreads the limit over the Vietnam days of the period', () => {
    // 1 Nov 00:00 VN to 1 Dec 00:00 VN = 30 days
    expect(dailyLimitOf(3_000_000, '2026-10-31T17:00:00Z', '2026-11-30T17:00:00Z')).toBe(100_000);
  });
});
