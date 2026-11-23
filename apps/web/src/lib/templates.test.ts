import { describe, expect, it } from 'vitest';
import { fitToPlan, groupsOf, planTemplate, splitEvenly } from './templates';

describe('template preview maths (port of the API planTemplate)', () => {
  it('splits in whole thousands and the parts add up exactly', () => {
    const parts = splitEvenly(7_500_000, ['a', 'b', 'c', 'd']);
    expect(Object.values(parts).reduce((x, y) => x + y, 0)).toBe(7_500_000);
    expect(Object.values(parts).every((v) => v % 1000 === 0)).toBe(true);
  });
  it('50/30/20 on 15,000,000: needs 7.5M over 4 categories, wants 4.5M over 2, 3M reserved', () => {
    const p = planTemplate(groupsOf('50_30_20'), 15_000_000);
    expect(p.total).toBe(12_000_000);
    expect(p.reserved).toBe(3_000_000);
    expect(p.groups[0].rows.map((r) => r.limit)).toEqual([1_875_000, 1_875_000, 1_875_000, 1_875_000]);
    expect(p.groups[1].rows.map((r) => r.limit)).toEqual([2_250_000, 2_250_000]);
  });
  it('6 jars sums to 95% as spending (savings jars are reserved) and 5% is "give"', () => {
    const p = planTemplate(groupsOf('6_JARS'), 10_000_000);
    expect(p.reserved).toBe(2_000_000);
    expect(p.total).toBe(8_000_000);
  });
  it('a remainder goes to the first categories, never lost', () => {
    const p = planTemplate(groupsOf('50_30_20'), 10_001_000);
    const sum = p.groups.flatMap((g) => g.rows).reduce((a, r) => a + r.limit, 0);
    expect(sum).toBe(p.total);
  });
  it('Free plan keeps the total + the 4 biggest category budgets', () => {
    const rows = planTemplate(groupsOf('50_30_20'), 15_000_000).groups.flatMap((g) => g.rows);
    const { kept, cut } = fitToPlan(rows, 5);
    expect(kept).toHaveLength(4);
    expect(cut).toBe(2);
    expect(kept.every((r) => r.limit >= 1_875_000)).toBe(true);
    expect(fitToPlan(rows, null).kept).toHaveLength(6);
  });
});
