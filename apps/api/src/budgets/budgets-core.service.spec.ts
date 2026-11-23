import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UID, mockPrisma, user } from '../testing/mocks';
import { BudgetsService } from './budgets.service';

const row = (over: Record<string, unknown> = {}) => ({
  id: UID(1), userId: 'u1', period: new Date('2026-11-01T00:00:00Z'), categoryId: UID(2), limitAmount: 2_000_000n, rolloverMode: 'NONE', rolloverAmount: 0n,
  alertThresholds: [80, 100], createdAt: new Date(), updatedAt: new Date(), deletedAt: null, ...over,
});

function setup(plan: 'FREE' | 'PREMIUM' = 'FREE', monthStartDay = 1) {
  const prisma = mockPrisma(['budget', 'category', 'transaction', 'user']);
  prisma.user.findUniqueOrThrow.mockResolvedValue({ monthStartDay });
  prisma.budget.create.mockImplementation(async ({ data }: any) => row(data));
  prisma.transaction.groupBy.mockResolvedValue([]);
  prisma.category.findMany.mockResolvedValue([]);
  const plans: any = { forUser: jest.fn(async () => ({ code: plan, limits: {} })) };
  const cache: any = { bump: jest.fn() };
  return { svc: new BudgetsService(prisma, plans, cache), prisma, cache };
}

describe('BudgetsService', () => {
  it('respects month_start_day: with day 5, YYYY-MM is the period starting on the 5th (5 Nov .. 4 Dec Vietnam time)', async () => {
    const { svc } = setup('FREE', 5);
    const b = await svc.bounds('u1', '2026-11');
    expect(b.periodStart.toISOString()).toBe('2026-11-05T00:00:00.000Z');
    expect(b.startsAt.toISOString()).toBe('2026-11-04T17:00:00.000Z');
    expect(b.endsAt.toISOString()).toBe('2026-12-04T17:00:00.000Z');
    expect(b.label).toBe('2026-11');
  });

  it('spentFor: a category budget includes its sub-categories; the total budget includes everything (incl. uncategorised)', () => {
    const { svc } = setup();
    const spent = new Map<string | null, bigint>([[UID(2), 100n], [UID(3), 50n], [UID(9), 7n], [null, 5n]]);
    const children = new Map([[UID(2), [UID(3)]]]);
    expect(svc.spentFor(UID(2), spent, children)).toBe(150n);
    expect(svc.spentFor(UID(9), spent, children)).toBe(7n);
    expect(svc.spentFor(null, spent, children)).toBe(162n);
  });

  it('spentMap aggregates EXPENSE only (transfers and income never count) inside the period', async () => {
    const { svc, prisma } = setup();
    prisma.transaction.groupBy.mockResolvedValue([{ categoryId: UID(2), _sum: { amount: 10n } }, { categoryId: null, _sum: { amount: null } }]);
    const m = await svc.spentMap('u1', new Date('2026-10-31T17:00:00Z'), new Date('2026-11-30T17:00:00Z'));
    expect(m.get(UID(2))).toBe(10n);
    expect(m.get(null)).toBe(0n);
    const where = prisma.transaction.groupBy.mock.calls[0][0].where;
    expect(where).toMatchObject({ userId: 'u1', type: 'EXPENSE', deletedAt: null, occurredAt: { gte: new Date('2026-10-31T17:00:00Z'), lt: new Date('2026-11-30T17:00:00Z') } });
  });

  it('views computes progress for all budgets with ONE spend query', async () => {
    const { svc, prisma } = setup();
    prisma.transaction.groupBy.mockResolvedValue([{ categoryId: UID(2), _sum: { amount: 1_500_000n } }]);
    const b = { periodStart: new Date('2026-11-01T00:00:00Z'), startsAt: new Date('2026-10-31T17:00:00Z'), endsAt: new Date('2026-11-30T17:00:00Z'), label: '2026-11' };
    const out = await svc.views('u1', [row(), row({ id: UID(5), categoryId: null })] as any, b, new Date('2026-11-21T03:00:00Z'));
    expect(prisma.transaction.groupBy).toHaveBeenCalledTimes(1);
    expect(out[0]).toMatchObject({ period: '2026-11', spent: 1_500_000n, percentUsed: 75, remaining: 500_000n, safeToSpendToday: 50_000n, daysLeft: 10 });
    expect(out[1].spent).toBe(1_500_000n); // total budget
  });

  it('create: 409 BUDGET_EXISTS for a duplicate, revives a soft-deleted row, validates the category, drops the report cache', async () => {
    const a = setup();
    a.prisma.category.findFirst.mockResolvedValue({ id: UID(2) });
    a.prisma.budget.findFirst.mockResolvedValue(row());
    await expect(a.svc.create(user, { categoryId: UID(2), limitAmount: 1 })).rejects.toBeInstanceOf(ConflictException);
    a.prisma.budget.findFirst.mockResolvedValue(row({ deletedAt: new Date() }));
    a.prisma.budget.update.mockResolvedValue(row());
    await a.svc.create(user, { categoryId: UID(2), limitAmount: 1_000 });
    expect(a.prisma.budget.update).toHaveBeenCalledWith({ where: { id: UID(1) }, data: expect.objectContaining({ limitAmount: 1000n, deletedAt: null }) });
    expect(a.cache.bump).toHaveBeenCalledWith('u1');
    const b = setup();
    b.prisma.category.findFirst.mockResolvedValue(null);
    await expect(b.svc.create(user, { categoryId: UID(2), limitAmount: 1 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create: a total budget needs no category lookup; the period comes from the request', async () => {
    const { svc, prisma } = setup();
    prisma.budget.findFirst.mockResolvedValue(null);
    await svc.create(user, { categoryId: null, limitAmount: 5_000_000, period: '2026-12' });
    expect(prisma.category.findFirst).not.toHaveBeenCalled();
    expect(prisma.budget.create.mock.calls[0][0].data).toMatchObject({ categoryId: null, period: new Date('2026-12-01T00:00:00Z') });
  });

  it('custom alert thresholds are Premium only (create and update)', async () => {
    const free = setup('FREE');
    free.prisma.budget.findFirst.mockResolvedValue(null);
    await expect(free.svc.create(user, { categoryId: null, limitAmount: 1, alertThresholds: [50] })).rejects.toBeInstanceOf(ForbiddenException);
    free.prisma.budget.findFirst.mockResolvedValue(row());
    await expect(free.svc.update(user, UID(1), { alertThresholds: [50] })).rejects.toMatchObject({ response: { code: 'PLAN_LIMIT_REACHED' } });
    const prem = setup('PREMIUM');
    prem.prisma.budget.findFirst.mockResolvedValue(null);
    await prem.svc.create(user, { categoryId: null, limitAmount: 1, alertThresholds: [50, 90] });
    expect(prem.prisma.budget.create.mock.calls[0][0].data.alertThresholds).toEqual([50, 90]);
  });

  it('update changes limit and rollover mode for the owner only (404 otherwise) and returns progress', async () => {
    const { svc, prisma } = setup();
    prisma.budget.findFirst.mockResolvedValue(null);
    await expect(svc.update(user, UID(1), { limitAmount: 5 })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.budget.findFirst).toHaveBeenCalledWith({ where: { id: UID(1), userId: 'u1', deletedAt: null } });
    prisma.budget.findFirst.mockResolvedValue(row());
    prisma.budget.update.mockResolvedValue(row({ limitAmount: 3_000_000n, rolloverMode: 'CARRY_FORWARD' }));
    const out = await svc.update(user, UID(1), { limitAmount: 3_000_000, rolloverMode: 'CARRY_FORWARD' });
    expect(prisma.budget.update.mock.calls[0][0].data).toEqual({ limitAmount: 3_000_000n, rolloverMode: 'CARRY_FORWARD' });
    expect(out).toMatchObject({ limitAmount: 3_000_000n, rolloverMode: 'CARRY_FORWARD', period: '2026-11' });
  });

  it('remove is a soft delete of the owner budget', async () => {
    const { svc, prisma } = setup();
    prisma.budget.findFirst.mockResolvedValue(row());
    await svc.remove(user, UID(1));
    expect(prisma.budget.update).toHaveBeenCalledWith({ where: { id: UID(1) }, data: { deletedAt: expect.any(Date) } });
    prisma.budget.findFirst.mockResolvedValue(null);
    await expect(svc.remove(user, UID(1))).rejects.toBeInstanceOf(NotFoundException);
  });
});
