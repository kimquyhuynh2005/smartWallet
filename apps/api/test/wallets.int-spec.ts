import { WalletOut } from '@smartwallet/shared';
import { Ctx, Session, balanceOf, captureEvents, createCtx, expectShape, mkTxn, mkWallet, now, premium, signup } from './helpers';

let ctx: Ctx;
let s: Session;
beforeAll(async () => { ctx = await createCtx(); });
afterAll(async () => { await ctx.app.close(); });
beforeEach(async () => { s = await signup(ctx); });

const W = '/api/v1/wallets';

describe('POST /wallets (WAL-01)', () => {
  it('201: creates a wallet; response matches the documented schema; balance = opening balance', async () => {
    const res = await ctx.http().post(W).set(s.auth).send({ name: 'Vietcombank', type: 'BANK', openingBalance: 5_000_000, color: '#0EA5E9' }).expect(201);
    expectShape(WalletOut, res.body.data);
    expect(res.body.data).toMatchObject({ name: 'Vietcombank', type: 'BANK', openingBalance: 5_000_000, balance: 5_000_000, currency: 'VND', color: '#0EA5E9', isArchived: false });
    expect(res.body.data).not.toHaveProperty('userId');
  });
  it('accepts every wallet type and a negative opening balance for credit cards', async () => {
    await premium(ctx, s); // Free allows only 3 wallets
    for (const type of ['CASH', 'BANK', 'EWALLET', 'CREDIT']) {
      const res = await ctx.http().post(W).set(s.auth).send({ name: type, type, openingBalance: type === 'CREDIT' ? -2_000_000 : 0 }).expect(201);
      expect(res.body.data.balance).toBe(type === 'CREDIT' ? -2_000_000 : 0);
    }
  });
  it('400: invalid type, fractional money, bad colour, unknown or forbidden keys', async () => {
    for (const bad of [{ name: 'x', type: 'CRYPTO' }, { name: '', type: 'CASH' }, { name: 'x', type: 'CASH', openingBalance: 1.5 }, { name: 'x', type: 'CASH', color: 'red' }, { name: 'x', type: 'CASH', userId: s.userId }, { name: 'x', type: 'CASH', isArchived: true }]) {
      expect((await ctx.http().post(W).set(s.auth).send(bad).expect(400)).body.error.code).toBe('VALIDATION_ERROR');
    }
  });
  it('401 without a token', async () => { await ctx.http().post(W).send({ name: 'x', type: 'CASH' }).expect(401); });
  it('403 PLAN_LIMIT_REACHED on the 4th active wallet (Free)', async () => {
    for (let i = 0; i < 3; i++) await mkWallet(ctx, s, { name: `W${i}` });
    const res = await ctx.http().post(W).set(s.auth).send({ name: 'W4', type: 'CASH' }).expect(403);
    expect(res.body.error).toMatchObject({ code: 'PLAN_LIMIT_REACHED', details: { key: 'max_wallets', limit: 3 } });
  });
});

describe('GET /wallets and GET /wallets/:id (WAL-02)', () => {
  it('lists my wallets with derived balances; archived ones are hidden unless includeArchived=true', async () => {
    const a = await mkWallet(ctx, s, { name: 'A', openingBalance: 100 });
    const b = await mkWallet(ctx, s, { name: 'B' });
    await ctx.http().patch(`${W}/${b.id}`).set(s.auth).send({ isArchived: true }).expect(200);
    const list = await ctx.http().get(W).set(s.auth).expect(200);
    list.body.data.forEach((w: unknown) => expectShape(WalletOut, w));
    expect(list.body.data.map((w: any) => w.id)).toEqual([a.id]);
    const all = await ctx.http().get(`${W}?includeArchived=true`).set(s.auth).expect(200);
    expect(all.body.data.map((w: any) => w.id).sort()).toEqual([a.id, b.id].sort());
    expect(all.body.data.find((w: any) => w.id === b.id).isArchived).toBe(true);
  });
  it('400 for a bad includeArchived or an unknown query param; 401 anonymous', async () => {
    await ctx.http().get(`${W}?includeArchived=maybe`).set(s.auth).expect(400);
    await ctx.http().get(`${W}?foo=1`).set(s.auth).expect(400);
    await ctx.http().get(W).expect(401);
  });
  it('GET /:id returns one wallet (even archived); 404 for unknown ids', async () => {
    const w = await mkWallet(ctx, s, { openingBalance: 7 });
    await ctx.http().patch(`${W}/${w.id}`).set(s.auth).send({ isArchived: true }).expect(200);
    const res = await ctx.http().get(`${W}/${w.id}`).set(s.auth).expect(200);
    expectShape(WalletOut, res.body.data);
    expect(res.body.data.balance).toBe(7);
    await ctx.http().get(`${W}/00000000-0000-4000-8000-000000000000`).set(s.auth).expect(404);
    await ctx.http().get(`${W}/nope`).set(s.auth).expect(404);
  });
  it('another user gets 404 for my wallet', async () => {
    const w = await mkWallet(ctx, s);
    const other = await signup(ctx);
    await ctx.http().get(`${W}/${w.id}`).set(other.auth).expect(404);
    await ctx.http().patch(`${W}/${w.id}`).set(other.auth).send({ name: 'hijack' }).expect(404);
    await ctx.http().delete(`${W}/${w.id}`).set(other.auth).expect(404);
    expect((await ctx.http().get(`${W}/${w.id}`).set(s.auth)).body.data.name).toBe('W');
  });
});

describe('PATCH /wallets/:id (WAL-01)', () => {
  it('200: renames, recolours, retypes and re-bases the opening balance (balance recalculates)', async () => {
    const w = await mkWallet(ctx, s, { openingBalance: 1_000 });
    await mkTxn(ctx, s, w.id, { amount: 400 });
    expect(await balanceOf(ctx, s, w.id)).toBe(600);
    const res = await ctx.http().patch(`${W}/${w.id}`).set(s.auth).send({ name: 'Ví mới', type: 'EWALLET', color: '#ABCDEF', openingBalance: 2_000 }).expect(200);
    expectShape(WalletOut, res.body.data);
    expect(res.body.data).toMatchObject({ name: 'Ví mới', type: 'EWALLET', color: '#ABCDEF', openingBalance: 2_000, balance: 1_600 });
    await ctx.http().patch(`${W}/${w.id}`).set(s.auth).send({ color: null }).expect(200);
  });
  it('400: empty body, unknown keys, bad values', async () => {
    const w = await mkWallet(ctx, s);
    for (const bad of [{}, { userId: s.userId }, { type: 'X' }, { openingBalance: 0.5 }, { name: '' }]) await ctx.http().patch(`${W}/${w.id}`).set(s.auth).send(bad).expect(400);
  });
  it('403 when un-archiving would exceed the plan limit; archived wallets do not count towards it', async () => {
    const ws = [await mkWallet(ctx, s, { name: 'A' }), await mkWallet(ctx, s, { name: 'B' }), await mkWallet(ctx, s, { name: 'C' })];
    await ctx.http().patch(`${W}/${ws[0].id}`).set(s.auth).send({ isArchived: true }).expect(200);
    await mkWallet(ctx, s, { name: 'D' }); // the archived one freed a slot
    const res = await ctx.http().patch(`${W}/${ws[0].id}`).set(s.auth).send({ isArchived: false }).expect(403);
    expect(res.body.error.code).toBe('PLAN_LIMIT_REACHED');
  });
  it('archived wallets are rejected by every entry form (409 WALLET_ARCHIVED)', async () => {
    const a = await mkWallet(ctx, s, { name: 'A' });
    const b = await mkWallet(ctx, s, { name: 'B' });
    await ctx.http().patch(`${W}/${b.id}`).set(s.auth).send({ isArchived: true }).expect(200);
    const t = { type: 'EXPENSE', amount: 1, occurredAt: now() };
    expect((await ctx.http().post('/api/v1/transactions').set(s.auth).send({ ...t, walletId: b.id }).expect(409)).body.error.code).toBe('WALLET_ARCHIVED');
    await ctx.http().post('/api/v1/transactions/transfer').set(s.auth).send({ fromWalletId: a.id, toWalletId: b.id, amount: 1, occurredAt: now() }).expect(409);
    await ctx.http().post('/api/v1/recurring-rules').set(s.auth).send({ walletId: b.id, type: 'EXPENSE', amount: 1, frequency: 'DAILY', nextRunAt: now() }).expect(409);
  });
});

describe('balance caching (WAL-02)', () => {
  it('is cached in Redis on read and invalidated by every money write', async () => {
    const w = await mkWallet(ctx, s, { openingBalance: 1_000 });
    const key = `wallet:balance:${w.id}`;
    await ctx.redis.client.del(key);
    expect(await balanceOf(ctx, s, w.id)).toBe(1_000);
    expect(await ctx.redis.client.get(key)).toBe('1000'); // filled by the read
    expect(await ctx.redis.client.ttl(key)).toBeGreaterThan(0);

    const t = await mkTxn(ctx, s, w.id, { amount: 300 });
    expect(await ctx.redis.client.get(key)).toBeNull(); // create invalidated it
    expect(await balanceOf(ctx, s, w.id)).toBe(700);

    await ctx.http().patch(`/api/v1/transactions/${t.id}`).set(s.auth).send({ amount: 500 }).expect(200);
    expect(await ctx.redis.client.get(key)).toBeNull(); // update invalidated it
    expect(await balanceOf(ctx, s, w.id)).toBe(500);

    await ctx.http().delete(`/api/v1/transactions/${t.id}`).set(s.auth).expect(204);
    expect(await ctx.redis.client.get(key)).toBeNull(); // delete invalidated it
    expect(await balanceOf(ctx, s, w.id)).toBe(1_000);
  });
  it('serves the cached value while it is fresh (proves the DB is not recomputed on every read)', async () => {
    const w = await mkWallet(ctx, s, { openingBalance: 10 });
    await balanceOf(ctx, s, w.id);
    await ctx.redis.client.set(`wallet:balance:${w.id}`, '12345', 'EX', 60);
    expect(await balanceOf(ctx, s, w.id)).toBe(12345);
  });
});

describe('DELETE /wallets/:id (WAL-01)', () => {
  it('204: removes the wallet and its transactions atomically, fixes the counterpart balance and publishes the event', async () => {
    const events = captureEvents(ctx);
    const a = await mkWallet(ctx, s, { name: 'A', openingBalance: 1_000 });
    const b = await mkWallet(ctx, s, { name: 'B' });
    await mkTxn(ctx, s, a.id, { amount: 100 });
    await ctx.http().post('/api/v1/transactions/transfer').set(s.auth).send({ fromWalletId: a.id, toWalletId: b.id, amount: 200, occurredAt: now() }).expect(201);
    expect(await balanceOf(ctx, s, b.id)).toBe(200);
    events.length = 0;

    await ctx.http().delete(`${W}/${a.id}`).set(s.auth).expect(204);
    await ctx.http().get(`${W}/${a.id}`).set(s.auth).expect(404);
    expect(await balanceOf(ctx, s, b.id)).toBe(0); // the transfer into B disappeared with A
    expect((await ctx.http().get('/api/v1/transactions').set(s.auth)).body.meta.total).toBe(0);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ userId: s.userId, action: 'wallet_deleted', current: [] });
    expect(events[0].previous).toHaveLength(2);
    expect(await ctx.prisma.transaction.count({ where: { userId: s.userId, deletedAt: null } })).toBe(0);
  });
  it('401 / 404', async () => {
    await ctx.http().delete(`${W}/00000000-0000-4000-8000-000000000000`).expect(401);
    await ctx.http().delete(`${W}/00000000-0000-4000-8000-000000000000`).set(s.auth).expect(404);
  });
});
