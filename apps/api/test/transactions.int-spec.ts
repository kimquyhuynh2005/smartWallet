import { ReceiptUploadOut, TransactionCreatedOut, TransactionOut } from '@smartwallet/shared';
import { UnconfiguredStorageService, StorageService } from '../src/storage/storage.service';
import { Ctx, Session, balanceOf, captureEvents, createCtx, expectShape, mkTxn, mkWallet, now, signup, systemCategory } from './helpers';

let ctx: Ctx;
let s: Session;
beforeAll(async () => { ctx = await createCtx(); });
afterAll(async () => { await ctx.app.close(); });
beforeEach(async () => { s = await signup(ctx); });

const T = '/api/v1/transactions';
const isoDay = (d: string, h = 5) => `${d}T0${h}:00:00.000Z`;

describe('POST /transactions (TXN-01)', () => {
  it('201: income/expense with category and note; matches the documented schema; publishes transaction.changed after commit', async () => {
    const events = captureEvents(ctx);
    const w = await mkWallet(ctx, s, { openingBalance: 1_000_000 });
    const cat = await systemCategory(ctx, s, 'EXPENSE', 'Food & Drinks');
    const res = await ctx.http().post(T).set(s.auth).send({ walletId: w.id, categoryId: cat, type: 'EXPENSE', amount: 45_000, note: 'Phở bò', occurredAt: now() }).expect(201);
    expectShape(TransactionCreatedOut, res.body.data);
    expect(res.body.data.triggeredAlerts).toEqual([]); // no budget yet
    expect(res.body.data).toMatchObject({ walletId: w.id, categoryId: cat, type: 'EXPENSE', amount: 45_000, note: 'Phở bò', source: 'MANUAL', receiptUrl: null, transferWalletId: null });
    expect(await balanceOf(ctx, s, w.id)).toBe(955_000);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ userId: s.userId, action: 'created', previous: [], current: [{ id: res.body.data.id, type: 'EXPENSE', amount: 45_000, walletId: w.id, categoryId: cat }] });
  });
  it('income increases the balance', async () => {
    const w = await mkWallet(ctx, s);
    await mkTxn(ctx, s, w.id, { type: 'INCOME', amount: 12_000_000, categoryId: await systemCategory(ctx, s, 'INCOME', 'Salary') });
    expect(await balanceOf(ctx, s, w.id)).toBe(12_000_000);
  });
  it('422 CATEGORY_TYPE_MISMATCH: an income category on an expense; 404 for an unknown category', async () => {
    const w = await mkWallet(ctx, s);
    const income = await systemCategory(ctx, s, 'INCOME');
    const res = await ctx.http().post(T).set(s.auth).send({ walletId: w.id, categoryId: income, type: 'EXPENSE', amount: 1, occurredAt: now() }).expect(422);
    expect(res.body.error.code).toBe('CATEGORY_TYPE_MISMATCH');
    await ctx.http().post(T).set(s.auth).send({ walletId: w.id, categoryId: '00000000-0000-4000-8000-000000000000', type: 'EXPENSE', amount: 1, occurredAt: now() }).expect(404);
    expect(await ctx.prisma.transaction.count({ where: { userId: s.userId } })).toBe(0);
  });
  it('400: zero / negative / fractional amount, TRANSFER type, bad date, forbidden keys', async () => {
    const w = await mkWallet(ctx, s);
    const ok = { walletId: w.id, type: 'EXPENSE', amount: 1, occurredAt: now() };
    for (const bad of [{ amount: 0 }, { amount: -5 }, { amount: 10.5 }, { type: 'TRANSFER' }, { occurredAt: 'yesterday' }, { userId: s.userId }, { source: 'IMPORT' }, { walletId: 'nope' }]) {
      expect((await ctx.http().post(T).set(s.auth).send({ ...ok, ...bad }).expect(400)).body.error.code).toBe('VALIDATION_ERROR');
    }
  });
  it('404 for another user\'s wallet; 401 anonymous', async () => {
    const other = await signup(ctx);
    const theirs = await mkWallet(ctx, other);
    await ctx.http().post(T).set(s.auth).send({ walletId: theirs.id, type: 'EXPENSE', amount: 1, occurredAt: now() }).expect(404);
    await ctx.http().post(T).send({}).expect(401);
  });
  it('the database itself refuses a zero amount (CHECK constraint), independent of API validation', async () => {
    const w = await mkWallet(ctx, s);
    await expect(ctx.prisma.transaction.create({ data: { userId: s.userId, walletId: w.id, type: 'EXPENSE', amount: 0n, occurredAt: new Date() } })).rejects.toThrow();
  });
});

describe('POST /transactions/transfer (TXN-02)', () => {
  it('201: one linked row, balances move, and it is neither income nor expense', async () => {
    const events = captureEvents(ctx);
    const a = await mkWallet(ctx, s, { name: 'A', openingBalance: 1_000_000 });
    const b = await mkWallet(ctx, s, { name: 'B' });
    const res = await ctx.http().post(`${T}/transfer`).set(s.auth).send({ fromWalletId: a.id, toWalletId: b.id, amount: 300_000, note: 'Nạp MoMo', occurredAt: now() }).expect(201);
    expectShape(TransactionOut, res.body.data);
    expect(res.body.data).toMatchObject({ type: 'TRANSFER', walletId: a.id, transferWalletId: b.id, amount: 300_000, categoryId: null });
    expect(await balanceOf(ctx, s, a.id)).toBe(700_000);
    expect(await balanceOf(ctx, s, b.id)).toBe(300_000);
    const dash = (await ctx.http().get('/api/v1/reports/dashboard').set(s.auth)).body.data;
    expect(dash.totals).toMatchObject({ income: 0, expense: 0 });
    expect(events.at(-1)).toMatchObject({ action: 'created', current: [{ type: 'TRANSFER', walletId: a.id, transferWalletId: b.id }] });
  });
  it('400 same wallet / invalid amount; 404 foreign wallet; the DB forbids a self-transfer too', async () => {
    const a = await mkWallet(ctx, s);
    const other = await signup(ctx);
    const foreign = await mkWallet(ctx, other);
    await ctx.http().post(`${T}/transfer`).set(s.auth).send({ fromWalletId: a.id, toWalletId: a.id, amount: 1, occurredAt: now() }).expect(400);
    await ctx.http().post(`${T}/transfer`).set(s.auth).send({ fromWalletId: a.id, toWalletId: foreign.id, amount: 1, occurredAt: now() }).expect(404);
    await ctx.http().post(`${T}/transfer`).set(s.auth).send({ fromWalletId: foreign.id, toWalletId: a.id, amount: 1, occurredAt: now() }).expect(404);
    await ctx.http().post(`${T}/transfer`).set(s.auth).send({ fromWalletId: a.id, toWalletId: foreign.id, amount: 0, occurredAt: now() }).expect(400);
    await expect(ctx.prisma.transaction.create({ data: { userId: s.userId, walletId: a.id, transferWalletId: a.id, type: 'TRANSFER', amount: 1n, occurredAt: new Date() } })).rejects.toThrow();
  });
});

describe('GET /transactions (TXN-03) filters, pagination, sort', () => {
  let wA: string, wB: string, food: string, transport: string;
  beforeEach(async () => {
    wA = (await mkWallet(ctx, s, { name: 'A' })).id;
    wB = (await mkWallet(ctx, s, { name: 'B' })).id;
    food = await systemCategory(ctx, s, 'EXPENSE', 'Food & Drinks');
    transport = await systemCategory(ctx, s, 'EXPENSE', 'Transport');
    await mkTxn(ctx, s, wA, { amount: 50_000, categoryId: food, note: 'Phở bò', occurredAt: isoDay('2026-11-05') });
    await mkTxn(ctx, s, wA, { amount: 30_000, categoryId: transport, note: 'Grab đi học', occurredAt: isoDay('2026-11-06') });
    await mkTxn(ctx, s, wB, { amount: 5_000_000, type: 'INCOME', note: 'Lương', occurredAt: isoDay('2026-11-07') });
    await mkTxn(ctx, s, wB, { amount: 120_000, categoryId: food, note: 'PHỞ gà', occurredAt: isoDay('2026-11-08') });
    await ctx.http().post(`${T}/transfer`).set(s.auth).send({ fromWalletId: wB, toWalletId: wA, amount: 1_000_000, occurredAt: isoDay('2026-11-09') }).expect(201);
  });
  const list = async (qs: string) => (await ctx.http().get(`${T}?${qs}`).set(s.auth).expect(200)).body;

  it('returns { data, meta } with schema-valid rows, newest first by default', async () => {
    const body = await list('');
    body.data.forEach((t: unknown) => expectShape(TransactionOut, t));
    expect(body.meta).toEqual({ page: 1, limit: 20, total: 5 });
    expect(body.data.map((t: any) => t.occurredAt)).toEqual([...body.data.map((t: any) => t.occurredAt)].sort().reverse());
  });
  it('filters by type, category, wallet (a transfer matches both its wallets) and amount range', async () => {
    expect((await list('type=INCOME')).meta.total).toBe(1);
    expect((await list('type=TRANSFER')).meta.total).toBe(1);
    expect((await list(`categoryId=${food}`)).meta.total).toBe(2);
    expect((await list(`walletId=${wA}`)).meta.total).toBe(3); // 2 expenses + incoming transfer
    expect((await list(`walletId=${wB}`)).meta.total).toBe(3); // income + expense + outgoing transfer
    expect((await list('minAmount=100000&maxAmount=200000')).data.map((t: any) => t.amount)).toEqual([120_000]);
    expect((await list('minAmount=5000000')).meta.total).toBe(1);
  });
  it('filters by date range: date-only bounds are Vietnam days and `to` is inclusive', async () => {
    expect((await list('from=2026-11-06&to=2026-11-07')).meta.total).toBe(2);
    expect((await list('from=2026-11-08')).meta.total).toBe(2);
    expect((await list('to=2026-11-05')).meta.total).toBe(1);
    expect((await list('from=2026-11-05T05:00:00.000Z&to=2026-11-05T05:00:00.000Z')).meta.total).toBe(1);
  });
  it('keyword search is case-insensitive on the note', async () => {
    expect((await list(`q=${encodeURIComponent('phở')}`)).meta.total).toBe(2);
    expect((await list('q=GRAB')).meta.total).toBe(1);
    expect((await list('q=nothing')).meta.total).toBe(0);
  });
  it('combines filters with AND, and paginates', async () => {
    expect((await list(`walletId=${wB}&type=EXPENSE&q=ph`)).meta.total).toBe(1);
    const p1 = await list('limit=2&page=1');
    const p3 = await list('limit=2&page=3');
    expect(p1.data).toHaveLength(2);
    expect(p1.meta).toEqual({ page: 1, limit: 2, total: 5 });
    expect(p3.data).toHaveLength(1);
    expect(p3.meta.page).toBe(3);
  });
  it('sorts by amount and date, both directions', async () => {
    expect((await list('sort=amount:desc')).data[0].amount).toBe(5_000_000);
    expect((await list('sort=amount:asc')).data[0].amount).toBe(30_000);
    expect((await list('sort=occurredAt:asc')).data[0].note).toBe('Phở bò');
    expect((await list('sort=occurredAt:desc')).data[0].type).toBe('TRANSFER');
  });
  it('400: limit > 100, page 0, bad sort/type/uuid/range, min > max, unknown params', async () => {
    for (const qs of ['limit=101', 'page=0', 'sort=note:asc', 'type=GIFT', 'walletId=abc', 'categoryId=abc', 'from=today', 'from=2026-11-10&to=2026-11-01', 'minAmount=10&maxAmount=5', 'minAmount=-1', 'userId=x', 'q=']) {
      expect((await ctx.http().get(`${T}?${qs}`).set(s.auth).expect(400)).body.error.code).toBe('VALIDATION_ERROR');
    }
  });
  it('is isolated per user and needs a token', async () => {
    const other = await signup(ctx);
    expect((await ctx.http().get(T).set(other.auth).expect(200)).body.meta.total).toBe(0);
    await ctx.http().get(T).expect(401);
  });
});

describe('GET /transactions/:id', () => {
  it('200 own row; 404 for another user, unknown and malformed ids', async () => {
    const w = await mkWallet(ctx, s);
    const t = await mkTxn(ctx, s, w.id);
    const res = await ctx.http().get(`${T}/${t.id}`).set(s.auth).expect(200);
    expectShape(TransactionOut, res.body.data);
    const other = await signup(ctx);
    await ctx.http().get(`${T}/${t.id}`).set(other.auth).expect(404);
    await ctx.http().get(`${T}/00000000-0000-4000-8000-000000000000`).set(s.auth).expect(404);
    await ctx.http().get(`${T}/nope`).set(s.auth).expect(404);
    await ctx.http().get(`${T}/${t.id}`).expect(401);
  });
});

describe('PATCH /transactions/:id (TXN-04)', () => {
  it('200: edits amount, note, date, category and recalculates; event carries previous and current', async () => {
    const events = captureEvents(ctx);
    const w = await mkWallet(ctx, s, { openingBalance: 1_000 });
    const food = await systemCategory(ctx, s, 'EXPENSE', 'Food & Drinks');
    const t = await mkTxn(ctx, s, w.id, { amount: 100 });
    events.length = 0;
    const res = await ctx.http().patch(`${T}/${t.id}`).set(s.auth).send({ amount: 250, note: 'sửa', categoryId: food, occurredAt: '2026-10-01T05:00:00.000Z' }).expect(200);
    expectShape(TransactionOut, res.body.data);
    expect(res.body.data).toMatchObject({ amount: 250, note: 'sửa', categoryId: food, occurredAt: '2026-10-01T05:00:00.000Z' });
    expect(await balanceOf(ctx, s, w.id)).toBe(750);
    expect(events[0]).toMatchObject({ action: 'updated', previous: [{ amount: 100 }], current: [{ amount: 250, categoryId: food }] });
    await ctx.http().patch(`${T}/${t.id}`).set(s.auth).send({ categoryId: null, note: null }).expect(200);
  });
  it('moving to another wallet fixes both balances; flipping EXPENSE to INCOME flips the sign', async () => {
    const a = await mkWallet(ctx, s, { name: 'A', openingBalance: 1_000 });
    const b = await mkWallet(ctx, s, { name: 'B', openingBalance: 1_000 });
    const t = await mkTxn(ctx, s, a.id, { amount: 300 });
    await ctx.http().patch(`${T}/${t.id}`).set(s.auth).send({ walletId: b.id }).expect(200);
    expect([await balanceOf(ctx, s, a.id), await balanceOf(ctx, s, b.id)]).toEqual([1_000, 700]);
    await ctx.http().patch(`${T}/${t.id}`).set(s.auth).send({ type: 'INCOME' }).expect(200);
    expect(await balanceOf(ctx, s, b.id)).toBe(1_300);
  });
  it('422 when the type change no longer fits the category; 409 into an archived wallet; 404 into a foreign wallet', async () => {
    const w = await mkWallet(ctx, s);
    const arch = await mkWallet(ctx, s, { name: 'Z' });
    const t = await mkTxn(ctx, s, w.id, { categoryId: await systemCategory(ctx, s, 'EXPENSE', 'Transport') });
    expect((await ctx.http().patch(`${T}/${t.id}`).set(s.auth).send({ type: 'INCOME' }).expect(422)).body.error.code).toBe('CATEGORY_TYPE_MISMATCH');
    await ctx.http().patch(`/api/v1/wallets/${arch.id}`).set(s.auth).send({ isArchived: true }).expect(200);
    await ctx.http().patch(`${T}/${t.id}`).set(s.auth).send({ walletId: arch.id }).expect(409);
    const foreign = await mkWallet(ctx, await signup(ctx));
    await ctx.http().patch(`${T}/${t.id}`).set(s.auth).send({ walletId: foreign.id }).expect(404);
  });
  it('a transfer can change amount/note/date but not wallets, category or type (422)', async () => {
    const a = await mkWallet(ctx, s, { name: 'A', openingBalance: 1_000 });
    const b = await mkWallet(ctx, s, { name: 'B' });
    const tr = (await ctx.http().post(`${T}/transfer`).set(s.auth).send({ fromWalletId: a.id, toWalletId: b.id, amount: 100, occurredAt: now() }).expect(201)).body.data;
    await ctx.http().patch(`${T}/${tr.id}`).set(s.auth).send({ amount: 400 }).expect(200);
    expect([await balanceOf(ctx, s, a.id), await balanceOf(ctx, s, b.id)]).toEqual([600, 400]);
    for (const bad of [{ walletId: b.id }, { type: 'INCOME' }, { categoryId: null }]) {
      expect((await ctx.http().patch(`${T}/${tr.id}`).set(s.auth).send(bad).expect(422)).body.error.code).toBe('TRANSFER_FIELDS_IMMUTABLE');
    }
  });
  it('400 for empty / invalid / forbidden fields; 404 other user; 401 anonymous', async () => {
    const w = await mkWallet(ctx, s);
    const t = await mkTxn(ctx, s, w.id);
    for (const bad of [{}, { amount: 0 }, { amount: 1.5 }, { userId: s.userId }, { source: 'IMPORT' }, { type: 'TRANSFER' }, { occurredAt: 'x' }]) await ctx.http().patch(`${T}/${t.id}`).set(s.auth).send(bad).expect(400);
    await ctx.http().patch(`${T}/${t.id}`).set((await signup(ctx)).auth).send({ amount: 1 }).expect(404);
    await ctx.http().patch(`${T}/${t.id}`).send({ amount: 1 }).expect(401);
  });
});

describe('DELETE /transactions/:id (TXN-04)', () => {
  it('204: soft-deletes, recalculates, publishes deleted; the row is gone for reads and 404 on repeat', async () => {
    const events = captureEvents(ctx);
    const w = await mkWallet(ctx, s, { openingBalance: 1_000 });
    const t = await mkTxn(ctx, s, w.id, { amount: 400 });
    events.length = 0;
    await ctx.http().delete(`${T}/${t.id}`).set(s.auth).expect(204);
    expect(await balanceOf(ctx, s, w.id)).toBe(1_000);
    await ctx.http().get(`${T}/${t.id}`).set(s.auth).expect(404);
    await ctx.http().delete(`${T}/${t.id}`).set(s.auth).expect(404);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: 'deleted', current: [], previous: [{ id: t.id, amount: 400 }] });
    expect((await ctx.prisma.transaction.findUnique({ where: { id: t.id } }))!.deletedAt).not.toBeNull(); // soft delete: the row is kept
  });
  it('401 anonymous; another user gets 404 and the row survives', async () => {
    const w = await mkWallet(ctx, s);
    const t = await mkTxn(ctx, s, w.id);
    await ctx.http().delete(`${T}/${t.id}`).expect(401);
    await ctx.http().delete(`${T}/${t.id}`).set((await signup(ctx)).auth).expect(404);
    await ctx.http().get(`${T}/${t.id}`).set(s.auth).expect(200);
  });
});

describe('receipts (TXN-01): pre-signed upload to a private bucket', () => {
  it('201: issues a key under receipts/{userId}/ plus an upload ticket capped at 5 MB', async () => {
    const res = await ctx.http().post(`${T}/receipts/upload-url`).set(s.auth).send({ contentType: 'image/jpeg', size: 1_000_000 }).expect(201);
    expectShape(ReceiptUploadOut, res.body.data);
    expect(res.body.data.key).toMatch(new RegExp(`^receipts/${s.userId}/[0-9a-f-]{36}\\.jpg$`));
    expect(res.body.data.maxBytes).toBe(5 * 1024 * 1024);
    expect(res.body.data.fields['Content-Type']).toBe('image/jpeg');
  });
  it('400: file over 5 MB, non-image type, missing size, extra keys; 401 anonymous', async () => {
    for (const bad of [{ contentType: 'image/png', size: 5 * 1024 * 1024 + 1 }, { contentType: 'application/pdf', size: 10 }, { contentType: 'image/png' }, { contentType: 'image/png', size: 0 }, { contentType: 'image/png', size: 5, key: 'x' }]) {
      await ctx.http().post(`${T}/receipts/upload-url`).set(s.auth).send(bad).expect(400);
    }
    await ctx.http().post(`${T}/receipts/upload-url`).send({ contentType: 'image/png', size: 5 }).expect(401);
  });
  it('attaching: the transaction returns a signed GET url (never the raw key); PATCH null removes it', async () => {
    const w = await mkWallet(ctx, s);
    const { key } = (await ctx.http().post(`${T}/receipts/upload-url`).set(s.auth).send({ contentType: 'image/png', size: 10 }).expect(201)).body.data;
    const t = (await ctx.http().post(T).set(s.auth).send({ walletId: w.id, type: 'EXPENSE', amount: 5, occurredAt: now(), receiptKey: key }).expect(201)).body.data;
    expect(t.receiptUrl).toBe(`https://s3.test/get/${key}?sig=1`);
    expect((await ctx.http().patch(`${T}/${t.id}`).set(s.auth).send({ receiptKey: null }).expect(200)).body.data.receiptUrl).toBeNull();
    expect((await ctx.http().patch(`${T}/${t.id}`).set(s.auth).send({ receiptKey: key }).expect(200)).body.data.receiptUrl).toContain(key);
  });
  it('422 INVALID_RECEIPT_KEY: another user\'s key, traversal and foreign prefixes are refused', async () => {
    const w = await mkWallet(ctx, s);
    const other = await signup(ctx);
    const theirs = (await ctx.http().post(`${T}/receipts/upload-url`).set(other.auth).send({ contentType: 'image/png', size: 10 }).expect(201)).body.data.key;
    for (const key of [theirs, `receipts/${s.userId}/../${other.userId}/x.png`, 'avatars/x.png']) {
      const res = await ctx.http().post(T).set(s.auth).send({ walletId: w.id, type: 'EXPENSE', amount: 5, occurredAt: now(), receiptKey: key }).expect(422);
      expect(res.body.error.code).toBe('INVALID_RECEIPT_KEY');
    }
  });
  it('501 STORAGE_NOT_CONFIGURED when no S3 bucket is configured', async () => {
    const bare = await createCtx((b) => b.overrideProvider(StorageService).useValue(new UnconfiguredStorageService()));
    const u = await signup(bare);
    const res = await bare.http().post(`${T}/receipts/upload-url`).set(u.auth).send({ contentType: 'image/png', size: 10 }).expect(501);
    expect(res.body.error.code).toBe('STORAGE_NOT_CONFIGURED');
    await bare.app.close();
  });
});
