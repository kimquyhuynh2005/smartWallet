import { Ctx, createCtx, signup } from './helpers';

let ctx: Ctx;
beforeAll(async () => { ctx = await createCtx(); });
afterAll(async () => { await ctx.app.close(); });

const now = () => new Date().toISOString();

/** Cross-user access: user B must never read, change or even confirm the existence of user A's data. */
describe('cross-user isolation (OwnershipGuard + user_id from JWT)', () => {
  let a: Awaited<ReturnType<typeof signup>>;
  let b: Awaited<ReturnType<typeof signup>>;
  let walletA: string;
  let txnA: string;
  let budgetA: string;

  beforeAll(async () => {
    a = await signup(ctx);
    b = await signup(ctx);
    walletA = (await ctx.http().post('/api/v1/wallets').set(a.auth).send({ name: 'A wallet', type: 'CASH', openingBalance: 1_000_000 }).expect(201)).body.data.id;
    txnA = (await ctx.http().post('/api/v1/transactions').set(a.auth).send({ walletId: walletA, type: 'EXPENSE', amount: 50_000, occurredAt: now() }).expect(201)).body.data.id;
    budgetA = (await ctx.http().post('/api/v1/budgets').set(a.auth).send({ categoryId: null, limitAmount: 1_000_000 }).expect(201)).body.data.id;
  });

  it('B gets 404 (not 403) deleting A\'s wallet, transaction and budget; A\'s data is intact', async () => {
    for (const path of [`/api/v1/wallets/${walletA}`, `/api/v1/transactions/${txnA}`, `/api/v1/budgets/${budgetA}`]) {
      const res = await ctx.http().delete(path).set(b.auth).expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
    expect((await ctx.http().get('/api/v1/wallets').set(a.auth)).body.data).toHaveLength(1);
    expect((await ctx.http().get('/api/v1/budgets').set(a.auth)).body.data).toHaveLength(1);
  });

  it('the 404 for another user\'s id is indistinguishable from a non-existent id and from a malformed id', async () => {
    const other = await ctx.http().delete(`/api/v1/wallets/${walletA}`).set(b.auth).expect(404);
    const ghost = await ctx.http().delete('/api/v1/wallets/00000000-0000-4000-8000-000000000000').set(b.auth).expect(404);
    const junk = await ctx.http().delete('/api/v1/wallets/not-a-uuid').set(b.auth).expect(404);
    expect(other.body).toEqual(ghost.body);
    expect(junk.body).toEqual(ghost.body);
  });

  it('B cannot post a transaction or transfer into A\'s wallet (404)', async () => {
    await ctx.http().post('/api/v1/transactions').set(b.auth).send({ walletId: walletA, type: 'EXPENSE', amount: 1000, occurredAt: now() }).expect(404);
    const walletB = (await ctx.http().post('/api/v1/wallets').set(b.auth).send({ name: 'B', type: 'CASH' }).expect(201)).body.data.id;
    await ctx.http().post('/api/v1/transactions/transfer').set(b.auth).send({ fromWalletId: walletB, toWalletId: walletA, amount: 1000, occurredAt: now() }).expect(404);
  });

  it('lists are scoped by the JWT: B sees none of A\'s rows', async () => {
    const tx = await ctx.http().get('/api/v1/transactions').set(b.auth).expect(200);
    expect(tx.body.data).toEqual([]);
    expect(tx.body.meta.total).toBe(0);
    expect(JSON.stringify((await ctx.http().get('/api/v1/wallets').set(b.auth)).body)).not.toContain(walletA);
  });

  it('a user_id in the body or query is rejected / ignored, never trusted', async () => {
    await ctx.http().post('/api/v1/wallets').set(b.auth).send({ name: 'x', type: 'CASH', userId: a.userId }).expect(400);
    await ctx.http().post('/api/v1/transactions').set(b.auth).send({ walletId: walletA, userId: b.userId, type: 'EXPENSE', amount: 1, occurredAt: now() }).expect(400);
    const res = await ctx.http().get(`/api/v1/transactions?userId=${a.userId}`).set(b.auth).expect(400); // unknown query params are rejected too
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /me always returns the caller, whatever else exists', async () => {
    expect((await ctx.http().get('/api/v1/me').set(b.auth)).body.data.id).toBe(b.userId);
  });
});

describe('RolesGuard on /admin', () => {
  it('401 anonymous, 403 for a normal user, 200 for an admin (role is read from the DB, so no re-login is needed)', async () => {
    const u = await signup(ctx);
    await ctx.http().get('/api/v1/admin/stats').expect(401);
    const denied = await ctx.http().get('/api/v1/admin/stats').set(u.auth).expect(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');
    await ctx.prisma.user.update({ where: { id: u.userId }, data: { role: 'ADMIN' } });
    const ok = await ctx.http().get('/api/v1/admin/stats').set(u.auth).expect(200);
    expect(ok.body.data.users).toBeGreaterThan(0);
    const users = await ctx.http().get('/api/v1/admin/users').set(u.auth).expect(200);
    expect(JSON.stringify(users.body)).not.toMatch(/passwordHash|password_hash/);
    await ctx.prisma.user.update({ where: { id: u.userId }, data: { role: 'USER' } });
    await ctx.http().get('/api/v1/admin/stats').set(u.auth).expect(403); // demotion is effective immediately
  });

  it('an admin has no endpoint that exposes transactions', async () => {
    const u = await signup(ctx);
    await ctx.prisma.user.update({ where: { id: u.userId }, data: { role: 'ADMIN' } });
    for (const p of ['/api/v1/admin/transactions', '/api/v1/admin/users/x/transactions']) await ctx.http().get(p).set(u.auth).expect(404);
  });
});

describe('LOCKED users', () => {
  it('an admin-locked user loses API access immediately', async () => {
    const u = await signup(ctx);
    await ctx.http().get('/api/v1/me').set(u.auth).expect(200);
    await ctx.prisma.user.update({ where: { id: u.userId }, data: { status: 'LOCKED' } });
    await ctx.http().get('/api/v1/me').set(u.auth).expect(401);
    await ctx.http().post('/api/v1/auth/login').send({ email: u.email, password: 'Passw0rd!x' }).expect(403);
  });
});
