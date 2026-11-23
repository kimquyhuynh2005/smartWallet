import { Ctx, createCtx, signup } from './helpers';

let ctx: Ctx;
beforeAll(async () => { ctx = await createCtx(); });
afterAll(async () => { await ctx.app.close(); });

const now = () => new Date().toISOString();
const balances = async (s: { auth: object }) => Object.fromEntries((await ctx.http().get('/api/v1/wallets').set(s.auth as any)).body.data.map((w: any) => [w.name, w.balance]));

describe('WAL-02 derived balance with single-row transfers (TXN-02)', () => {
  it('balance = opening + income - expense -/+ transfers; deleting recalculates; transfer is not income/expense', async () => {
    const s = await signup(ctx);
    const w1 = (await ctx.http().post('/api/v1/wallets').set(s.auth).send({ name: 'W1', type: 'CASH', openingBalance: 1_000_000 }).expect(201)).body.data.id;
    const w2 = (await ctx.http().post('/api/v1/wallets').set(s.auth).send({ name: 'W2', type: 'BANK' }).expect(201)).body.data.id;
    await ctx.http().post('/api/v1/transactions').set(s.auth).send({ walletId: w1, type: 'EXPENSE', amount: 100_000, occurredAt: now() }).expect(201);
    await ctx.http().post('/api/v1/transactions').set(s.auth).send({ walletId: w1, type: 'INCOME', amount: 50_000, occurredAt: now() }).expect(201);
    expect(await balances(s)).toEqual({ W1: 950_000, W2: 0 });

    const t = await ctx.http().post('/api/v1/transactions/transfer').set(s.auth).send({ fromWalletId: w1, toWalletId: w2, amount: 200_000, occurredAt: now() }).expect(201);
    expect(t.body.data).toMatchObject({ type: 'TRANSFER', walletId: w1, transferWalletId: w2, amount: 200_000 });
    expect(await balances(s)).toEqual({ W1: 750_000, W2: 200_000 });
    const dash = (await ctx.http().get('/api/v1/reports/dashboard').set(s.auth).expect(200)).body.data;
    expect(dash.totals).toMatchObject({ income: 50_000, expense: 100_000, net: -50_000 }); // transfer excluded

    await ctx.http().delete(`/api/v1/transactions/${t.body.data.id}`).set(s.auth).expect(204);
    expect(await balances(s)).toEqual({ W1: 950_000, W2: 0 });
  });

  it('400 for a transfer to the same wallet or a non-positive amount', async () => {
    const s = await signup(ctx);
    const w = (await ctx.http().post('/api/v1/wallets').set(s.auth).send({ name: 'W', type: 'CASH' }).expect(201)).body.data.id;
    await ctx.http().post('/api/v1/transactions/transfer').set(s.auth).send({ fromWalletId: w, toWalletId: w, amount: 5, occurredAt: now() }).expect(400);
    await ctx.http().post('/api/v1/transactions').set(s.auth).send({ walletId: w, type: 'EXPENSE', amount: 0, occurredAt: now() }).expect(400);
    await ctx.http().post('/api/v1/transactions').set(s.auth).send({ walletId: w, type: 'EXPENSE', amount: 10.5, occurredAt: now() }).expect(400); // money is integer VND
  });
});

describe('ALR-01 budget alerts fire once per threshold per period', () => {
  it('80% -> BUDGET_WARNING once, 100% -> BUDGET_EXCEEDED once; repeats never duplicate', async () => {
    const s = await signup(ctx);
    const w = (await ctx.http().post('/api/v1/wallets').set(s.auth).send({ name: 'W', type: 'CASH' }).expect(201)).body.data.id;
    const b = (await ctx.http().post('/api/v1/budgets').set(s.auth).send({ categoryId: null, limitAmount: 1_000_000 }).expect(201)).body.data;
    expect(b.alertThresholds).toEqual([80, 100]);
    const spend = (amount: number) => ctx.http().post('/api/v1/transactions').set(s.auth).send({ walletId: w, type: 'EXPENSE', amount, occurredAt: now() }).expect(201);

    await spend(700_000);
    expect((await ctx.http().get('/api/v1/notifications').set(s.auth)).body.data).toHaveLength(0);
    await spend(150_000); // 85%
    await spend(10_000); // still >= 80, must not re-fire
    let n = (await ctx.http().get('/api/v1/notifications').set(s.auth)).body.data;
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ type: 'BUDGET_WARNING', payload: { budgetId: b.id, threshold: 80 } });
    await spend(200_000); // 106%
    await spend(5_000);
    n = (await ctx.http().get('/api/v1/notifications').set(s.auth)).body.data;
    expect(n.map((x: any) => x.payload.threshold).sort()).toEqual([100, 80]);
    expect(n.find((x: any) => x.payload.threshold === 100).type).toBe('BUDGET_EXCEEDED');

    const prog = (await ctx.http().get('/api/v1/budgets').set(s.auth)).body.data[0];
    expect(prog).toMatchObject({ spent: 1_065_000, remaining: -65_000, safeToSpendToday: 0 });
  });

  it('409 for a duplicate budget in the same period; Free users cannot set custom thresholds', async () => {
    const s = await signup(ctx);
    await ctx.http().post('/api/v1/budgets').set(s.auth).send({ categoryId: null, limitAmount: 1_000 }).expect(201);
    expect((await ctx.http().post('/api/v1/budgets').set(s.auth).send({ categoryId: null, limitAmount: 2_000 }).expect(409)).body.error.code).toBe('BUDGET_EXISTS');
    const cat = (await ctx.http().get('/api/v1/categories').set(s.auth)).body.data.find((c: any) => c.type === 'EXPENSE').id;
    expect((await ctx.http().post('/api/v1/budgets').set(s.auth).send({ categoryId: cat, limitAmount: 1_000, alertThresholds: [50] }).expect(403)).body.error.code).toBe('PLAN_LIMIT_REACHED');
  });
});

describe('SUB-01 plan limits come from plans.limits', () => {
  it('Free: 4th wallet is 403 PLAN_LIMIT_REACHED; after mock checkout it succeeds', async () => {
    const s = await signup(ctx);
    for (let i = 0; i < 3; i++) await ctx.http().post('/api/v1/wallets').set(s.auth).send({ name: `W${i}`, type: 'CASH' }).expect(201);
    const res = await ctx.http().post('/api/v1/wallets').set(s.auth).send({ name: 'W4', type: 'CASH' }).expect(403);
    expect(res.body.error).toMatchObject({ code: 'PLAN_LIMIT_REACHED' });
    await ctx.http().post('/api/v1/subscriptions/mock-checkout').set(s.auth).expect(200);
    await ctx.http().post('/api/v1/wallets').set(s.auth).send({ name: 'W4', type: 'CASH' }).expect(201);
    expect((await ctx.http().get('/api/v1/me').set(s.auth)).body.data.plan).toBe('PREMIUM');
  });
});

describe('CAT-01 / CAT-03', () => {
  it('lists system categories in vi/en and suggests from the seeded global rules', async () => {
    const s = await signup(ctx);
    const cats = (await ctx.http().get('/api/v1/categories').set(s.auth)).body.data;
    expect(cats.length).toBeGreaterThanOrEqual(15);
    const transport = cats.find((c: any) => c.nameEn === 'Transport');
    expect(transport).toMatchObject({ nameVi: 'Di chuyển', type: 'EXPENSE' });
    expect((await ctx.http().post('/api/v1/categories/suggest').send({ note: 'Grab đi học' }).set(s.auth)).body.data.suggestions[0].categoryId).toBe(transport.id);
    const food = cats.find((c: any) => c.nameEn === 'Food & Drinks');
    expect((await ctx.http().post('/api/v1/categories/suggest').send({ note: 'Cà phê Phúc Long' }).set(s.auth)).body.data.suggestions[0].categoryId).toBe(food.id);
    expect((await ctx.http().post('/api/v1/categories/suggest').send({ note: 'xyz' }).set(s.auth)).body.data.suggestions).toEqual([]);
  });
});

describe('platform', () => {
  it('/health is 200 and unprefixed; errors use the { error: { code, message } } envelope', async () => {
    await ctx.http().get('/health').expect(200);
    const res = await ctx.http().get('/api/v1/wallets').expect(401);
    expect(res.body.error).toHaveProperty('code');
    expect(res.body.error).toHaveProperty('message');
  });
});
