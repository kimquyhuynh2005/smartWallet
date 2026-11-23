import { buildTemplateBudgets } from './onboarding';

describe('USER-02 / BUD-02 template maths', () => {
  it('50/30/20 on 10,000,000 VND: needs 50% over 4 categories, wants 30% over 2, savings 20% is not budgeted', () => {
    const t = buildTemplateBudgets('50_30_20', 10_000_000);
    expect(t.total).toBe(8_000_000);
    for (const c of ['Housing', 'Food & Drinks', 'Transport', 'Bills']) expect(t.items.find((i) => i.categoryNameEn === c)!.limit).toBe(1_250_000); // 5M / 4
    for (const c of ['Shopping', 'Entertainment']) expect(t.items.find((i) => i.categoryNameEn === c)!.limit).toBe(1_500_000); // 3M / 2
    expect(t.items).toHaveLength(6);
  });
  it('6 jars leaves the two savings jars un-budgeted (total 80%)', () => {
    expect(buildTemplateBudgets('6_JARS', 10_000_000).total).toBe(8_000_000);
  });
  it('NONE creates nothing; every amount is an integer multiple of 1,000', () => {
    expect(buildTemplateBudgets('NONE', 5_000_000)).toEqual({ total: 0, items: [] });
    for (const i of buildTemplateBudgets('6_JARS', 7_777_777).items) expect(i.limit % 1000).toBe(0);
  });
});
