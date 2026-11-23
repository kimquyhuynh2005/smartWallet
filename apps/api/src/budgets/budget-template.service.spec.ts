import { UID, mockPrisma, user } from '../testing/mocks';
import { BudgetTemplateService } from './budget-template.service';

const SYS = [
  ['Housing', 1], ['Food & Drinks', 2], ['Transport', 3], ['Bills', 4], ['Shopping', 5], ['Entertainment', 6],
].map(([nameEn, n]) => ({ id: UID(n as number), nameEn }));
const id = (name: string) => SYS.find((c) => c.nameEn === name)!.id;

function setup(opts: { spend?: Record<string, bigint>; max?: number | null; existing?: any[] } = {}) {
  const prisma = mockPrisma(['category', 'budget']);
  prisma.category.findMany.mockResolvedValue(SYS);
  prisma.budget.findMany.mockResolvedValue(opts.existing ?? []);
  const budgets: any = {
    bounds: jest.fn(async () => ({ periodStart: new Date('2026-11-01T00:00:00Z'), startsAt: new Date('2026-10-31T17:00:00Z'), endsAt: new Date('2026-11-30T17:00:00Z'), label: '2026-11' })),
    spentMap: jest.fn(async () => new Map(Object.entries(opts.spend ?? {}))),
    childrenOf: jest.fn(async () => new Map()),
    spentFor: jest.fn((cat: string | null, m: Map<string, bigint>) => m.get(cat as string) ?? 0n),
    listForPeriod: jest.fn(async () => []),
  };
  const categories: any = { assertUsable: jest.fn() };
  const plans: any = { forUser: jest.fn(async () => ({ code: 'FREE', limits: { max_budgets: opts.max === undefined ? null : opts.max } })) };
  const cache: any = { bump: jest.fn() };
  return { svc: new BudgetTemplateService(prisma, budgets, categories, plans, cache), prisma, budgets, categories, cache };
}
const created = (prisma: any) => prisma.budget.create.mock.calls.map((c: any[]) => c[0].data);
const limitOf = (prisma: any, cat: string | null) => created(prisma).find((d: any) => d.categoryId === cat)?.limitAmount;

describe('BUD-02 apply 50/30/20', () => {
  it('a brand-new user gets an even split inside each group (no spending history)', async () => {
    const { svc, prisma } = setup();
    const out = await svc.apply(user, { template: '50_30_20', monthlyIncome: 10_000_000, overwrite: false });
    expect(limitOf(prisma, null)).toBe(8_000_000n); // total budget first
    for (const c of ['Housing', 'Food & Drinks', 'Transport', 'Bills']) expect(limitOf(prisma, id(c))).toBe(1_250_000n);
    for (const c of ['Shopping', 'Entertainment']) expect(limitOf(prisma, id(c))).toBe(1_500_000n);
    expect(out).toMatchObject({ template: '50_30_20', totalBudget: 8_000_000, reservedForSavings: 2_000_000, created: 7, updated: 0, skipped: 0, truncatedByPlan: 0 });
  });

  it('splits inside a group by the user\'s last 3 months of spending ratio', async () => {
    const { svc, prisma, budgets } = setup({ spend: { [id('Housing')]: 3_000_000n, [id('Food & Drinks')]: 1_000_000n, [id('Transport')]: 500_000n, [id('Bills')]: 500_000n } });
    await svc.apply(user, { template: '50_30_20', monthlyIncome: 10_000_000, overwrite: false });
    expect(limitOf(prisma, id('Housing'))).toBe(3_000_000n);
    expect(limitOf(prisma, id('Food & Drinks'))).toBe(1_000_000n);
    expect(limitOf(prisma, id('Transport'))).toBe(500_000n);
    expect(limitOf(prisma, id('Bills'))).toBe(500_000n);
    expect(limitOf(prisma, id('Shopping'))).toBe(1_500_000n); // wants: no history -> even
    // the history window is the 3 periods BEFORE the target period
    const [, from, to] = budgets.spentMap.mock.calls[0];
    expect(from).toEqual(new Date('2026-07-31T17:00:00Z'));
    expect(to).toEqual(new Date('2026-10-31T17:00:00Z'));
  });

  it('keeps existing budgets unless overwrite is set; overwrite only changes the limit', async () => {
    const existing = [{ id: UID(90), categoryId: id('Housing'), limitAmount: 1n, deletedAt: null }];
    const a = setup({ existing });
    const keep = await a.svc.apply(user, { template: '50_30_20', monthlyIncome: 10_000_000, overwrite: false });
    expect(keep).toMatchObject({ skipped: 1, updated: 0, created: 6 });
    expect(a.prisma.budget.update).not.toHaveBeenCalled();
    const b = setup({ existing });
    const over = await b.svc.apply(user, { template: '50_30_20', monthlyIncome: 10_000_000, overwrite: true });
    expect(over).toMatchObject({ updated: 1, created: 6 });
    expect(b.prisma.budget.update).toHaveBeenCalledWith({ where: { id: UID(90) }, data: { limitAmount: 1_250_000n } });
  });

  it('revives a soft-deleted budget instead of colliding with the unique index', async () => {
    const { svc, prisma } = setup({ existing: [{ id: UID(91), categoryId: id('Bills'), limitAmount: 5n, rolloverAmount: 7n, deletedAt: new Date() }] });
    const out = await svc.apply(user, { template: '50_30_20', monthlyIncome: 10_000_000, overwrite: false });
    expect(prisma.budget.update).toHaveBeenCalledWith({ where: { id: UID(91) }, data: { limitAmount: 1_250_000n, rolloverAmount: 0n, deletedAt: null } });
    expect(out.created).toBe(7);
  });

  it('respects the plan: the total budget and the biggest budgets are created first, the rest are counted as truncated', async () => {
    const { svc, prisma } = setup({ max: 5 });
    const out = await svc.apply(user, { template: '50_30_20', monthlyIncome: 10_000_000, overwrite: false });
    expect(out).toMatchObject({ created: 5, truncatedByPlan: 2 });
    expect(limitOf(prisma, null)).toBe(8_000_000n);
    expect(limitOf(prisma, id('Entertainment'))).toBe(1_500_000n); // 1.5M wants beat 1.25M needs
    expect(created(prisma).some((d: any) => d.categoryId === id('Bills'))).toBe(false);
  });

  it('runs in one DB transaction and drops the report cache', async () => {
    const { svc, prisma, cache } = setup();
    await svc.apply(user, { template: '6_JARS', monthlyIncome: 10_000_000, overwrite: false });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(cache.bump).toHaveBeenCalledWith('u1');
  });
});

describe('BUD-02 apply CUSTOM', () => {
  const groups = (g: any[]) => ({ template: 'CUSTOM' as const, monthlyIncome: 10_000_000, overwrite: false, groups: g });

  it('uses the user\'s own percentages and categories; a group without categories is savings', async () => {
    const { svc, prisma, categories } = setup();
    const out = await svc.apply(user, groups([{ name: 'core', percent: 60, categoryIds: [id('Housing'), id('Bills')] }, { name: 'save', percent: 40, categoryIds: [] }]));
    expect(categories.assertUsable).toHaveBeenCalledTimes(2);
    expect(categories.assertUsable).toHaveBeenCalledWith('u1', id('Housing'), 'EXPENSE');
    expect(limitOf(prisma, id('Housing'))).toBe(3_000_000n);
    expect(limitOf(prisma, id('Bills'))).toBe(3_000_000n);
    expect(limitOf(prisma, null)).toBe(6_000_000n);
    expect(out.reservedForSavings).toBe(4_000_000);
  });
  it('422 DUPLICATE_CATEGORY when a category is in two groups; nothing is written', async () => {
    const { svc, prisma } = setup();
    await expect(svc.apply(user, groups([{ name: 'a', percent: 50, categoryIds: [id('Housing')] }, { name: 'b', percent: 50, categoryIds: [id('Housing')] }]))).rejects.toMatchObject({ response: { code: 'DUPLICATE_CATEGORY' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('a category the user cannot use (404) or an income category (422) aborts before writing', async () => {
    const { svc, prisma, categories } = setup();
    categories.assertUsable.mockRejectedValue(Object.assign(new Error('nf'), { status: 404 }));
    await expect(svc.apply(user, groups([{ name: 'a', percent: 100, categoryIds: [UID(77)] }]))).rejects.toMatchObject({ status: 404 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
