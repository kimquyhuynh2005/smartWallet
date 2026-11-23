import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UID, mockPrisma, user } from '../testing/mocks';
import { MAX_CATCH_UP, RecurringService } from './recurring.service';

const NOW = new Date('2026-11-21T05:00:00Z');
const rule = (over: Record<string, unknown> = {}) => ({
  id: UID(1), userId: 'u1', walletId: UID(2), categoryId: null, type: 'EXPENSE', amount: 3_000_000n, note: 'Rent', frequency: 'MONTHLY', interval: 1,
  nextRunAt: new Date('2026-11-05T05:00:00Z'), endAt: null, createdAt: NOW, updatedAt: NOW, deletedAt: null, ...over,
});

function setup() {
  const prisma = mockPrisma(['recurringRule', 'transaction', 'wallet', 'category']);
  prisma.transaction.create.mockImplementation(async ({ data }: any) => ({ id: UID(900 + prisma.transaction.create.mock.calls.length), transferWalletId: null, ...data }));
  prisma.wallet.findFirst.mockResolvedValue({ id: UID(2), isArchived: false });
  const wallets: any = { getUsable: jest.fn(async () => ({})), invalidate: jest.fn() };
  const categories: any = { assertUsable: jest.fn() };
  const events: any = { publish: jest.fn() };
  return { svc: new RecurringService(prisma, wallets, categories, events), prisma, wallets, categories, events };
}
/** queue the two raw queries: 1) due list, 2) per-rule lock */
function due(prisma: any, ids: string[], lockedPerRule: boolean[] = ids.map(() => true)) {
  prisma.$queryRaw.mockResolvedValueOnce(ids.map((id) => ({ id })));
  lockedPerRule.forEach((l) => prisma.$queryRaw.mockResolvedValueOnce(l ? [{ id: 'x' }] : []));
}

describe('TXN-05 generateDue', () => {
  it('posts the due occurrence as a RECURRING transaction and advances next_run_at, atomically', async () => {
    const { svc, prisma, events, wallets } = setup();
    due(prisma, [UID(1)]);
    prisma.recurringRule.findUniqueOrThrow.mockResolvedValue(rule());
    const out = await svc.generateDue(NOW);
    expect(out).toEqual({ rules: 1, transactions: 1 });
    expect(prisma.transaction.create.mock.calls[0][0].data).toMatchObject({ source: 'RECURRING', recurringRuleId: UID(1), amount: 3_000_000n, userId: 'u1', occurredAt: new Date('2026-11-05T05:00:00Z') });
    expect(prisma.recurringRule.update).toHaveBeenCalledWith({ where: { id: UID(1) }, data: { nextRunAt: new Date('2026-12-05T05:00:00Z') } });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(wallets.invalidate).toHaveBeenCalledWith(UID(2));
    expect(events.publish).toHaveBeenCalledWith('transaction.changed', expect.objectContaining({ userId: 'u1', action: 'generated', previous: [], current: [expect.objectContaining({ type: 'EXPENSE', amount: 3_000_000 })] }));
  });

  it('catches up every missed occurrence after downtime (daily rule, 3 days behind)', async () => {
    const { svc, prisma } = setup();
    due(prisma, [UID(1)]);
    prisma.recurringRule.findUniqueOrThrow.mockResolvedValue(rule({ frequency: 'DAILY', amount: 10_000n, nextRunAt: new Date('2026-11-18T05:00:00Z') }));
    const out = await svc.generateDue(NOW);
    expect(out.transactions).toBe(4); // 18, 19, 20, 21 Nov
    expect(prisma.recurringRule.update.mock.calls[0][0].data.nextRunAt).toEqual(new Date('2026-11-22T05:00:00Z'));
  });

  it('never posts after end_at', async () => {
    const { svc, prisma } = setup();
    due(prisma, [UID(1)]);
    prisma.recurringRule.findUniqueOrThrow.mockResolvedValue(rule({ frequency: 'DAILY', nextRunAt: new Date('2026-11-18T05:00:00Z'), endAt: new Date('2026-11-19T06:00:00Z') }));
    expect((await svc.generateDue(NOW)).transactions).toBe(2); // 18, 19
  });

  it('caps one run at MAX_CATCH_UP occurrences per rule (the rest follow on the next run)', async () => {
    const { svc, prisma } = setup();
    due(prisma, [UID(1)]);
    prisma.recurringRule.findUniqueOrThrow.mockResolvedValue(rule({ frequency: 'DAILY', nextRunAt: new Date('2024-01-01T05:00:00Z') }));
    expect((await svc.generateDue(NOW)).transactions).toBe(MAX_CATCH_UP);
  });

  it('is idempotent across workers: a rule locked by another worker (SKIP LOCKED) produces nothing', async () => {
    const { svc, prisma, events } = setup();
    due(prisma, [UID(1)], [false]);
    expect(await svc.generateDue(NOW)).toEqual({ rules: 1, transactions: 0 });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('skips rules whose wallet is archived or gone, without advancing them', async () => {
    const { svc, prisma } = setup();
    due(prisma, [UID(1)]);
    prisma.recurringRule.findUniqueOrThrow.mockResolvedValue(rule());
    prisma.wallet.findFirst.mockResolvedValue({ id: UID(2), isArchived: true });
    expect((await svc.generateDue(NOW)).transactions).toBe(0);
    expect(prisma.recurringRule.update).not.toHaveBeenCalled();
  });

  it('one failing rule does not block the others', async () => {
    const { svc, prisma } = setup();
    due(prisma, [UID(1), UID(3)]);
    prisma.recurringRule.findUniqueOrThrow.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(rule({ id: UID(3) }));
    expect((await svc.generateDue(NOW)).transactions).toBe(1);
  });

  it('drops a deleted category instead of failing the occurrence', async () => {
    const { svc, prisma } = setup();
    due(prisma, [UID(1)]);
    prisma.recurringRule.findUniqueOrThrow.mockResolvedValue(rule({ categoryId: UID(5) }));
    prisma.category.findFirst.mockResolvedValue(null);
    await svc.generateDue(NOW);
    expect(prisma.transaction.create.mock.calls[0][0].data.categoryId).toBeNull();
  });
});

describe('recurring rule CRUD', () => {
  it('create validates wallet and category type, stores BigInt amount', async () => {
    const { svc, prisma, wallets, categories } = setup();
    prisma.recurringRule.create.mockImplementation(async ({ data }: any) => rule(data));
    await svc.create(user, { walletId: UID(2), categoryId: UID(5), type: 'EXPENSE', amount: 1000, frequency: 'WEEKLY', interval: 2, nextRunAt: '2026-12-01T00:00:00.000Z' });
    expect(wallets.getUsable).toHaveBeenCalledWith(user, UID(2));
    expect(categories.assertUsable).toHaveBeenCalledWith('u1', UID(5), 'EXPENSE');
    expect(prisma.recurringRule.create.mock.calls[0][0].data).toMatchObject({ userId: 'u1', amount: 1000n, interval: 2 });
  });
  it('update / remove are 404 for foreign rules and reject endAt <= nextRunAt', async () => {
    const { svc, prisma } = setup();
    prisma.recurringRule.findFirst.mockResolvedValue(null);
    await expect(svc.update(user, UID(1), { amount: 1 })).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.remove(user, UID(1))).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.recurringRule.findFirst).toHaveBeenCalledWith({ where: { id: UID(1), userId: 'u1', deletedAt: null } });
    prisma.recurringRule.findFirst.mockResolvedValue(rule());
    await expect(svc.update(user, UID(1), { endAt: '2026-01-01T00:00:00.000Z' })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('delete only stops future runs (soft delete the rule, keep generated transactions)', async () => {
    const { svc, prisma } = setup();
    prisma.recurringRule.findFirst.mockResolvedValue(rule());
    await svc.remove(user, UID(1));
    expect(prisma.recurringRule.update).toHaveBeenCalledWith({ where: { id: UID(1) }, data: { deletedAt: expect.any(Date) } });
    expect(prisma.transaction.updateMany).not.toHaveBeenCalled();
  });
});
