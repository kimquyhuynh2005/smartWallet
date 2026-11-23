import { ApplyTemplateOut, BudgetOut, RolloverOut, currentBudgetPeriod, formatPeriod, shiftPeriodStart } from '@smartwallet/shared';
import { Ctx, Session, createCtx, expectShape, mkBudget, mkTxn, mkWallet, now, premium, signup, systemCategory } from './helpers';

let ctx: Ctx;
let s: Session;
beforeAll(async () => { ctx = await createCtx(); });
afterAll(async () => { await ctx.app.close(); });
beforeEach(async () => { s = await signup(ctx); });

const B = '/api/v1/budgets';
const cur = currentBudgetPeriod(new Date(), 1).periodStart;
const label = (months: number) => formatPeriod(shiftPeriodStart(cur, months));
const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
const insertExpense = (userId: string, walletId: string, categoryId: string | null, amount: number, occurredAt: string) =>
  ctx.prisma.transaction.create({ data: { userId, walletId, categoryId, type: 'EXPENSE', amount: BigInt(amount), occurredAt: new Date(occurredAt) } });

describe('GET /budgets?period=YYYY-MM (BUD-04)', () => {
  it('returns each budget with spent, remaining, percentUsed, safeToSpendToday and daysLeft; schema-valid', async () => {
    const w = await mkWallet(ctx, s);
    const food = await systemCategory(ctx, s, 'EXPENSE', 'Food & Drinks');
    await mkBudget(ctx, s, food, 2_000_000);
    await mkBudget(ctx, s, null, 5_000_000);
    await mkTxn(ctx, s, w.id, { categoryId: food, amount: 500_000 });
    await mkTxn(ctx, s, w.id, { amount: 250_000 }); // uncategorised: only the total budget sees it
    const res = await ctx.http().get(B).set(s.auth).expect(200);
    res.body.data.forEach((b: unknown) => expectShape(BudgetOut, b));
    const total = res.body.data.find((b: any) => b.categoryId === null);
    const foodB = res.body.data.find((b: any) => b.categoryId === food);
    expect(res.body.data[0].categoryId).toBeNull(); // total budget listed first
    expect(foodB).toMatchObject({ limitAmount: 2_000_000, spent: 500_000, remaining: 1_500_000, percentUsed: 25, period: formatPeriod(cur) });
    expect(total).toMatchObject({ limitAmount: 5_000_000, spent: 750_000, remaining: 4_250_000, percentUsed: 15 });
    expect(foodB.daysLeft).toBeGreaterThanOrEqual(1);
    expect(foodB.safeToSpendToday).toBe(Math.floor(1_500_000 / foodB.daysLeft)); // (limit - spent) / daysLeftInPeriod
  });

  it('period=YYYY-MM selects another period: spending is counted inside THAT period only; a finished period has 0 days left', async () => {
    await premium(ctx, s);
    const w = await mkWallet(ctx, s);
    const food = await systemCategory(ctx, s, 'EXPENSE', 'Food & Drinks');
    const prev = label(-1);
    await mkBudget(ctx, s, food, 1_000_000, { period: prev });
    const prevStart = shiftPeriodStart(cur, -1);
    await insertExpense(s.userId, w.id, food, 300_000, new Date(prevStart.getTime() + 10 * 86_400_000).toISOString());
    await mkTxn(ctx, s, w.id, { categoryId: food, amount: 999_000 }); // this month: must not count in the previous period
    const res = await ctx.http().get(`${B}?period=${prev}`).set(s.auth).expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ period: prev, spent: 300_000, percentUsed: 30, remaining: 700_000, daysLeft: 0, safeToSpendToday: 0 });
    expect((await ctx.http().get(B).set(s.auth)).body.data).toEqual([]); // the current period has no budgets
  });

  it('a future period counts all its days so you can plan ahead', async () => {
    const next = label(1);
    await mkBudget(ctx, s, null, 3_100_000, { period: next });
    const b = (await ctx.http().get(`${B}?period=${next}`).set(s.auth).expect(200)).body.data[0];
    expect(b.spent).toBe(0);
    expect(b.daysLeft).toBeGreaterThanOrEqual(28);
    expect(b.safeToSpendToday).toBe(Math.floor(3_100_000 / b.daysLeft));
  });

  it('respects month_start_day: with day 5 the period containing today starts on the 5th', async () => {
    await ctx.http().patch('/api/v1/me').set(s.auth).send({ monthStartDay: 5 }).expect(200);
    const todayVn = new Date(Date.now() + 7 * 3_600_000);
    const expectedStart = new Date(Date.UTC(todayVn.getUTCFullYear(), todayVn.getUTCMonth() - (todayVn.getUTCDate() >= 5 ? 0 : 1), 5));
    await mkBudget(ctx, s, null, 1_000_000);
    const b = (await ctx.http().get(B).set(s.auth)).body.data[0];
    expect(b.period).toBe(formatPeriod(expectedStart));
    expect(b.periodStartsAt).toBe(new Date(expectedStart.getTime() - 7 * 3_600_000).toISOString());
    expect(new Date(b.periodEndsAt).getTime() - new Date(b.periodStartsAt).getTime()).toBeGreaterThanOrEqual(28 * 86_400_000);
    const w = await mkWallet(ctx, s);
    await mkTxn(ctx, s, w.id, { amount: 100_000 });
    expect((await ctx.http().get(B).set(s.auth)).body.data[0].spent).toBe(100_000);
  });

  it('a category budget includes the spending of its sub-categories', async () => {
    const w = await mkWallet(ctx, s);
    const food = await systemCategory(ctx, s, 'EXPENSE', 'Food & Drinks');
    const sub = (await ctx.http().post('/api/v1/categories').set(s.auth).send({ nameVi: 'Cà phê', nameEn: 'Coffee', type: 'EXPENSE', parentId: food }).expect(201)).body.data.id;
    await mkBudget(ctx, s, food, 1_000_000);
    await mkTxn(ctx, s, w.id, { categoryId: sub, amount: 200_000 });
    await mkTxn(ctx, s, w.id, { categoryId: food, amount: 100_000 });
    expect((await ctx.http().get(B).set(s.auth)).body.data[0].spent).toBe(300_000);
  });

  it('transfers and income never count as spending', async () => {
    const a = await mkWallet(ctx, s, { name: 'A' });
    const b = await mkWallet(ctx, s, { name: 'B' });
    await mkBudget(ctx, s, null, 1_000_000);
    await mkTxn(ctx, s, a.id, { type: 'INCOME', amount: 9_000_000 });
    await ctx.http().post('/api/v1/transactions/transfer').set(s.auth).send({ fromWalletId: a.id, toWalletId: b.id, amount: 500_000, occurredAt: now() }).expect(201);
    expect((await ctx.http().get(B).set(s.auth)).body.data[0]).toMatchObject({ spent: 0, percentUsed: 0 });
  });

  it('400 for a bad period or unknown params; 401 anonymous; budgets are per user', async () => {
    for (const q of ['period=2026-13', 'period=abc', 'period=2026-1', 'foo=1']) await ctx.http().get(`${B}?${q}`).set(s.auth).expect(400);
    await ctx.http().get(B).expect(401);
    await mkBudget(ctx, s, null, 1000);
    expect((await ctx.http().get(B).set((await signup(ctx)).auth)).body.data).toEqual([]);
  });
});

describe('POST /budgets (BUD-01) with periods and plan limits', () => {
  it('201 with a period; 409 for the same category and period; the same category in another period is fine', async () => {
    const food = await systemCategory(ctx, s, 'EXPENSE', 'Food & Drinks');
    const res = await ctx.http().post(B).set(s.auth).send({ categoryId: food, limitAmount: 1_000_000, period: label(1), rolloverMode: 'CARRY_FORWARD' }).expect(201);
    expectShape(BudgetOut, res.body.data);
    expect(res.body.data).toMatchObject({ period: label(1), rolloverMode: 'CARRY_FORWARD', rolloverAmount: 0, alertThresholds: [80, 100] });
    expect((await ctx.http().post(B).set(s.auth).send({ categoryId: food, limitAmount: 5, period: label(1) }).expect(409)).body.error.code).toBe('BUDGET_EXISTS');
    await ctx.http().post(B).set(s.auth).send({ categoryId: food, limitAmount: 5, period: label(2) }).expect(201);
  });
  it('the Free limit of 5 budgets is per period (403 PLAN_LIMIT_REACHED on the 6th in the SAME period only)', async () => {
    const cats = (await ctx.http().get('/api/v1/categories?type=EXPENSE').set(s.auth)).body.data.slice(0, 6).map((c: any) => c.id);
    for (let i = 0; i < 5; i++) await mkBudget(ctx, s, cats[i], 1000);
    expect((await ctx.http().post(B).set(s.auth).send({ categoryId: cats[5], limitAmount: 1000 }).expect(403)).body.error).toMatchObject({ code: 'PLAN_LIMIT_REACHED', details: { key: 'max_budgets', limit: 5 } });
    await ctx.http().post(B).set(s.auth).send({ categoryId: cats[5], limitAmount: 1000, period: label(1) }).expect(201); // another period has its own count
    for (let i = 0; i < 4; i++) await ctx.http().post(B).set(s.auth).send({ categoryId: cats[i], limitAmount: 1000, period: label(1) }).expect(201); // 5 in next period now
    await ctx.http().post(B).set(s.auth).send({ categoryId: cats[4], limitAmount: 1000, period: label(1) }).expect(403);
  });
  it('400: bad period/rollover/thresholds/forbidden keys; 404 unknown or income category', async () => {
    for (const bad of [{ period: '2026-00' }, { rolloverMode: 'ALWAYS' }, { limitAmount: 0 }, { alertThresholds: [] }, { userId: s.userId }]) {
      await ctx.http().post(B).set(s.auth).send({ categoryId: null, limitAmount: 1000, ...bad }).expect(400);
    }
    await ctx.http().post(B).set(s.auth).send({ categoryId: '00000000-0000-4000-8000-000000000000', limitAmount: 1000 }).expect(404);
    await ctx.http().post(B).set(s.auth).send({ categoryId: await systemCategory(ctx, s, 'INCOME'), limitAmount: 1000 }).expect(404);
  });
});

describe('PATCH /budgets/:id', () => {
  it('200: changes the limit and rollover mode and returns fresh progress; Premium can set alert thresholds', async () => {
    const w = await mkWallet(ctx, s);
    const b = await mkBudget(ctx, s, null, 1_000_000);
    await mkTxn(ctx, s, w.id, { amount: 400_000 });
    const res = await ctx.http().patch(`${B}/${b.id}`).set(s.auth).send({ limitAmount: 2_000_000, rolloverMode: 'CARRY_FORWARD' }).expect(200);
    expectShape(BudgetOut, res.body.data);
    expect(res.body.data).toMatchObject({ limitAmount: 2_000_000, rolloverMode: 'CARRY_FORWARD', spent: 400_000, percentUsed: 20 });
    expect((await ctx.http().patch(`${B}/${b.id}`).set(s.auth).send({ alertThresholds: [50] }).expect(403)).body.error.code).toBe('PLAN_LIMIT_REACHED');
    await premium(ctx, s);
    expect((await ctx.http().patch(`${B}/${b.id}`).set(s.auth).send({ alertThresholds: [50, 90] }).expect(200)).body.data.alertThresholds).toEqual([50, 90]);
  });
  it('400 empty/invalid/unknown; 404 for other users\' and malformed ids; 401', async () => {
    const b = await mkBudget(ctx, s, null, 1000);
    for (const bad of [{}, { limitAmount: 0 }, { limitAmount: 1.5 }, { categoryId: null }, { period: '2026-01' }, { rolloverMode: 'X' }]) await ctx.http().patch(`${B}/${b.id}`).set(s.auth).send(bad).expect(400);
    await ctx.http().patch(`${B}/${b.id}`).set((await signup(ctx)).auth).send({ limitAmount: 5 }).expect(404);
    await ctx.http().patch(`${B}/nope`).set(s.auth).send({ limitAmount: 5 }).expect(404);
    await ctx.http().patch(`${B}/${b.id}`).send({ limitAmount: 5 }).expect(401);
  });
});

describe('POST /budgets/apply-template (BUD-02)', () => {
  const apply = (u: Session, body: object) => ctx.http().post(`${B}/apply-template`).set(u.auth).send({ template: '50_30_20', monthlyIncome: 10_000_000, ...body });
  const byName = async (u: Session, res: any) => {
    const cats = (await ctx.http().get('/api/v1/categories').set(u.auth)).body.data as any[];
    return Object.fromEntries(res.body.data.budgets.map((b: any) => [b.categoryId === null ? 'TOTAL' : cats.find((c) => c.id === b.categoryId).nameEn, b.limitAmount]));
  };

  it('Premium, new user: 50/30/20 splits needs and wants evenly; savings is reserved, not budgeted', async () => {
    await premium(ctx, s);
    const res = await apply(s, {}).expect(200);
    expectShape(ApplyTemplateOut, res.body.data);
    expect(res.body.data).toMatchObject({ template: '50_30_20', totalBudget: 8_000_000, reservedForSavings: 2_000_000, created: 7, updated: 0, skipped: 0, truncatedByPlan: 0 });
    expect(await byName(s, res)).toEqual({ TOTAL: 8_000_000, Housing: 1_250_000, 'Food & Drinks': 1_250_000, Transport: 1_250_000, Bills: 1_250_000, Shopping: 1_500_000, Entertainment: 1_500_000 });
  });

  it('splits inside a group by the user\'s last 3 months of spending, rounded to 1,000 VND', async () => {
    await premium(ctx, s);
    const w = await mkWallet(ctx, s);
    const ago = daysFromNow(-45); // earlier than the current period, inside the 3 periods before it
    for (const [cat, amount] of [['Housing', 3_000_000], ['Food & Drinks', 1_000_000], ['Transport', 500_000], ['Bills', 500_000]] as const) {
      await insertExpense(s.userId, w.id, await systemCategory(ctx, s, 'EXPENSE', cat), amount, ago);
    }
    await insertExpense(s.userId, w.id, await systemCategory(ctx, s, 'EXPENSE', 'Shopping'), 100_000, daysFromNow(-400)); // outside the 3-period window: ignored
    const res = await apply(s, {}).expect(200);
    const got = await byName(s, res);
    expect(got).toMatchObject({ TOTAL: 8_000_000, Housing: 3_000_000, 'Food & Drinks': 1_000_000, Transport: 500_000, Bills: 500_000, Shopping: 1_500_000, Entertainment: 1_500_000 });
    expect(Object.values(got).every((v: any) => v % 1000 === 0)).toBe(true);
  });

  it('6 Jars: 55% necessities, 10% education, 10% play, 5% give are budgeted; the two 10% savings jars are reserved', async () => {
    await premium(ctx, s);
    const res = await apply(s, { template: '6_JARS', monthlyIncome: 20_000_000 }).expect(200);
    expect(res.body.data).toMatchObject({ template: '6_JARS', totalBudget: 16_000_000, reservedForSavings: 4_000_000 });
    const got = await byName(s, res);
    expect(got['Education']).toBe(2_000_000);
    expect(got['Gifts']).toBe(1_000_000);
    expect(got['Entertainment'] + got['Shopping']).toBe(2_000_000);
    expect(['Housing', 'Food & Drinks', 'Transport', 'Bills', 'Health'].reduce((a, k) => a + got[k], 0)).toBe(11_000_000);
  });

  it('CUSTOM percentages must total 100: 400 otherwise; a valid custom plan is applied', async () => {
    await premium(ctx, s);
    const housing = await systemCategory(ctx, s, 'EXPENSE', 'Housing');
    const bills = await systemCategory(ctx, s, 'EXPENSE', 'Bills');
    const groups = (a: number, b: number) => [{ name: 'core', percent: a, categoryIds: [housing, bills] }, { name: 'savings', percent: b, categoryIds: [] }];
    for (const [a, b] of [[60, 39], [60, 41], [50, 49]]) {
      const res = await apply(s, { template: 'CUSTOM', groups: groups(a, b) }).expect(400);
      expect(JSON.stringify(res.body.error.details)).toContain('must total 100');
    }
    const ok = await apply(s, { template: 'CUSTOM', groups: groups(60, 40) }).expect(200);
    expect(ok.body.data).toMatchObject({ totalBudget: 6_000_000, reservedForSavings: 4_000_000, created: 3 });
    expect(await byName(s, ok)).toEqual({ TOTAL: 6_000_000, Housing: 3_000_000, Bills: 3_000_000 });
  });

  it('custom: 422 DUPLICATE_CATEGORY, 404 unknown category, 422 income category, 400 groups without CUSTOM', async () => {
    const housing = await systemCategory(ctx, s, 'EXPENSE', 'Housing');
    const g = (ids: string[][]) => ids.map((categoryIds, i) => ({ name: `g${i}`, percent: 100 / ids.length, categoryIds }));
    expect((await apply(s, { template: 'CUSTOM', groups: g([[housing], [housing]]) }).expect(422)).body.error.code).toBe('DUPLICATE_CATEGORY');
    await apply(s, { template: 'CUSTOM', groups: g([['00000000-0000-4000-8000-000000000000']]) }).expect(404);
    expect((await apply(s, { template: 'CUSTOM', groups: g([[await systemCategory(ctx, s, 'INCOME')]]) }).expect(422)).body.error.code).toBe('CATEGORY_TYPE_MISMATCH');
    await apply(s, { template: '50_30_20', groups: g([[housing]]) }).expect(400);
    await apply(s, { template: 'CUSTOM' }).expect(400);
  });

  it('Free plan: the total and the biggest budgets are created until the 5-budget limit; the rest are reported as truncated', async () => {
    const res = await apply(s, {}).expect(200);
    expect(res.body.data).toMatchObject({ created: 5, truncatedByPlan: 2 });
    expect(res.body.data.budgets).toHaveLength(5);
    expect(res.body.data.budgets[0].categoryId).toBeNull();
  });

  it('existing budgets are kept unless overwrite=true (then only their limit changes); re-applying never duplicates', async () => {
    await premium(ctx, s);
    const housing = await systemCategory(ctx, s, 'EXPENSE', 'Housing');
    await mkBudget(ctx, s, housing, 111_000);
    const keep = await apply(s, {}).expect(200);
    expect(keep.body.data).toMatchObject({ skipped: 1, created: 6 });
    expect((await byName(s, keep))['Housing']).toBe(111_000);
    const over = await apply(s, { overwrite: true }).expect(200);
    expect(over.body.data).toMatchObject({ updated: 7, created: 0 });
    expect((await byName(s, over))['Housing']).toBe(1_250_000);
    expect((await ctx.http().get(B).set(s.auth)).body.data).toHaveLength(7);
  });

  it('applies to another period and revives deleted budgets', async () => {
    await premium(ctx, s);
    const first = await apply(s, { period: label(1) }).expect(200);
    expect(first.body.data.period).toBe(label(1));
    await ctx.http().delete(`${B}/${first.body.data.budgets[1].id}`).set(s.auth).expect(204);
    const again = await apply(s, { period: label(1) }).expect(200);
    expect(again.body.data).toMatchObject({ created: 1, skipped: 6 });
    expect((await ctx.http().get(`${B}?period=${label(1)}`).set(s.auth)).body.data).toHaveLength(7);
  });

  it('400: bad income/period/keys; 401 anonymous', async () => {
    for (const bad of [{ monthlyIncome: 0 }, { monthlyIncome: 1.5 }, { period: '2026-99' }, { template: 'RANDOM' }, { userId: 'x' }, { overwrite: 'yes' }]) await apply(s, bad).expect(400);
    await ctx.http().post(`${B}/apply-template`).send({ template: '50_30_20', monthlyIncome: 1 }).expect(401);
  });
});

describe('POST /budgets/rollover (BUD-03)', () => {
  const roll = (u: Session, body: object = {}) => ctx.http().post(`${B}/rollover`).set(u.auth).send(body);
  const prevLabel = label(-1);
  const inPrev = () => new Date(shiftPeriodStart(cur, -1).getTime() + 10 * 86_400_000).toISOString();

  it('carries the unspent part of last period into the new limit (CARRY_FORWARD) and copies NONE budgets at their base', async () => {
    await premium(ctx, s);
    const w = await mkWallet(ctx, s);
    const food = await systemCategory(ctx, s, 'EXPENSE', 'Food & Drinks');
    const bills = await systemCategory(ctx, s, 'EXPENSE', 'Bills');
    await mkBudget(ctx, s, food, 2_000_000, { period: prevLabel, rolloverMode: 'CARRY_FORWARD' });
    await mkBudget(ctx, s, bills, 700_000, { period: prevLabel, rolloverMode: 'NONE' });
    await insertExpense(s.userId, w.id, food, 1_500_000, inPrev());
    await insertExpense(s.userId, w.id, bills, 900_000, inPrev()); // overspent: NONE carries nothing anyway

    const res = await roll(s).expect(200);
    expectShape(RolloverOut, res.body.data);
    expect(res.body.data).toMatchObject({ period: formatPeriod(cur), from: prevLabel, created: 2, updated: 0, carriedOver: 500_000 });
    const list = (await ctx.http().get(B).set(s.auth)).body.data;
    expect(list.find((b: any) => b.categoryId === food)).toMatchObject({ limitAmount: 2_500_000, rolloverAmount: 500_000, rolloverMode: 'CARRY_FORWARD', spent: 0 });
    expect(list.find((b: any) => b.categoryId === bills)).toMatchObject({ limitAmount: 700_000, rolloverAmount: 0, rolloverMode: 'NONE' });
  });

  it('overspending carries nothing (never a negative amount)', async () => {
    const w = await mkWallet(ctx, s);
    await mkBudget(ctx, s, null, 1_000_000, { period: prevLabel, rolloverMode: 'CARRY_FORWARD' });
    await insertExpense(s.userId, w.id, null, 1_400_000, inPrev());
    await roll(s).expect(200);
    expect((await ctx.http().get(B).set(s.auth)).body.data[0]).toMatchObject({ limitAmount: 1_000_000, rolloverAmount: 0 });
  });

  it('is idempotent and never carries the same money twice; it chains correctly month after month', async () => {
    const w = await mkWallet(ctx, s);
    const bud = await mkBudget(ctx, s, null, 2_000_000, { period: label(-2), rolloverMode: 'CARRY_FORWARD' });
    await insertExpense(s.userId, w.id, null, 500_000, new Date(shiftPeriodStart(cur, -2).getTime() + 5 * 86_400_000).toISOString()); // leftover 1.5M
    await roll(s, { period: prevLabel }).expect(200); // -> previous period: limit 3.5M
    const second = await roll(s, { period: prevLabel }).expect(200); // again: same result, no extra carry
    expect(second.body.data).toMatchObject({ created: 0, updated: 1 });
    let list = (await ctx.http().get(`${B}?period=${prevLabel}`).set(s.auth)).body.data;
    expect(list[0]).toMatchObject({ limitAmount: 3_500_000, rolloverAmount: 1_500_000 });
    await insertExpense(s.userId, w.id, null, 1_000_000, inPrev()); // spend 1M of the 3.5M -> leftover 2.5M
    await roll(s).expect(200); // current period: base 2.0M + 2.5M = 4.5M (NOT 3.5M + 2.5M)
    list = (await ctx.http().get(B).set(s.auth)).body.data;
    expect(list[0]).toMatchObject({ limitAmount: 4_500_000, rolloverAmount: 2_500_000 });
    void bud;
  });

  it('keeps a manually edited base limit when re-run', async () => {
    const w = await mkWallet(ctx, s);
    await mkBudget(ctx, s, null, 1_000_000, { period: prevLabel, rolloverMode: 'CARRY_FORWARD' });
    await roll(s).expect(200); // current: 1.0M + 1.0M carried
    const cb = (await ctx.http().get(B).set(s.auth)).body.data[0];
    await ctx.http().patch(`${B}/${cb.id}`).set(s.auth).send({ limitAmount: cb.limitAmount + 500_000 }).expect(200); // user raises it by 500k
    await insertExpense(s.userId, w.id, null, 200_000, inPrev());
    await roll(s).expect(200); // leftover is now 800k
    expect((await ctx.http().get(B).set(s.auth)).body.data[0]).toMatchObject({ limitAmount: 1_500_000 + 800_000, rolloverAmount: 800_000 });
  });

  it('an existing NONE budget in the target period is left alone; the Free plan limit is respected', async () => {
    const cats = (await ctx.http().get('/api/v1/categories?type=EXPENSE').set(s.auth)).body.data.slice(0, 7).map((c: any) => c.id);
    await premium(ctx, s);
    for (const c of cats) await mkBudget(ctx, s, c, 100_000, { period: prevLabel });
    await ctx.http().post('/api/v1/subscriptions/mock-checkout').set(s.auth); // still Premium
    await ctx.prisma.subscription.updateMany({ where: { userId: s.userId, status: 'ACTIVE', plan: { code: 'PREMIUM' } }, data: { status: 'CANCELED' } }); // back to Free
    const res = await roll(s).expect(200);
    expect(res.body.data).toMatchObject({ created: 5, skippedForPlanLimit: 2 });
    expect((await roll(s).expect(200)).body.data).toMatchObject({ created: 0, skipped: 5 });
  });

  it('nothing to roll: 200 with zero counts; 400 bad period; 401 anonymous', async () => {
    expect((await roll(s).expect(200)).body.data).toMatchObject({ created: 0, updated: 0, skipped: 0, carriedOver: 0, budgets: [] });
    await roll(s, { period: '13-2026' }).expect(400);
    await roll(s, { foo: 1 }).expect(400);
    await ctx.http().post(`${B}/rollover`).send({}).expect(401);
  });

  it('only my own budgets roll over', async () => {
    const other = await signup(ctx);
    await mkBudget(ctx, other, null, 5_000_000, { period: prevLabel });
    expect((await roll(s).expect(200)).body.data.created).toBe(0);
    expect((await roll(other).expect(200)).body.data.created).toBe(1);
  });
});
