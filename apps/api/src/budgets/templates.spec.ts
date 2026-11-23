import { BUDGET_TEMPLATES } from '@smartwallet/shared';
import { planTemplate, splitByRatio } from './templates';

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

describe('BUD-02 splitByRatio', () => {
  it('splits in proportion to the weights and the parts add up to EXACTLY the total', () => {
    const r = splitByRatio(5_000_000, ['food', 'housing', 'transport'], { food: 600, housing: 300, transport: 100 });
    expect(r).toEqual({ food: 3_000_000, housing: 1_500_000, transport: 500_000 });
    expect(sum(r)).toBe(5_000_000);
  });
  it('every part is a whole multiple of 1,000 VND and the remainder goes to the largest fractions', () => {
    const r = splitByRatio(1_000_000, ['a', 'b', 'c'], { a: 1, b: 1, c: 1 }); // 333.33 -> 333,333.33...
    expect(Object.values(r).every((v) => v % 1000 === 0)).toBe(true);
    expect(sum(r)).toBe(1_000_000);
    expect(Object.values(r).sort()).toEqual([333_000, 333_000, 334_000]);
  });
  it('a new user (no history, all weights 0) gets an even split', () => {
    expect(splitByRatio(4_000_000, ['a', 'b', 'c', 'd'], {})).toEqual({ a: 1_000_000, b: 1_000_000, c: 1_000_000, d: 1_000_000 });
    expect(splitByRatio(4_000_000, ['a', 'b'], { a: 0, b: 0 })).toEqual({ a: 2_000_000, b: 2_000_000 });
  });
  it('a category with no spending next to categories that have some gets nothing', () => {
    expect(splitByRatio(3_000_000, ['a', 'b'], { a: 100, b: 0 })).toEqual({ a: 3_000_000, b: 0 });
  });
  it('is stable for the user\'s example: spending 700/200/100 of 10,000,000', () => {
    const r = splitByRatio(10_000_000, ['food', 'transport', 'bills'], { food: 700, transport: 200, bills: 100 });
    expect(r).toEqual({ food: 7_000_000, transport: 2_000_000, bills: 1_000_000 });
  });
  it('handles empty keys, zero/negative totals and negative weights', () => {
    expect(splitByRatio(1000, [], {})).toEqual({});
    expect(splitByRatio(0, ['a'], { a: 1 })).toEqual({ a: 0 });
    expect(splitByRatio(2000, ['a', 'b'], { a: -5, b: 1 })).toEqual({ a: 0, b: 2000 });
    expect(splitByRatio(500, ['a'], {})).toEqual({ a: 0 }); // less than one 1,000 unit
  });
  it('never loses money for awkward totals', () => {
    for (const total of [1_000, 7_000, 1_234_000, 99_999_000]) {
      const r = splitByRatio(total, ['a', 'b', 'c', 'd', 'e'], { a: 7, b: 3, c: 1, d: 11, e: 2 });
      expect(sum(r)).toBe(total);
    }
  });
});

describe('BUD-02 planTemplate', () => {
  const t50 = BUDGET_TEMPLATES['50_30_20'].map((g) => ({ percent: g.percent, keys: g.categories }));

  it('50/30/20 on 10,000,000: needs 5M and wants 3M are spent, 2M is reserved for savings (goals)', () => {
    const p = planTemplate(t50, 10_000_000);
    expect(p.total).toBe(8_000_000);
    expect(p.reservedForSavings).toBe(2_000_000);
    const by = Object.fromEntries(p.items.map((i) => [i.key, i.limit]));
    expect(by['Housing'] + by['Food & Drinks'] + by['Transport'] + by['Bills']).toBe(5_000_000);
    expect(by['Shopping'] + by['Entertainment']).toBe(3_000_000);
  });
  it('splits each group by the last 3 months of spending', () => {
    const p = planTemplate(t50, 10_000_000, { Housing: 3000, 'Food & Drinks': 1000, Transport: 500, Bills: 500, Shopping: 100, Entertainment: 300 });
    const by = Object.fromEntries(p.items.map((i) => [i.key, i.limit]));
    expect(by).toEqual({ Housing: 3_000_000, 'Food & Drinks': 1_000_000, Transport: 500_000, Bills: 500_000, Shopping: 750_000, Entertainment: 2_250_000 });
  });
  it('6 Jars: 55/10/10/10/10/5; the two savings jars (long-term, financial freedom) are reserved = 20%', () => {
    const jars = BUDGET_TEMPLATES['6_JARS'].map((g) => ({ percent: g.percent, keys: g.categories }));
    const p = planTemplate(jars, 20_000_000);
    expect(p.reservedForSavings).toBe(4_000_000); // 10% + 10%
    expect(p.total).toBe(16_000_000);
    const by = Object.fromEntries(p.items.map((i) => [i.key, i.limit]));
    expect(by['Education']).toBe(2_000_000);
    expect(by['Gifts']).toBe(1_000_000);
    expect(by['Entertainment'] + by['Shopping']).toBe(2_000_000);
    expect(['Housing', 'Food & Drinks', 'Transport', 'Bills', 'Health'].reduce((a, k) => a + by[k], 0)).toBe(11_000_000);
  });
  it('custom percentages: any grouping, empty group = savings', () => {
    const p = planTemplate([{ percent: 70, keys: ['x', 'y'] }, { percent: 30, keys: [] }], 3_000_000);
    expect(p).toEqual({ total: 2_100_000, reservedForSavings: 900_000, items: [{ key: 'x', limit: 1_050_000 }, { key: 'y', limit: 1_050_000 }] });
  });
  it('amounts are rounded down to 1,000 VND; tiny incomes produce no zero budgets', () => {
    for (const i of planTemplate(t50, 7_777_777).items) expect(i.limit % 1000).toBe(0);
    expect(planTemplate(t50, 900).items).toEqual([]);
  });
});
