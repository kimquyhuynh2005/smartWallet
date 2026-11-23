import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { UID, mockPrisma, user } from '../testing/mocks';
import { GoalsService, requiredMonthlySaving, statusFor } from './goals.service';

const NOW = new Date('2026-11-21T00:00:00Z');
const goal = (over: Record<string, unknown> = {}) => ({
  id: UID(1), userId: 'u1', name: 'Laptop', targetAmount: 20_000_000n, savedAmount: 5_000_000n, deadline: null, walletId: null, status: 'ACTIVE',
  createdAt: NOW, updatedAt: NOW, deletedAt: null, ...over,
});

describe('GOAL-02 requiredMonthlySaving', () => {
  it('splits what is left over the months to the deadline, rounding up', () => {
    // 15,000,000 left, ~6 months
    expect(requiredMonthlySaving(15_000_000n, new Date('2027-05-21T00:00:00Z'), NOW)).toBe(2_500_000n);
    expect(requiredMonthlySaving(10n, new Date('2027-05-21T00:00:00Z'), NOW)).toBe(2n); // ceil(10/6)
  });
  it('is null without a deadline, 0 when achieved, everything when overdue, at least 1 month otherwise', () => {
    expect(requiredMonthlySaving(100n, null, NOW)).toBeNull();
    expect(requiredMonthlySaving(0n, new Date('2027-01-01'), NOW)).toBe(0n);
    expect(requiredMonthlySaving(-5n, null, NOW)).toBe(0n);
    expect(requiredMonthlySaving(900n, new Date('2026-11-01'), NOW)).toBe(900n);
    expect(requiredMonthlySaving(900n, new Date('2026-11-25'), NOW)).toBe(900n); // < 1 month counts as 1 month
  });
  it('statusFor flips at the target', () => {
    expect(statusFor(99n, 100n)).toBe('ACTIVE');
    expect(statusFor(100n, 100n)).toBe('ACHIEVED');
  });
});

function setup() {
  const prisma = mockPrisma(['goal', 'goalContribution']);
  const wallets: any = { getOwned: jest.fn() };
  const plans: any = { forUser: jest.fn(async () => ({ code: 'FREE', limits: { max_goals: 2 } })) };
  const usage: any = { count: jest.fn(async () => 0) };
  const events: any = { publish: jest.fn() };
  const cache: any = { bump: jest.fn() };
  return { svc: new GoalsService(prisma, wallets, plans, usage, events, cache), prisma, wallets, plans, usage, events, cache };
}

describe('GOAL-01 present / create', () => {
  it('presents progress: percent, remaining (never negative) and required monthly saving; hides user_id', () => {
    const { svc } = setup();
    const out: any = svc.present(goal({ deadline: new Date('2027-05-21T00:00:00Z') }) as any, NOW);
    expect(out).toMatchObject({ percent: 25, remainingAmount: 15_000_000n, requiredMonthlySaving: 2_500_000n });
    expect(out).not.toHaveProperty('userId');
    expect((svc.present(goal({ savedAmount: 25_000_000n, status: 'ACHIEVED' }) as any) as any).remainingAmount).toBe(0n);
    expect((svc.present(goal({ status: 'CANCELED' }) as any) as any).requiredMonthlySaving).toBeNull();
  });
  it('create validates the linked wallet belongs to the user', async () => {
    const { svc, wallets, prisma } = setup();
    wallets.getOwned.mockRejectedValue(new NotFoundException());
    await expect(svc.create(user, { name: 'x', targetAmount: 1, walletId: UID(7) })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.goal.create).not.toHaveBeenCalled();
  });
});

describe('GOAL-02 contributions', () => {
  it('adds the contribution and bumps saved_amount in ONE db transaction, then publishes the event', async () => {
    const { svc, prisma, events } = setup();
    prisma.goal.findFirst.mockResolvedValue(goal());
    prisma.goal.updateMany.mockResolvedValue({ count: 1 });
    prisma.goal.findUniqueOrThrow.mockResolvedValue(goal({ savedAmount: 7_000_000n }));
    prisma.goalContribution.create.mockResolvedValue({ id: UID(50), goalId: UID(1), amount: 2_000_000n, occurredAt: NOW, note: null, createdAt: NOW });
    const out = await svc.contribute(user, UID(1), { amount: 2_000_000 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.goal.updateMany).toHaveBeenCalledWith({ where: { id: UID(1), userId: 'u1', deletedAt: null }, data: { savedAmount: { increment: 2_000_000n } } });
    expect(out.goal.savedAmount).toBe(7_000_000n);
    expect(events.publish).toHaveBeenCalledWith('goal.contribution.changed', { userId: 'u1', goalId: UID(1), amount: 2_000_000, savedAmount: 7_000_000, status: 'ACTIVE' });
  });

  it('flips the goal to ACHIEVED when saved reaches the target', async () => {
    const { svc, prisma } = setup();
    prisma.goal.findFirst.mockResolvedValue(goal());
    prisma.goal.updateMany.mockResolvedValue({ count: 1 });
    prisma.goal.findUniqueOrThrow.mockResolvedValue(goal({ savedAmount: 20_000_000n }));
    prisma.goal.update.mockResolvedValue(goal({ savedAmount: 20_000_000n, status: 'ACHIEVED' }));
    prisma.goalContribution.create.mockResolvedValue({ id: UID(50), goalId: UID(1), amount: 15_000_000n, occurredAt: NOW, note: null, createdAt: NOW });
    const out = await svc.contribute(user, UID(1), { amount: 15_000_000 });
    expect(prisma.goal.update).toHaveBeenCalledWith({ where: { id: UID(1) }, data: { status: 'ACHIEVED' } });
    expect(out.goal.status).toBe('ACHIEVED');
  });

  it('a withdrawal carries the balance guard inside the UPDATE, and 0 rows updated means INSUFFICIENT_GOAL_BALANCE', async () => {
    const { svc, prisma, events } = setup();
    prisma.goal.findFirst.mockResolvedValue(goal());
    prisma.goal.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.contribute(user, UID(1), { amount: -9_000_000 })).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.goal.updateMany.mock.calls[0][0].where.savedAmount).toEqual({ gte: 9_000_000n });
    expect(prisma.goalContribution.create).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('canceled goals reject contributions (409); unknown goals are 404', async () => {
    const { svc, prisma } = setup();
    prisma.goal.findFirst.mockResolvedValue(goal({ status: 'CANCELED' }));
    await expect(svc.contribute(user, UID(1), { amount: 1 })).rejects.toBeInstanceOf(ConflictException);
    prisma.goal.findFirst.mockResolvedValue(null);
    await expect(svc.contribute(user, UID(1), { amount: 1 })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('goal update / delete', () => {
  it('re-activating a canceled goal takes a slot and is blocked at the plan limit', async () => {
    const { svc, prisma, usage } = setup();
    prisma.goal.findFirst.mockResolvedValue(goal({ status: 'CANCELED' }));
    usage.count.mockResolvedValue(2);
    await expect(svc.update(user, UID(1), { status: 'ACTIVE' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.goal.update).not.toHaveBeenCalled();
  });
  it('raising the target above saved turns ACHIEVED back to ACTIVE; ACHIEVED is never set by hand', async () => {
    const { svc, prisma } = setup();
    prisma.goal.findFirst.mockResolvedValue(goal({ status: 'ACHIEVED', savedAmount: 20_000_000n }));
    prisma.goal.update.mockImplementation(async ({ data }: any) => goal({ status: data.status }));
    await svc.update(user, UID(1), { targetAmount: 30_000_000 });
    expect(prisma.goal.update.mock.calls[0][0].data.status).toBe('ACTIVE');
  });
  it('delete soft-deletes the goal and its contributions together', async () => {
    const { svc, prisma } = setup();
    prisma.goal.findFirst.mockResolvedValue(goal());
    await svc.remove(user, UID(1));
    expect(prisma.goalContribution.updateMany).toHaveBeenCalledWith({ where: { goalId: UID(1), deletedAt: null }, data: { deletedAt: expect.any(Date) } });
    expect(prisma.goal.update).toHaveBeenCalledWith({ where: { id: UID(1) }, data: { deletedAt: expect.any(Date) } });
  });
});
