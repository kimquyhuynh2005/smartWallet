import { nextRunAfter } from './schedule';

const d = (s: string) => new Date(s);

describe('TXN-05 nextRunAfter', () => {
  it('daily and weekly add whole days (interval aware)', () => {
    expect(nextRunAfter(d('2026-11-21T05:00:00Z'), 'DAILY', 1).toISOString()).toBe('2026-11-22T05:00:00.000Z');
    expect(nextRunAfter(d('2026-11-21T05:00:00Z'), 'DAILY', 3).toISOString()).toBe('2026-11-24T05:00:00.000Z');
    expect(nextRunAfter(d('2026-11-21T05:00:00Z'), 'WEEKLY', 2).toISOString()).toBe('2026-12-05T05:00:00.000Z');
  });
  it('monthly keeps the Vietnam time of day and rolls over the year', () => {
    expect(nextRunAfter(d('2026-12-05T05:00:00Z'), 'MONTHLY', 1).toISOString()).toBe('2027-01-05T05:00:00.000Z');
    expect(nextRunAfter(d('2026-01-05T05:00:00Z'), 'MONTHLY', 12).toISOString()).toBe('2027-01-05T05:00:00.000Z');
  });
  it('monthly clamps to the end of a shorter month', () => {
    expect(nextRunAfter(d('2026-01-31T05:00:00Z'), 'MONTHLY', 1).toISOString()).toBe('2026-02-28T05:00:00.000Z');
    expect(nextRunAfter(d('2028-01-31T05:00:00Z'), 'MONTHLY', 1).toISOString()).toBe('2028-02-29T05:00:00.000Z'); // leap year
  });
  it('uses the Vietnam calendar day: 00:30 VN on the 1st (17:30Z on the 31st) stays on the 1st next month', () => {
    expect(nextRunAfter(d('2026-10-31T17:30:00Z'), 'MONTHLY', 1).toISOString()).toBe('2026-11-30T17:30:00.000Z');
  });
});
