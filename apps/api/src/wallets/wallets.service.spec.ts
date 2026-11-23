import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FakeRedis, UID, mockPrisma, txnRow, user } from '../testing/mocks';
import { WalletsService } from './wallets.service';

const wallet = (over: Record<string, unknown> = {}) => ({
  id: UID(1), userId: 'u1', name: 'Cash', type: 'CASH', openingBalance: 1_000_000n, currency: 'VND', color: null, isArchived: false,
  createdAt: new Date(), updatedAt: new Date(), deletedAt: null, ...over,
});

function setup() {
  const prisma = mockPrisma(['transaction', 'recurringRule', 'goal', 'wallet']);
  const repo: any = { list: jest.fn(), find: jest.fn(), create: jest.fn(), update: jest.fn(), txnSum: jest.fn() };
  const redis = new FakeRedis();
  const plans: any = { forUser: jest.fn(async () => ({ code: 'FREE', limits: { max_wallets: 3 } })) };
  const usage: any = { count: jest.fn(async () => 0) };
  const events: any = { publish: jest.fn() };
  const reportCache: any = { bump: jest.fn() };
  return { svc: new WalletsService(repo, prisma, redis as any, plans, usage, events, reportCache), repo, prisma, redis, plans, usage, events, reportCache };
}

describe('WAL-02 balance (derived + cached)', () => {
  it('is opening_balance + sum(transactions) and is cached for 5 minutes', async () => {
    const { svc, repo, redis } = setup();
    repo.txnSum.mockResolvedValue(-250_000n);
    expect(await svc.balance(UID(1), 1_000_000n)).toBe(750_000n);
    expect(redis.store.get(`wallet:balance:${UID(1)}`)).toBe('750000');
    expect(redis.ttl.get(`wallet:balance:${UID(1)}`)).toBe(300);
  });
  it('serves from Redis without touching the database', async () => {
    const { svc, repo, redis } = setup();
    redis.store.set(`wallet:balance:${UID(1)}`, '42');
    expect(await svc.balance(UID(1), 0n)).toBe(42n);
    expect(repo.txnSum).not.toHaveBeenCalled();
  });
  it('falls back to the database when Redis is down', async () => {
    const { svc, repo, redis } = setup();
    redis.failing = true;
    repo.txnSum.mockResolvedValue(5n);
    expect(await svc.balance(UID(1), 10n)).toBe(15n);
  });
  it('invalidate drops the cache keys (deduplicated)', async () => {
    const { svc, redis } = setup();
    redis.store.set(`wallet:balance:${UID(1)}`, '1');
    redis.store.set(`wallet:balance:${UID(2)}`, '2');
    await svc.invalidate(UID(1), UID(2), UID(1));
    expect(redis.store.size).toBe(0);
  });
});

describe('WAL-01 wallets', () => {
  it('present() exposes the balance but never user_id / deleted_at', async () => {
    const { svc, repo } = setup();
    repo.txnSum.mockResolvedValue(0n);
    const out: any = await svc.present(wallet() as any);
    expect(out.balance).toBe(1_000_000n);
    expect(out).not.toHaveProperty('userId');
    expect(out).not.toHaveProperty('deletedAt');
  });
  it('list hides archived wallets unless asked', async () => {
    const { svc, repo } = setup();
    repo.list.mockResolvedValue([]);
    await svc.list(user);
    expect(repo.list).toHaveBeenCalledWith('u1', false);
    await svc.list(user, true);
    expect(repo.list).toHaveBeenLastCalledWith('u1', true);
  });
  it('getOwned is 404 for another user\'s wallet (repo is queried with the JWT user id)', async () => {
    const { svc, repo } = setup();
    repo.find.mockResolvedValue(null);
    await expect(svc.getOwned(user, UID(9))).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.find).toHaveBeenCalledWith('u1', UID(9), undefined);
  });
  it('getUsable refuses archived wallets with 409 WALLET_ARCHIVED', async () => {
    const { svc, repo } = setup();
    repo.find.mockResolvedValue(wallet({ isArchived: true }));
    await expect(svc.getUsable(user, UID(1))).rejects.toMatchObject({ response: { code: 'WALLET_ARCHIVED' } });
    await expect(svc.getUsable(user, UID(1))).rejects.toBeInstanceOf(ConflictException);
  });
  it('un-archiving takes a slot: blocked with PLAN_LIMIT_REACHED when the plan is full', async () => {
    const { svc, repo, usage } = setup();
    repo.find.mockResolvedValue(wallet({ isArchived: true }));
    usage.count.mockResolvedValue(3);
    await expect(svc.update(user, UID(1), { isArchived: false })).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.update).not.toHaveBeenCalled();
  });
  it('update converts opening balance to BigInt and drops the cached balance', async () => {
    const { svc, repo, redis } = setup();
    repo.find.mockResolvedValue(wallet());
    repo.update.mockResolvedValue(wallet({ openingBalance: 5n }));
    repo.txnSum.mockResolvedValue(0n);
    redis.store.set(`wallet:balance:${UID(1)}`, '999');
    await svc.update(user, UID(1), { name: 'New', openingBalance: 5 });
    expect(repo.update).toHaveBeenCalledWith(UID(1), { name: 'New', openingBalance: 5n });
    expect(redis.store.get(`wallet:balance:${UID(1)}`)).toBe('5'); // recomputed after invalidation, not the stale 999
  });
});

describe('wallet delete is atomic and notifies', () => {
  it('soft-deletes wallet + its transactions + rules in one DB transaction, invalidates counterpart wallets and publishes wallet_deleted', async () => {
    const { svc, repo, prisma, redis, events } = setup();
    repo.find.mockResolvedValue(wallet());
    const rows = [txnRow({ id: UID(10) }), txnRow({ id: UID(11), type: 'TRANSFER', walletId: UID(2), transferWalletId: UID(1) })];
    prisma.transaction.findMany.mockResolvedValue(rows);
    redis.store.set(`wallet:balance:${UID(2)}`, '7');
    await svc.remove(user, UID(1));
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.transaction.updateMany).toHaveBeenCalledWith({ where: { id: { in: [UID(10), UID(11)] } }, data: { deletedAt: expect.any(Date) } });
    expect(prisma.wallet.update).toHaveBeenCalledWith({ where: { id: UID(1) }, data: { deletedAt: expect.any(Date) } });
    expect(redis.store.has(`wallet:balance:${UID(2)}`)).toBe(false);
    expect(events.publish).toHaveBeenCalledWith('transaction.changed', expect.objectContaining({ userId: 'u1', action: 'wallet_deleted', current: [], previous: expect.arrayContaining([expect.objectContaining({ id: UID(10) })]) }));
  });
  it('publishes nothing for an empty wallet', async () => {
    const { svc, repo, prisma, events } = setup();
    repo.find.mockResolvedValue(wallet());
    prisma.transaction.findMany.mockResolvedValue([]);
    await svc.remove(user, UID(1));
    expect(events.publish).not.toHaveBeenCalled();
  });
});
