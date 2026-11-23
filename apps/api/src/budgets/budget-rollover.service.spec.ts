import { UID, mockPrisma, user } from '../testing/mocks';
import { BudgetRolloverService } from './budget-rollover.service';

const FOOD = UID(2), BILLS = UID(4);
const budget = (over: Record<string, unknown> = {}) => ({
  id: UID(50), userId: 'u1', categoryId: FOOD, limitAmount: 2_000_000n, rolloverAmount: 0n, rolloverMode: 'CARRY_FORWARD', alertThresholds: [80, 100], deletedAt: null, ...over,
});

function setup(opts: { prev: any[]; target?: any[]; spent?: Record<string, bigint>; max?: number | null }) {
  const prisma = mockPrisma(['budget']);
  prisma.budget.findMany.mockImplementation(async ({ where }: any) => (where.period.getTime() === new Date('2026-10-01T00:00:00Z').getTime() ? opts.prev : opts.target ?? []));
  const budgets: any = {
    bounds: jest.fn(async () => ({ periodStart: new Date('2026-11-01T00:00:00Z'), startsAt: new Date('2026-10-31T17:00:00Z'), endsAt: new Date('2026-11-30T17:00:00Z'), label: '2026-11' })),
    spentMap: jest.fn(async () => new Map(Object.entries(opts.spent ?? {}))),
    childrenOf: jest.fn(async () => new Map()),
    spentFor: jest.fn((cat: string | null, m: Map<string, bigint>) => (cat === null ? [...m.values()].reduce((a, b) => a + b, 0n) : m.get(cat) ?? 0n)),
    listForPeriod: jest.fn(async () => []),
  };
  const plans: any = { forUser: jest.fn(async () => ({ code: 'FREE', limits: { max_budgets: opts.max === undefined ? null : opts.max } })) };
  const cache: any = { bump: jest.fn() };
  return { svc: new BudgetRolloverService(prisma, budgets, plans, cache), prisma, budgets, cache };
}
const made = (prisma: any) => prisma.budget.create.mock.calls.map((c: any[]) => c[0].data);

describe('BUD-03 rollover', () => {
  it('CARRY_FORWARD: the unspent part of last period is added to the new limit and remembered as rollover_amount', async () => {
    const { svc, prisma } = setup({ prev: [budget()], spent: { [FOOD]: 1_500_000n } });
    const out = await svc.rollover(user, {});
    expect(made(prisma)[0]).toMatchObject({ categoryId: FOOD, limitAmount: 2_500_000n, rolloverAmount: 500_000n, rolloverMode: 'CARRY_FORWARD', period: new Date('2026-11-01T00:00:00Z') });
    expect(out).toMatchObject({ period: '2026-11', from: '2026-10', created: 1, updated: 0, carriedOver: 500_000n });
  });
  it('never carries a negative amount: overspending carries 0', async () => {
    const { svc, prisma } = setup({ prev: [budget()], spent: { [FOOD]: 2_600_000n } });
    await svc.rollover(user, {});
    expect(made(prisma)[0]).toMatchObject({ limitAmount: 2_000_000n, rolloverAmount: 0n });
  });
  it('carried money is never carried twice: the base limit excludes last period\'s own carry-in', async () => {
    // last period: limit 2.5M = base 2.0M + 0.5M carried; spent 1.0M -> leftover 1.5M
    const { svc, prisma } = setup({ prev: [budget({ limitAmount: 2_500_000n, rolloverAmount: 500_000n })], spent: { [FOOD]: 1_000_000n } });
    await svc.rollover(user, {});
    expect(made(prisma)[0]).toMatchObject({ limitAmount: 2_000_000n + 1_500_000n, rolloverAmount: 1_500_000n });
  });
  it('NONE budgets are copied at their base limit, with no carry', async () => {
    const { svc, prisma } = setup({ prev: [budget({ rolloverMode: 'NONE', limitAmount: 700_000n, id: UID(51), categoryId: BILLS })], spent: { [BILLS]: 100n } });
    const out = await svc.rollover(user, {});
    expect(made(prisma)[0]).toMatchObject({ categoryId: BILLS, limitAmount: 700_000n, rolloverAmount: 0n, rolloverMode: 'NONE' });
    expect(out.carriedOver).toBe(0n);
  });
  it('the total budget (category null) rolls over from ALL spending', async () => {
    const { svc, prisma } = setup({ prev: [budget({ categoryId: null, limitAmount: 10_000_000n })], spent: { [FOOD]: 3_000_000n, [BILLS]: 2_000_000n } });
    await svc.rollover(user, {});
    expect(made(prisma)[0]).toMatchObject({ categoryId: null, limitAmount: 15_000_000n, rolloverAmount: 5_000_000n });
  });

  it('is idempotent: re-running updates the carried part only and keeps a manually edited base', async () => {
    const existing = budget({ id: UID(60), limitAmount: 3_000_000n, rolloverAmount: 500_000n, period: new Date('2026-11-01T00:00:00Z') }); // base was edited to 2.5M
    const { svc, prisma } = setup({ prev: [budget()], target: [existing], spent: { [FOOD]: 1_000_000n } }); // leftover now 1.0M
    const out = await svc.rollover(user, {});
    expect(prisma.budget.create).not.toHaveBeenCalled();
    expect(prisma.budget.update).toHaveBeenCalledWith({ where: { id: UID(60) }, data: { limitAmount: 2_500_000n + 1_000_000n, rolloverAmount: 1_000_000n } });
    expect(out).toMatchObject({ created: 0, updated: 1 });
  });
  it('an existing NONE budget in the target period is left alone', async () => {
    const { svc, prisma } = setup({ prev: [budget({ rolloverMode: 'NONE' })], target: [budget({ id: UID(61), rolloverMode: 'NONE' })] });
    expect(await svc.rollover(user, {})).toMatchObject({ skipped: 1, created: 0, updated: 0 });
    expect(prisma.budget.update).not.toHaveBeenCalled();
  });
  it('revives a soft-deleted target budget instead of colliding', async () => {
    const { svc, prisma } = setup({ prev: [budget()], target: [budget({ id: UID(62), deletedAt: new Date() })], spent: {} });
    await svc.rollover(user, {});
    expect(prisma.budget.update).toHaveBeenCalledWith({ where: { id: UID(62) }, data: expect.objectContaining({ limitAmount: 4_000_000n, deletedAt: null }) });
  });

  it('respects the plan limit: the total budget and the largest limits go first, the rest are skipped', async () => {
    const prev = [budget({ id: UID(1), categoryId: BILLS, limitAmount: 100_000n }), budget({ id: UID(2), categoryId: null, limitAmount: 9_000_000n }), budget({ id: UID(3), categoryId: FOOD, limitAmount: 2_000_000n })];
    const { svc, prisma } = setup({ prev, max: 2 });
    const out = await svc.rollover(user, {});
    expect(made(prisma).map((d: any) => d.categoryId)).toEqual([null, FOOD]);
    expect(out).toMatchObject({ created: 2, skippedForPlanLimit: 1 });
  });
  it('runs in one DB transaction, targets the period before as the source, and drops the report cache', async () => {
    const { svc, prisma, budgets, cache } = setup({ prev: [budget()] });
    await svc.rollover(user, { period: '2026-11' });
    expect(budgets.bounds).toHaveBeenCalledWith('u1', '2026-11');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(cache.bump).toHaveBeenCalledWith('u1');
  });
  it('nothing to roll over in an empty previous period', async () => {
    const { svc, prisma } = setup({ prev: [] });
    expect(await svc.rollover(user, {})).toMatchObject({ created: 0, updated: 0, skipped: 0, carriedOver: 0n });
    expect(prisma.budget.create).not.toHaveBeenCalled();
  });
});
