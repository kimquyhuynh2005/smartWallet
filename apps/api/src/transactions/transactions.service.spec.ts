import { BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { UID, mockPrisma, txnRow, user } from '../testing/mocks';
import { TransactionsService, dateBounds } from './transactions.service';

function setup() {
  const order: string[] = [];
  const prisma = mockPrisma(['transaction']);
  const origTx = prisma.$transaction;
  prisma.$transaction = jest.fn(async (arg: any) => { const r = await origTx(arg); order.push('commit'); return r; });
  const repo: any = { findOwned: jest.fn(), create: jest.fn(async (d: any) => txnRow({ ...d, id: UID(100) })), update: jest.fn(), softDelete: jest.fn(), page: jest.fn(async () => [[], 0]) };
  const wallets: any = { getUsable: jest.fn(async () => ({})), invalidate: jest.fn(async (...ids: string[]) => { order.push(`invalidate:${ids.length}`); }) };
  const categories: any = { assertUsable: jest.fn() };
  const categorizer: any = { top: jest.fn(async () => null), learn: jest.fn(async () => 0) };
  const storage: any = { createUploadTicket: jest.fn(async () => ({ url: 'https://s3', fields: { a: 'b' } })), getDownloadUrl: jest.fn(async (k: string) => `https://signed/${k}`) };
  const events: any = { publish: jest.fn(async () => { order.push('event'); return []; }) };
  return { svc: new TransactionsService(prisma, repo, wallets, categories, categorizer, storage, events), prisma, repo, wallets, categories, categorizer, storage, events, order };
}
const dto = { walletId: UID(1), type: 'EXPENSE' as const, amount: 50_000, occurredAt: '2026-11-10T05:00:00.000Z' };

describe('TXN-01 create', () => {
  it('writes inside ONE db transaction, then invalidates caches, then publishes transaction.changed (after commit)', async () => {
    const { svc, order, events, prisma, wallets, repo } = setup();
    await svc.create(user, { ...dto, categoryId: UID(5) });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(wallets.getUsable).toHaveBeenCalledWith(user, UID(1), prisma); // checked with the tx client, inside the transaction
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', amount: 50_000n, source: 'MANUAL' }), prisma);
    expect(order).toEqual(['commit', 'invalidate:1', 'event']);
    expect(events.publish).toHaveBeenCalledWith('transaction.changed', { userId: 'u1', action: 'created', previous: [], current: [expect.objectContaining({ id: UID(100), type: 'EXPENSE', amount: 50_000, walletId: UID(1) })] });
  });
  it('checks the category against the transaction type', async () => {
    const { svc, categories } = setup();
    categories.assertUsable.mockRejectedValue(new UnprocessableEntityException({ code: 'CATEGORY_TYPE_MISMATCH' }));
    await expect(svc.create(user, { ...dto, categoryId: UID(5) })).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(categories.assertUsable).toHaveBeenCalledWith('u1', UID(5), 'EXPENSE');
  });
  it('a failing validation publishes nothing and touches no cache', async () => {
    const { svc, wallets, events } = setup();
    wallets.getUsable.mockRejectedValue(new NotFoundException());
    await expect(svc.create(user, dto)).rejects.toBeInstanceOf(NotFoundException);
    expect(events.publish).not.toHaveBeenCalled();
    expect(wallets.invalidate).not.toHaveBeenCalled();
  });
  it('rejects a receipt key that was not issued to this user (no cross-user attachments)', async () => {
    const { svc, prisma } = setup();
    for (const key of ['receipts/someone-else/x.png', `receipts/u1/../u2/x.png`, 'other/u1/x.png']) {
      await expect(svc.create(user, { ...dto, receiptKey: key })).rejects.toMatchObject({ response: { code: 'INVALID_RECEIPT_KEY' } });
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('accepts the user\'s own key and returns a signed GET url, never the raw key', async () => {
    const { svc, repo } = setup();
    repo.create.mockImplementation(async (d: any) => txnRow({ ...d, receiptUrl: d.receiptUrl }));
    const out: any = await svc.create(user, { ...dto, receiptKey: 'receipts/u1/a.png' });
    expect(out.receiptUrl).toBe('https://signed/receipts/u1/a.png');
  });
});

describe('TXN-02 transfer', () => {
  it('creates a single TRANSFER row from -> to, validates both wallets, invalidates both caches', async () => {
    const { svc, repo, wallets } = setup();
    await svc.transfer(user, { fromWalletId: UID(1), toWalletId: UID(2), amount: 200_000, occurredAt: dto.occurredAt });
    expect(wallets.getUsable).toHaveBeenCalledTimes(2);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'TRANSFER', walletId: UID(1), transferWalletId: UID(2), amount: 200_000n }), expect.anything());
    expect(wallets.invalidate).toHaveBeenCalledWith(UID(1), UID(2));
  });
});

describe('TXN-04 update / delete', () => {
  it('moving a transaction to another wallet recalculates both wallets and reports previous + current', async () => {
    const { svc, repo, wallets, events } = setup();
    repo.findOwned.mockResolvedValue(txnRow());
    repo.update.mockResolvedValue(txnRow({ walletId: UID(2), amount: 70_000n }));
    await svc.update(user, UID(100), { walletId: UID(2), amount: 70_000 });
    expect(wallets.getUsable).toHaveBeenCalledWith(user, UID(2), expect.anything());
    expect(wallets.invalidate).toHaveBeenCalledWith(UID(2), UID(1));
    const ev = events.publish.mock.calls[0][1];
    expect(ev.action).toBe('updated');
    expect(ev.previous[0]).toMatchObject({ walletId: UID(1), amount: 50_000 });
    expect(ev.current[0]).toMatchObject({ walletId: UID(2), amount: 70_000 });
  });
  it('changing the type re-validates the existing category', async () => {
    const { svc, repo, categories } = setup();
    repo.findOwned.mockResolvedValue(txnRow({ categoryId: UID(5) }));
    repo.update.mockResolvedValue(txnRow({ type: 'INCOME' }));
    await svc.update(user, UID(100), { type: 'INCOME' });
    expect(categories.assertUsable).toHaveBeenCalledWith('u1', UID(5), 'INCOME');
  });
  it('a transfer only allows amount, note and occurredAt to change', async () => {
    const { svc, repo } = setup();
    repo.findOwned.mockResolvedValue(txnRow({ type: 'TRANSFER', transferWalletId: UID(2) }));
    for (const patch of [{ walletId: UID(3) }, { categoryId: UID(5) }, { type: 'INCOME' as const }, { receiptKey: 'receipts/u1/x.png' }]) {
      await expect(svc.update(user, UID(100), patch)).rejects.toMatchObject({ response: { code: 'TRANSFER_FIELDS_IMMUTABLE' } });
    }
    repo.update.mockResolvedValue(txnRow({ type: 'TRANSFER', amount: 9n }));
    await expect(svc.update(user, UID(100), { amount: 9, note: 'x' })).resolves.toBeDefined();
  });
  it('update and delete are 404 for rows the caller does not own', async () => {
    const { svc, repo, events } = setup();
    repo.findOwned.mockResolvedValue(null);
    await expect(svc.update(user, UID(100), { amount: 1 })).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.remove(user, UID(100))).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.findOwned).toHaveBeenCalledWith('u1', UID(100), expect.anything());
    expect(events.publish).not.toHaveBeenCalled();
  });
  it('delete soft-deletes inside the transaction and publishes the removed row as previous', async () => {
    const { svc, repo, events, order } = setup();
    repo.findOwned.mockResolvedValue(txnRow());
    await svc.remove(user, UID(100));
    expect(repo.softDelete).toHaveBeenCalledWith(UID(100), expect.anything());
    expect(events.publish).toHaveBeenCalledWith('transaction.changed', expect.objectContaining({ action: 'deleted', current: [], previous: [expect.objectContaining({ id: UID(100) })] }));
    expect(order[0]).toBe('commit');
  });
});

describe('TXN-03 list', () => {
  const base = { page: 1, limit: 20, sort: 'occurredAt:desc' };
  it('always scopes by the JWT user and builds every filter', async () => {
    const { svc, repo } = setup();
    await svc.list(user, { ...base, page: 3, limit: 10, type: 'EXPENSE', walletId: UID(1), categoryId: UID(5), minAmount: 1000, maxAmount: 9000, q: 'phở', from: '2026-11-01', to: '2026-11-30', sort: 'amount:asc' });
    const [where, orderBy, skip, take] = repo.page.mock.calls[0];
    expect(where).toMatchObject({
      userId: 'u1', deletedAt: null, type: 'EXPENSE', categoryId: UID(5),
      amount: { gte: 1000n, lte: 9000n }, note: { contains: 'phở', mode: 'insensitive' },
      OR: [{ walletId: UID(1) }, { transferWalletId: UID(1) }],
      occurredAt: { gte: new Date('2026-10-31T17:00:00.000Z'), lte: new Date('2026-11-30T16:59:59.999Z') },
    });
    expect(orderBy[0]).toEqual({ amount: 'asc' });
    expect([skip, take]).toEqual([20, 10]);
  });
  it('returns { items, meta } with presented rows', async () => {
    const { svc, repo } = setup();
    repo.page.mockResolvedValue([[txnRow()], 41]);
    const out: any = await svc.list(user, base);
    expect(out.meta).toEqual({ page: 1, limit: 20, total: 41 });
    expect(out.items[0]).not.toHaveProperty('userId');
  });
});

describe('dateBounds', () => {
  it('date-only values are Vietnam days; `to` is inclusive to the last millisecond', () => {
    expect(dateBounds('2026-11-05', '2026-11-05')).toEqual({ gte: new Date('2026-11-04T17:00:00.000Z'), lte: new Date('2026-11-05T16:59:59.999Z') });
  });
  it('passes full datetimes through and rejects from > to', () => {
    expect(dateBounds('2026-11-05T01:00:00Z')).toEqual({ gte: new Date('2026-11-05T01:00:00Z') });
    expect(() => dateBounds('2026-11-06', '2026-11-05')).toThrow(BadRequestException);
  });
});

describe('receipt upload', () => {
  it('issues a key under receipts/{userId}/ with the right extension and a 5 MB cap', async () => {
    const { svc, storage } = setup();
    const out = await svc.createReceiptUpload(user, { contentType: 'image/png', size: 1000 });
    expect(out.key).toMatch(/^receipts\/u1\/[0-9a-f-]{36}\.png$/);
    expect(storage.createUploadTicket).toHaveBeenCalledWith(out.key, 'image/png', 5 * 1024 * 1024, 300);
    expect(out).toMatchObject({ url: 'https://s3', maxBytes: 5 * 1024 * 1024, expiresIn: 300 });
  });
});
