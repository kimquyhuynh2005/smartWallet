import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { BudgetsService } from '../budgets/budgets.service';
import { FakeRedis, UID, mockPrisma, user } from '../testing/mocks';
import { ReportCache } from '../common/report-cache.service';
import { EXPORT_MAX_ROWS, ReportsService, csvCell } from './reports.service';

const FREE = { code: 'FREE', limits: { max_wallets: 3, max_budgets: 5, max_goals: 2, history_months: 6 } };
const PREMIUM = { code: 'PREMIUM', limits: { max_wallets: null, max_budgets: null, max_goals: null, history_months: null } };

beforeAll(() => {
  // freeze "today" at 21 Nov 2026 (Vietnam) but leave timers alone so awaited mocks still resolve
  jest.useFakeTimers({ now: new Date('2026-11-21T05:00:00Z'), doNotFake: ['setTimeout', 'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval', 'clearImmediate', 'nextTick', 'queueMicrotask', 'performance', 'hrtime'] });
});
afterAll(() => jest.useRealTimers());

function setup(plan: any = FREE, monthStartDay = 1) {
  const prisma = mockPrisma(['transaction', 'category', 'user', 'wallet']);
  prisma.user.findUniqueOrThrow.mockResolvedValue({ monthStartDay, locale: 'vi' });
  prisma.transaction.groupBy.mockResolvedValue([]);
  prisma.$queryRaw.mockResolvedValue([]);
  prisma.category.findMany.mockResolvedValue([]);
  const budgetsSvc = new BudgetsService(prisma, { forUser: jest.fn(async () => plan) } as any, { bump: jest.fn() } as any);
  jest.spyOn(budgetsSvc, 'listForPeriod').mockResolvedValue([]);
  const plans: any = { forUser: jest.fn(async () => plan) };
  const redis = new FakeRedis();
  const cache = new ReportCache(redis as any);
  const wallets: any = { list: jest.fn(async () => [{ id: UID(1), name: 'Cash', type: 'CASH', balance: 700_000n }, { id: UID(2), name: 'Bank', type: 'BANK', balance: 300_000n }]) };
  const goals: any = { list: jest.fn(async () => [{ id: UID(3), status: 'ACTIVE' }, { id: UID(4), status: 'ACHIEVED' }]) };
  const txns: any = { list: jest.fn(async () => ({ items: [{ id: UID(5) }], meta: {} })) };
  return { svc: new ReportsService(prisma, budgetsSvc, plans, cache, wallets, goals, txns), prisma, redis, wallets, goals, txns };
}
const totalsRows = (income: bigint, expense: bigint) => [{ type: 'INCOME', _sum: { amount: income } }, { type: 'EXPENSE', _sum: { amount: expense } }];

describe('RPT history limit (Free = 6 months)', () => {
  it('Free may read the current period and the 5 before it, not older', async () => {
    const { svc } = setup();
    await expect(svc.daily(user, '2026-11')).resolves.toBeDefined();
    await expect(svc.daily(user, '2026-06')).resolves.toBeDefined(); // 6th period back is the oldest allowed
    const err: any = await svc.daily(user, '2026-05').catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.getResponse()).toMatchObject({ code: 'PLAN_LIMIT_REACHED', details: { key: 'history_months', limit: 6, oldestPeriod: '2026-06' } });
  });
  it('the window follows month_start_day', async () => {
    const { svc } = setup(FREE, 5); // today 21 Nov -> current period 2026-11 (started 5 Nov)
    await expect(svc.daily(user, '2026-06')).resolves.toBeDefined();
    await expect(svc.daily(user, '2026-05')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('Premium has no limit; future periods are allowed (they are simply empty)', async () => {
    const { svc } = setup(PREMIUM);
    await expect(svc.daily(user, '2020-01')).resolves.toBeDefined();
    await expect(setup().svc.daily(user, '2027-03')).resolves.toBeDefined();
  });
  it('the same rule guards dashboard, by-category and export', async () => {
    const { svc } = setup();
    await expect(svc.dashboard(user, '2025-01')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.byCategory(user, { period: '2025-01', type: 'EXPENSE' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.exportCsv(user, '2025-01')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('trend: Free can ask for 6 periods but 7-12 are PLAN_LIMIT_REACHED; Premium can have 12', async () => {
    const free = setup();
    await expect(free.svc.trend(user, 6)).resolves.toMatchObject({ months: 6 });
    await expect(free.svc.trend(user, 7)).rejects.toMatchObject({ response: { code: 'PLAN_LIMIT_REACHED', details: { key: 'history_months', limit: 6 } } });
    await expect(free.svc.trend(user, 12)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(setup(PREMIUM).svc.trend(user, 12)).resolves.toMatchObject({ months: 12 });
  });
});

describe('RPT-02 trend', () => {
  it('returns one point per period, oldest first, ending with the current period, each with its own window', async () => {
    const { svc, prisma } = setup();
    prisma.transaction.groupBy.mockResolvedValue(totalsRows(1_000_000n, 400_000n));
    const out = await svc.trend(user, 3);
    expect(out.points.map((p) => p.period)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(out.points[2]).toMatchObject({ income: 1_000_000, expense: 400_000, net: 600_000, start: new Date('2026-10-31T17:00:00Z') });
    const windows = prisma.transaction.groupBy.mock.calls.map((c: any[]) => c[0].where.occurredAt.gte.toISOString());
    expect(windows.sort()).toEqual(['2026-08-31T17:00:00.000Z', '2026-09-30T17:00:00.000Z', '2026-10-31T17:00:00.000Z']);
  });
  it('counts income and expense only (transfers never appear in reports)', async () => {
    const { svc, prisma } = setup();
    await svc.trend(user, 1);
    expect(prisma.transaction.groupBy.mock.calls[0][0].where).toMatchObject({ type: { in: ['INCOME', 'EXPENSE'] }, deletedAt: null, userId: 'u1' });
  });
});

describe('RPT-01 totals', () => {
  it('net and savings rate (rounded to 0.1%); no rate without income', async () => {
    const { svc, prisma } = setup();
    prisma.transaction.groupBy.mockResolvedValue(totalsRows(10_000_000n, 7_500_000n));
    expect(await svc.totals('u1', { startsAt: new Date(0), endsAt: new Date() })).toEqual({ income: 10_000_000, expense: 7_500_000, net: 2_500_000, savingsRate: 25 });
    prisma.transaction.groupBy.mockResolvedValue(totalsRows(0n, 100n));
    expect(await svc.totals('u1', { startsAt: new Date(0), endsAt: new Date() })).toMatchObject({ net: -100, savingsRate: null });
  });
});

describe('RPT-02 by-category', () => {
  it('ranks categories, gives each its share, and names uncategorised spending', async () => {
    const { svc, prisma } = setup();
    prisma.transaction.groupBy.mockResolvedValue([
      { categoryId: UID(2), _sum: { amount: 600_000n }, _count: { _all: 4 } },
      { categoryId: null, _sum: { amount: 100_000n }, _count: { _all: 1 } },
      { categoryId: UID(3), _sum: { amount: 300_000n }, _count: { _all: 2 } },
    ]);
    prisma.category.findMany.mockResolvedValue([{ id: UID(2), parentId: null, nameVi: 'Ăn uống', nameEn: 'Food' }, { id: UID(3), parentId: UID(2), nameVi: 'Cà phê', nameEn: 'Coffee' }]);
    const out = await svc.byCategory(user, { type: 'EXPENSE' });
    expect(out.total).toBe(1_000_000);
    expect(out.items.map((i) => [i.nameEn, i.total, i.percent, i.count])).toEqual([['Food', 600_000, 60, 4], ['Coffee', 300_000, 30, 2], ['Uncategorized', 100_000, 10, 1]]);
    expect(out.items[1].parentId).toBe(UID(2));
    expect(out.items[2]).toMatchObject({ categoryId: null, nameVi: 'Chưa phân loại' });
    expect(out.period).toMatchObject({ label: '2026-11', daysLeft: 10 });
    expect(prisma.transaction.groupBy.mock.calls[0][0].where.type).toBe('EXPENSE');
  });
  it('empty period: no division by zero', async () => {
    const out = await setup().svc.byCategory(user, { type: 'INCOME' });
    expect(out).toMatchObject({ total: 0, items: [] });
  });
});

describe('RPT-02 daily', () => {
  it('has one entry for EVERY day of the period (zero-filled), Vietnam calendar days', async () => {
    const { svc, prisma } = setup();
    prisma.$queryRaw.mockResolvedValue([{ d: '2026-11-03', type: 'EXPENSE', total: 120_000n }, { d: '2026-11-03', type: 'INCOME', total: 5_000_000n }, { d: '2026-11-20', type: 'EXPENSE', total: 45_000n }, { d: '2026-12-31', type: 'EXPENSE', total: 1n }]);
    const out = await svc.daily(user, '2026-11');
    expect(out.days).toHaveLength(30);
    expect(out.days[0]).toEqual({ date: '2026-11-01', income: 0, expense: 0 });
    expect(out.days[2]).toEqual({ date: '2026-11-03', income: 5_000_000, expense: 120_000 });
    expect(out.days[19]).toEqual({ date: '2026-11-20', income: 0, expense: 45_000 });
    expect(out.days[29].date).toBe('2026-11-30');
    expect(out.days.reduce((a, d) => a + d.expense, 0)).toBe(165_000); // the stray out-of-period row is ignored
  });
  it('a period starting on the 5th runs 5 Nov .. 4 Dec', async () => {
    const out = await setup(FREE, 5).svc.daily(user, '2026-11');
    expect(out.days[0].date).toBe('2026-11-05');
    expect(out.days[out.days.length - 1].date).toBe('2026-12-04');
  });
  it('queries with the user id and the period window, converting UTC to Vietnam time', async () => {
    const { svc, prisma } = setup();
    await svc.daily(user, '2026-11');
    const call = prisma.$queryRaw.mock.calls[0];
    expect(call[0].join('?')).toContain("AT TIME ZONE 'UTC') AT TIME ZONE");
    expect(call.slice(1)).toEqual(expect.arrayContaining(['Asia/Ho_Chi_Minh', 'u1', new Date('2026-10-31T17:00:00Z'), new Date('2026-11-30T17:00:00Z')]));
  });
});

describe('RPT-01 dashboard (one call, cached 60 s)', () => {
  it('assembles totals, wallets, budgets, top categories, daily, trend, ACTIVE goals and recent transactions', async () => {
    const { svc, prisma, wallets, txns } = setup();
    prisma.transaction.groupBy.mockImplementation(async ({ by }: any) => (by[0] === 'type' ? totalsRows(5_000_000n, 1_000_000n) : []));
    const d = await svc.dashboard(user);
    expect(d.period.label).toBe('2026-11');
    expect(d.totals).toMatchObject({ income: 5_000_000, expense: 1_000_000, net: 4_000_000 });
    expect(d.wallets).toEqual({ total: 1_000_000, items: [{ id: UID(1), name: 'Cash', type: 'CASH', balance: 700_000n }, { id: UID(2), name: 'Bank', type: 'BANK', balance: 300_000n }] });
    expect(d.trend).toHaveLength(6);
    expect(d.dailySpending).toHaveLength(30);
    expect(d.goals.map((g: any) => g.id)).toEqual([UID(3)]); // achieved goals are not "active"
    expect(d.recentTransactions).toEqual([{ id: UID(5) }]);
    expect(txns.list).toHaveBeenCalledWith(user, { page: 1, limit: 5, sort: 'occurredAt:desc' });
    expect(wallets.list).toHaveBeenCalled();
    expect(new Date(d.generatedAt).getTime()).not.toBeNaN();
  });
  it('is cached for 60 seconds: the second call does not touch the database', async () => {
    const { svc, prisma, redis, wallets } = setup();
    const first = await svc.dashboard(user);
    const key = [...redis.store.keys()].find((k) => k.includes(':dashboard:2026-11'))!;
    expect(redis.ttl.get(key)).toBe(60);
    const calls = prisma.transaction.groupBy.mock.calls.length;
    const second = await svc.dashboard(user);
    expect(prisma.transaction.groupBy.mock.calls.length).toBe(calls);
    expect(wallets.list).toHaveBeenCalledTimes(1);
    expect(second.generatedAt).toBe(first.generatedAt);
  });
  it('caches per user AND per period, and a data change (version bump) invalidates it at once', async () => {
    const { svc, wallets, redis } = setup();
    await svc.dashboard(user);
    await svc.dashboard(user, '2026-10');
    await svc.dashboard({ id: 'u2', role: 'USER' });
    expect(wallets.list).toHaveBeenCalledTimes(3);
    await new ReportCache(redis as any).bump('u1');
    await svc.dashboard(user);
    expect(wallets.list).toHaveBeenCalledTimes(4);
  });
  it('Free dashboards show a 6-period trend; the 12-month trend is not part of the dashboard', async () => {
    expect((await setup(PREMIUM).svc.dashboard(user)).trend).toHaveLength(6);
  });
});

describe('RPT-03 csvCell + export', () => {
  it('quotes commas, quotes and newlines, and neutralises formulas', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell(null)).toBe('');
    expect(csvCell(50000)).toBe('50000');
  });

  const t = (over: Record<string, unknown> = {}) => ({
    id: UID(100), walletId: UID(1), transferWalletId: null, categoryId: UID(2), type: 'EXPENSE', amount: 45_000n, occurredAt: new Date('2026-11-05T05:30:00Z'), note: 'Phở, bò', source: 'MANUAL', ...over,
  });
  function exportSetup(rows: any[][]) {
    const s = setup(PREMIUM);
    s.prisma.wallet.findMany.mockResolvedValue([{ id: UID(1), name: 'Tiền mặt' }, { id: UID(2), name: 'MoMo' }]);
    s.prisma.category.findMany.mockResolvedValue([{ id: UID(2), nameEn: 'Food', nameVi: 'Ăn uống' }]);
    rows.forEach((r) => s.prisma.transaction.findMany.mockResolvedValueOnce(r));
    return s;
  }

  it('writes a UTF-8 BOM, a header, Vietnam-local timestamps, wallet and category names in the user\'s language', async () => {
    const { svc } = exportSetup([[t(), t({ id: UID(101), type: 'TRANSFER', walletId: UID(1), transferWalletId: UID(2), categoryId: null, note: null, amount: 1_000_000n }), t({ id: UID(102), note: '=HYPERLINK("http://x")' })]]);
    const { filename, body } = await svc.exportCsv(user, '2026-11');
    expect(filename).toBe('smartwallet-2026-11.csv');
    expect(body.startsWith('﻿')).toBe(true);
    const lines = body.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe('date,type,amount,wallet,to_wallet,category,note,source');
    expect(lines[1]).toBe('2026-11-05 12:30,EXPENSE,45000,Tiền mặt,,Ăn uống,"Phở, bò",MANUAL');
    expect(lines[2]).toBe('2026-11-05 12:30,TRANSFER,1000000,Tiền mặt,MoMo,,,MANUAL');
    expect(lines[3]).toContain(`"'=HYPERLINK(""http://x"")"`); // formula neutralised, then quoted
    expect(lines).toHaveLength(4);
  });
  it('is scoped to the user and to the period window', async () => {
    const { svc, prisma } = exportSetup([[]]);
    await svc.exportCsv(user, '2026-11');
    expect(prisma.transaction.findMany.mock.calls[0][0].where).toEqual({ userId: 'u1', deletedAt: null, occurredAt: { gte: new Date('2026-10-31T17:00:00Z'), lt: new Date('2026-11-30T17:00:00Z') } });
  });
  it('refuses absurdly large exports (422 EXPORT_TOO_LARGE) instead of exhausting memory', async () => {
    const page = Array.from({ length: 2000 }, (_, i) => t({ id: UID(i + 1) }));
    const s = exportSetup(Array.from({ length: Math.ceil(EXPORT_MAX_ROWS / 2000) + 1 }, () => page));
    await expect(s.svc.exportCsv(user, '2026-11')).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
  it('pages through large result sets with a cursor', async () => {
    const page = Array.from({ length: 2000 }, (_, i) => t({ id: UID(i + 1) }));
    const s = exportSetup([page, [t({ id: UID(9999) })]]);
    const { body } = await s.svc.exportCsv(user, '2026-11');
    expect(body.trim().split('\r\n')).toHaveLength(2002);
    expect(s.prisma.transaction.findMany.mock.calls[1][0]).toMatchObject({ skip: 1, cursor: { id: UID(2000) } });
  });
});
