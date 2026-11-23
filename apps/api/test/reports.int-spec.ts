import { ByCategoryOut, DailyOut, DashboardOut, TrendOut, currentBudgetPeriod, formatPeriod, shiftPeriodStart } from '@smartwallet/shared';
import { Ctx, Session, createCtx, expectShape, mkBudget, mkTxn, mkWallet, now, premium, signup, systemCategory } from './helpers';

let ctx: Ctx;
let s: Session;
beforeAll(async () => { ctx = await createCtx(); });
afterAll(async () => { await ctx.app.close(); });
beforeEach(async () => { s = await signup(ctx); });

const R = '/api/v1/reports';
const cur = currentBudgetPeriod(new Date(), 1).periodStart;
const label = (months: number) => formatPeriod(shiftPeriodStart(cur, months));
const DAY = 86_400_000;
const insert = (userId: string, walletId: string, type: 'INCOME' | 'EXPENSE', amount: number, at: Date | string, categoryId: string | null = null, note: string | null = null) =>
  ctx.prisma.transaction.create({ data: { userId, walletId, type, amount: BigInt(amount), categoryId, note, occurredAt: new Date(at) } });
const get = (u: Session, path: string) => ctx.http().get(`${R}${path}`).set(u.auth);

async function populate(u: Session) {
  const w = await mkWallet(ctx, u, { name: 'Cash', openingBalance: 1_000_000 });
  const bank = await mkWallet(ctx, u, { name: 'Bank' });
  const food = await systemCategory(ctx, u, 'EXPENSE', 'Food & Drinks');
  const transport = await systemCategory(ctx, u, 'EXPENSE', 'Transport');
  const salary = await systemCategory(ctx, u, 'INCOME', 'Salary');
  await mkTxn(ctx, u, w.id, { type: 'INCOME', amount: 10_000_000, categoryId: salary });
  await mkTxn(ctx, u, w.id, { amount: 600_000, categoryId: food, note: 'Phở' });
  await mkTxn(ctx, u, w.id, { amount: 300_000, categoryId: transport });
  await mkTxn(ctx, u, w.id, { amount: 100_000 }); // uncategorised
  await ctx.http().post('/api/v1/transactions/transfer').set(u.auth).send({ fromWalletId: w.id, toWalletId: bank.id, amount: 2_000_000, occurredAt: now() }).expect(201);
  return { w, bank, food, transport, salary };
}

describe('GET /reports/dashboard (RPT-01)', () => {
  it('returns the whole dashboard in ONE call; matches the documented schema; transfers are excluded from income/expense', async () => {
    const { food, transport } = await populate(s);
    await mkBudget(ctx, s, food, 1_000_000);
    await ctx.http().post('/api/v1/goals').set(s.auth).send({ name: 'Laptop', targetAmount: 20_000_000 }).expect(201);
    const res = await get(s, '/dashboard').expect(200);
    expectShape(DashboardOut, res.body.data);
    const d = res.body.data;
    expect(d.period.label).toBe(label(0));
    expect(d.totals).toEqual({ income: 10_000_000, expense: 1_000_000, net: 9_000_000, savingsRate: 90 });
    expect(d.wallets.total).toBe(1_000_000 + 10_000_000 - 1_000_000); // transfers move money between wallets, the total is unchanged
    expect(d.wallets.items.map((w: any) => [w.name, w.balance])).toEqual([['Cash', 8_000_000], ['Bank', 2_000_000]]);
    expect(d.budgets).toHaveLength(1);
    expect(d.budgets[0]).toMatchObject({ categoryId: food, spent: 600_000, percentUsed: 60 });
    expect(d.topCategories.map((c: any) => [c.nameEn, c.total, c.percent])).toEqual([['Food & Drinks', 600_000, 60], ['Transport', 300_000, 30], ['Uncategorized', 100_000, 10]]);
    expect(d.topCategories[1].categoryId).toBe(transport);
    expect(d.dailySpending.length).toBeGreaterThanOrEqual(28);
    expect(d.dailySpending.reduce((a: number, x: any) => a + x.expense, 0)).toBe(1_000_000);
    expect(d.trend).toHaveLength(6);
    expect(d.trend[5]).toMatchObject({ period: label(0), income: 10_000_000, expense: 1_000_000 });
    expect(d.goals).toHaveLength(1);
    expect(d.recentTransactions).toHaveLength(5);
    expect(new Date(d.recentTransactions[0].occurredAt).getTime()).toBeGreaterThanOrEqual(new Date(d.recentTransactions[4].occurredAt).getTime());
  });

  it('an empty account gets a valid, zeroed dashboard', async () => {
    const res = await get(s, '/dashboard').expect(200);
    expectShape(DashboardOut, res.body.data);
    expect(res.body.data.totals).toEqual({ income: 0, expense: 0, net: 0, savingsRate: null });
  });

  it('is cached for 60 s: the second call returns the same snapshot even if the data changed behind the API\'s back; it expires after 60 s', async () => {
    const { w } = await populate(s);
    const first = (await get(s, '/dashboard').expect(200)).body.data;
    const key = (await ctx.redis.client.keys(`report:${s.userId}:*:dashboard:${label(0)}`))[0];
    expect(key).toBeTruthy();
    const ttl = await ctx.redis.client.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
    await insert(s.userId, w.id, 'EXPENSE', 5_000_000, new Date()); // no domain event: invisible until the cache expires
    const second = (await get(s, '/dashboard').expect(200)).body.data;
    expect(second.generatedAt).toBe(first.generatedAt);
    expect(second.totals.expense).toBe(1_000_000);
    await ctx.redis.client.del(key); // = the 60 s elapsing
    const third = (await get(s, '/dashboard').expect(200)).body.data;
    expect(third.generatedAt).not.toBe(first.generatedAt);
    expect(third.totals.expense).toBe(6_000_000);
  });

  it('every money write drops the cache at once (transaction, wallet, budget and goal changes)', async () => {
    const { w } = await populate(s);
    const snap = async () => (await get(s, '/dashboard').expect(200)).body.data;
    let prev = await snap();
    await mkTxn(ctx, s, w.id, { amount: 50_000 });
    let cur2 = await snap();
    expect(cur2.totals.expense).toBe(1_050_000);
    expect(cur2.generatedAt).not.toBe(prev.generatedAt);
    prev = cur2;
    await mkBudget(ctx, s, null, 5_000_000);
    cur2 = await snap();
    expect(cur2.budgets).toHaveLength(1);
    prev = cur2;
    await ctx.http().post('/api/v1/goals').set(s.auth).send({ name: 'g', targetAmount: 100 }).expect(201);
    cur2 = await snap();
    expect(cur2.goals).toHaveLength(1);
    const goalId = cur2.goals[0].id;
    await ctx.http().post(`/api/v1/goals/${goalId}/contributions`).set(s.auth).send({ amount: 40 }).expect(201);
    expect((await snap()).goals[0].savedAmount).toBe(40);
    await ctx.http().patch(`/api/v1/wallets/${w.id}`).set(s.auth).send({ openingBalance: 0 }).expect(200);
    expect((await snap()).wallets.items[0].balance).toBe(10_000_000 - 1_050_000 - 2_000_000); // opening balance 0 + income - expenses - transfer out
    void prev;
  });

  it('is cached per user and per period', async () => {
    await populate(s);
    await premium(ctx, s);
    const a = (await get(s, '/dashboard').expect(200)).body.data;
    const b = (await get(s, `/dashboard?period=${label(-1)}`).expect(200)).body.data;
    expect(b.period.label).toBe(label(-1));
    expect(b.totals.expense).toBe(0);
    expect(a.totals.expense).toBe(1_000_000);
    const other = await signup(ctx);
    expect((await get(other, '/dashboard').expect(200)).body.data.totals.expense).toBe(0);
  });

  it('400 bad period / unknown params; 401 anonymous', async () => {
    for (const q of ['?period=2026-13', '?period=x', '?foo=1']) await get(s, `/dashboard${q}`).expect(400);
    await ctx.http().get(`${R}/dashboard`).expect(401);
  });
});

describe('GET /reports/by-category (RPT-02)', () => {
  it('ranks categories for the donut chart with their share, including uncategorised', async () => {
    await populate(s);
    const res = await get(s, '/by-category').expect(200);
    expectShape(ByCategoryOut, res.body.data);
    expect(res.body.data).toMatchObject({ type: 'EXPENSE', total: 1_000_000 });
    expect(res.body.data.items.map((i: any) => [i.nameEn, i.nameVi, i.total, i.count, i.percent])).toEqual([
      ['Food & Drinks', 'Ăn uống', 600_000, 1, 60], ['Transport', 'Di chuyển', 300_000, 1, 30], ['Uncategorized', 'Chưa phân loại', 100_000, 1, 10],
    ]);
  });
  it('type=INCOME; another period; transfers never appear', async () => {
    await populate(s);
    const inc = (await get(s, '/by-category?type=INCOME').expect(200)).body.data;
    expect(inc).toMatchObject({ type: 'INCOME', total: 10_000_000 });
    expect(inc.items).toHaveLength(1);
    expect((await get(s, `/by-category?period=${label(-1)}`).expect(200)).body.data).toMatchObject({ total: 0, items: [] });
  });
  it('sub-categories are listed with their parent id (for roll-up in the UI)', async () => {
    const w = await mkWallet(ctx, s);
    const food = await systemCategory(ctx, s, 'EXPENSE', 'Food & Drinks');
    const sub = (await ctx.http().post('/api/v1/categories').set(s.auth).send({ nameVi: 'Cà phê', nameEn: 'Coffee', type: 'EXPENSE', parentId: food }).expect(201)).body.data.id;
    await mkTxn(ctx, s, w.id, { categoryId: sub, amount: 10_000 });
    expect((await get(s, '/by-category').expect(200)).body.data.items[0]).toMatchObject({ categoryId: sub, parentId: food, nameEn: 'Coffee' });
  });
  it('400: bad type/period/params; 401', async () => {
    for (const q of ['?type=TRANSFER', '?period=2026-00', '?x=1']) await get(s, `/by-category${q}`).expect(400);
    await ctx.http().get(`${R}/by-category`).expect(401);
  });
});

describe('GET /reports/trend (RPT-02, Free: 6 months of history)', () => {
  it('returns one point per period, oldest first, with income, expense and net', async () => {
    const w = await mkWallet(ctx, s);
    await insert(s.userId, w.id, 'EXPENSE', 200_000, new Date(shiftPeriodStart(cur, -1).getTime() + 5 * DAY));
    await insert(s.userId, w.id, 'INCOME', 900_000, new Date(shiftPeriodStart(cur, -1).getTime() + 6 * DAY));
    await mkTxn(ctx, s, w.id, { amount: 50_000 });
    const res = await get(s, '/trend?months=3').expect(200);
    expectShape(TrendOut, res.body.data);
    expect(res.body.data.points.map((p: any) => p.period)).toEqual([label(-2), label(-1), label(0)]);
    expect(res.body.data.points[1]).toMatchObject({ income: 900_000, expense: 200_000, net: 700_000 });
    expect(res.body.data.points[2]).toMatchObject({ income: 0, expense: 50_000, net: -50_000 });
    expect((await get(s, '/trend').expect(200)).body.data.months).toBe(6); // default 6
  });
  it('Free: 7-12 months is 403 PLAN_LIMIT_REACHED; 6 is fine; Premium may ask for 12', async () => {
    await get(s, '/trend?months=6').expect(200);
    for (const m of [7, 12]) {
      const res = await get(s, `/trend?months=${m}`).expect(403);
      expect(res.body.error).toMatchObject({ code: 'PLAN_LIMIT_REACHED', details: { key: 'history_months', limit: 6 } });
    }
    await premium(ctx, s);
    expect((await get(s, '/trend?months=12').expect(200)).body.data.points).toHaveLength(12);
  });
  it('400: 0, 13, text, unknown params; 401', async () => {
    for (const q of ['?months=0', '?months=13', '?months=abc', '?months=1.5', '?foo=1']) await get(s, `/trend${q}`).expect(400);
    await ctx.http().get(`${R}/trend`).expect(401);
  });
});

describe('GET /reports/daily (RPT-02)', () => {
  it('has an entry for EVERY day of the period, zero-filled; today\'s spending lands on today', async () => {
    const w = await mkWallet(ctx, s);
    await mkTxn(ctx, s, w.id, { amount: 70_000 });
    await mkTxn(ctx, s, w.id, { type: 'INCOME', amount: 300_000 });
    const res = await get(s, '/daily').expect(200);
    expectShape(DailyOut, res.body.data);
    const days = res.body.data.days;
    expect(days.length).toBeGreaterThanOrEqual(28);
    const todayVn = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
    expect(days.find((d: any) => d.date === todayVn)).toEqual({ date: todayVn, income: 300_000, expense: 70_000 });
    expect(days.filter((d: any) => d.expense === 0 && d.income === 0).length).toBe(days.length - 1);
    expect(days[0].date < days[days.length - 1].date).toBe(true);
  });
  it('uses Vietnam calendar days: 23:59 and 00:30 around midnight fall on different days (Premium, fixed past period)', async () => {
    await premium(ctx, s);
    const w = await mkWallet(ctx, s);
    await insert(s.userId, w.id, 'EXPENSE', 11_000, '2026-03-10T16:59:00Z'); // 10 Mar 23:59 in Vietnam
    await insert(s.userId, w.id, 'EXPENSE', 22_000, '2026-03-10T17:30:00Z'); // 11 Mar 00:30 in Vietnam
    const days = (await get(s, '/daily?period=2026-03').expect(200)).body.data.days;
    expect(days).toHaveLength(31);
    expect(days.find((d: any) => d.date === '2026-03-10').expense).toBe(11_000);
    expect(days.find((d: any) => d.date === '2026-03-11').expense).toBe(22_000);
  });
  it('respects month_start_day: with day 5 the period runs 5th .. 4th', async () => {
    await premium(ctx, s);
    await ctx.http().patch('/api/v1/me').set(s.auth).send({ monthStartDay: 5 }).expect(200);
    const days = (await get(s, '/daily?period=2026-03').expect(200)).body.data.days;
    expect(days[0].date).toBe('2026-03-05');
    expect(days[days.length - 1].date).toBe('2026-04-04');
  });
  it('400/401', async () => {
    await get(s, '/daily?period=nope').expect(400);
    await ctx.http().get(`${R}/daily`).expect(401);
  });
});

describe('Free plan: 6 months of report history (RPT)', () => {
  it('the current period and the 5 before it are readable; older periods are 403 PLAN_LIMIT_REACHED on every report', async () => {
    const oldest = label(-5);
    const tooOld = label(-6);
    for (const path of ['/dashboard', '/by-category', '/daily']) {
      await get(s, `${path}?period=${oldest}`).expect(200);
      const res = await get(s, `${path}?period=${tooOld}`).expect(403);
      expect(res.body.error).toMatchObject({ code: 'PLAN_LIMIT_REACHED', details: { key: 'history_months', limit: 6, oldestPeriod: oldest } });
    }
    await get(s, '/export?period=' + tooOld).expect(403);
  });
  it('Premium has unlimited history, and upgrading takes effect immediately', async () => {
    await get(s, `/dashboard?period=2020-01`).expect(403);
    await premium(ctx, s);
    await get(s, `/dashboard?period=2020-01`).expect(200);
    await get(s, `/daily?period=2020-01`).expect(200);
  });
});

describe('GET /reports/export?format=csv (RPT-03, Premium)', () => {
  it('Free users get 403 PLAN_LIMIT_REACHED', async () => {
    const res = await get(s, '/export?format=csv').expect(403);
    expect(res.body.error).toMatchObject({ code: 'PLAN_LIMIT_REACHED', details: { feature: 'csv_export' } });
  });

  it('Premium downloads the period as a UTF-8 CSV (with BOM) attachment: Vietnam-local times, names, formula-safe', async () => {
    await premium(ctx, s);
    const { w, food } = await populate(s);
    await mkTxn(ctx, s, w.id, { amount: 1_000, note: '=HYPERLINK("http://evil")' });
    await mkTxn(ctx, s, w.id, { amount: 2_000, note: 'Cơm, canh "ngon"', categoryId: food });
    const res = await get(s, '/export?format=csv').buffer(true).expect(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv; charset=utf-8/);
    expect(res.headers['content-disposition']).toBe(`attachment; filename="smartwallet-${label(0)}.csv"`);
    const text: string = res.text;
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe('date,type,amount,wallet,to_wallet,category,note,source');
    expect(lines).toHaveLength(1 + 7); // header + 4 populated + transfer + 2 extra
    expect(lines.some((l) => l.includes(',INCOME,10000000,Cash,,Lương,'))).toBe(true);
    expect(lines.some((l) => l.includes(',TRANSFER,2000000,Cash,Bank,,'))).toBe(true);
    expect(lines.some((l) => l.includes(',EXPENSE,600000,Cash,,Ăn uống,Phở,MANUAL'))).toBe(true);
    expect(lines.some((l) => l.includes(`"Cơm, canh ""ngon"""`))).toBe(true); // quoting
    expect(lines.some((l) => l.includes(`"'=HYPERLINK(""http://evil"")"`))).toBe(true); // formula injection neutralised
    expect(lines.every((l) => !/^[=+\-@]/.test(l))).toBe(true);
    expect(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2},/.test(lines[1])).toBe(true);
  });

  it('exports only MY transactions of the requested period; English category names for an English user', async () => {
    await premium(ctx, s);
    await ctx.http().patch('/api/v1/me').set(s.auth).send({ locale: 'en' }).expect(200);
    await populate(s);
    const other = await signup(ctx);
    await populate(other);
    const w2 = await mkWallet(ctx, s, { name: 'Old' });
    await insert(s.userId, w2.id, 'EXPENSE', 123, new Date(shiftPeriodStart(cur, -1).getTime() + 3 * DAY));
    const mine = (await get(s, '/export').buffer(true).expect(200)).text;
    expect(mine).toContain('Food & Drinks');
    expect(mine).not.toContain(',123,Old,');
    expect(mine.split('\r\n').filter(Boolean)).toHaveLength(1 + 5);
    const prev = (await get(s, `/export?period=${label(-1)}`).buffer(true).expect(200)).text;
    expect(prev).toContain(',123,Old,');
    expect(prev.split('\r\n').filter(Boolean)).toHaveLength(2);
  });

  it('deleted transactions are not exported; an empty period is just the header', async () => {
    await premium(ctx, s);
    const w = await mkWallet(ctx, s);
    const t = await mkTxn(ctx, s, w.id, { amount: 777 });
    await ctx.http().delete(`/api/v1/transactions/${t.id}`).set(s.auth).expect(204);
    const text = (await get(s, '/export').buffer(true).expect(200)).text;
    expect(text.slice(1).trim()).toBe('date,type,amount,wallet,to_wallet,category,note,source');
  });

  it('400 for unsupported formats / unknown params; 401 anonymous', async () => {
    await premium(ctx, s);
    for (const q of ['?format=pdf', '?format=xlsx', '?foo=1', '?period=bad']) await get(s, `/export${q}`).expect(400);
    await ctx.http().get(`${R}/export`).expect(401);
  });
});
