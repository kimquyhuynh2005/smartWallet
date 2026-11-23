import { computeProgress } from './budgets.service';

const day = (s: string) => new Date(s);

describe('BUD-04 computeProgress', () => {
  const startsAt = day('2026-10-31T17:00:00Z'); // 1 Nov 00:00 Vietnam
  const endsAt = day('2026-11-30T17:00:00Z'); // 1 Dec 00:00 Vietnam

  it('percentUsed = spent / limit * 100 and safeToSpendToday = (limit - spent) / daysLeft', () => {
    const p = computeProgress(5_000_000n, 2_000_000n, day('2026-11-21T03:00:00Z'), startsAt, endsAt); // 21 Nov 10:00 VN
    expect(p.percentUsed).toBe(40);
    expect(p.remaining).toBe(3_000_000n);
    expect(p.daysLeft).toBe(10); // 21..30 Nov, today counts
    expect(p.safeToSpendToday).toBe(300_000n);
  });
  it('percentUsed keeps two decimals and may exceed 100', () => {
    expect(computeProgress(3n, 1n, day('2026-11-05T00:00:00Z'), startsAt, endsAt).percentUsed).toBe(33.33);
    expect(computeProgress(1_000_000n, 1_200_000n, day('2026-11-05T00:00:00Z'), startsAt, endsAt).percentUsed).toBe(120);
  });
  it('safeToSpendToday never goes negative and is floored to whole VND', () => {
    expect(computeProgress(1_000_000n, 1_200_000n, day('2026-11-21T03:00:00Z'), startsAt, endsAt).safeToSpendToday).toBe(0n);
    expect(computeProgress(1_000n, 0n, day('2026-11-21T03:00:00Z'), startsAt, endsAt).safeToSpendToday).toBe(100n);
    expect(computeProgress(1_001n, 0n, day('2026-11-21T03:00:00Z'), startsAt, endsAt).safeToSpendToday).toBe(100n);
  });
  it('the last day of the period still has 1 day left', () => {
    expect(computeProgress(900n, 0n, day('2026-11-30T10:00:00Z'), startsAt, endsAt).daysLeft).toBe(1);
  });
  it('a finished period has 0 days left and nothing is safe to spend', () => {
    const p = computeProgress(5_000_000n, 100n, day('2026-12-02T00:00:00Z'), startsAt, endsAt);
    expect(p.daysLeft).toBe(0);
    expect(p.safeToSpendToday).toBe(0n);
  });
  it('a future period counts all its days (so you can plan ahead)', () => {
    const p = computeProgress(3_000_000n, 0n, day('2026-10-01T00:00:00Z'), startsAt, endsAt);
    expect(p.daysLeft).toBe(30);
    expect(p.safeToSpendToday).toBe(100_000n);
  });
  it('a zero limit is 0% (no division by zero)', () => {
    expect(computeProgress(0n, 5n, day('2026-11-05T00:00:00Z'), startsAt, endsAt).percentUsed).toBe(0);
  });
});
