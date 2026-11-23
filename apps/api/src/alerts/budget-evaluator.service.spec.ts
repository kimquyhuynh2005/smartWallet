import { UID, mockPrisma } from '../testing/mocks';
import { BudgetsService } from '../budgets/budgets.service';
import type { TransactionChangedEvent, TxSnapshot } from '../common/events';
import { BudgetEvaluator, crossedUpward } from './budget-evaluator.service';

const FOOD = UID(2), FOOD_CHILD = UID(3), BILLS = UID(4);
const NOV = new Date('2026-11-01T00:00:00Z');
const inNov = new Date('2026-11-21T05:00:00Z');
const bud = (over: Record<string, unknown> = {}) => ({
  id: UID(50), userId: 'u1', period: NOV, categoryId: FOOD, limitAmount: 2_000_000n, rolloverMode: 'NONE', rolloverAmount: 0n, alertThresholds: [80, 100],
  createdAt: new Date(), updatedAt: new Date(), deletedAt: null, ...over,
});
const exp = (amount: number, categoryId: string | null = FOOD, occurredAt = inNov): TxSnapshot => ({ id: UID(900), type: 'EXPENSE', walletId: UID(1), transferWalletId: null, categoryId, amount, occurredAt });
const ev = (current: TxSnapshot[], previous: TxSnapshot[] = [], action: TransactionChangedEvent['action'] = 'created'): TransactionChangedEvent => ({ userId: 'u1', action, current, previous });

function setup(opts: { budgets?: any[]; spent?: [string | null, bigint][]; settings?: object; children?: [string, string[]][]; parents?: any[] } = {}) {
  const prisma = mockPrisma(['user', 'category', 'budget', 'transaction']);
  prisma.user.findUnique.mockResolvedValue({ monthStartDay: 1, notificationSettings: opts.settings ?? {} });
  prisma.budget.findMany.mockResolvedValue(opts.budgets ?? [bud()]);
  prisma.category.findMany.mockImplementation(async ({ where }: any) => {
    if (where.parentId) return (opts.children ?? []).flatMap(([p, cs]) => cs.map((id) => ({ id, parentId: p })));
    if (where.id?.in && !where.deletedAt) return (opts.parents ?? []).length ? opts.parents : where.id.in.map((id: string) => ({ id, nameEn: id === FOOD ? 'Food' : 'Bills', nameVi: id === FOOD ? 'Ăn uống' : 'Hóa đơn', parentId: null }));
    return [];
  });
  prisma.transaction.groupBy.mockResolvedValue((opts.spent ?? [[FOOD, 1_650_000n]]).map(([categoryId, amount]) => ({ categoryId, _sum: { amount } })));
  const budgets = new BudgetsService(prisma, { forUser: jest.fn() } as any, { bump: jest.fn() } as any);
  const notify = jest.fn(async (_u: string, i: any) => ({ notification: { id: UID(700), message: i.message.en }, inApp: true, email: true }));
  const notifications: any = { notify };
  const realtime: any = { emit: jest.fn() };
  return { ev: new BudgetEvaluator(prisma, budgets, notifications, realtime), prisma, notify, realtime };
}

describe('ALR-01 crossedUpward (exact integer maths)', () => {
  it('a threshold is crossed when spent was below it and is at/above it now', () => {
    expect(crossedUpward(1_500_000n, 1_650_000n, 2_000_000n, [80, 100])).toEqual([80]);
    expect(crossedUpward(1_500_000n, 2_100_000n, 2_000_000n, [80, 100])).toEqual([80, 100]);
    expect(crossedUpward(1_700_000n, 1_999_999n, 2_000_000n, [80, 100])).toEqual([]);
  });
  it('the boundary is inclusive on arrival (exactly 80%) and exclusive on departure', () => {
    expect(crossedUpward(1_599_999n, 1_600_000n, 2_000_000n, [80])).toEqual([80]);
    expect(crossedUpward(1_600_000n, 1_700_000n, 2_000_000n, [80])).toEqual([]); // already at 80 before
    expect(crossedUpward(0n, 1_599_999n, 2_000_000n, [80])).toEqual([]);
  });
  it('custom (Premium) thresholds, in any order, and thresholds above 100', () => {
    expect(crossedUpward(0n, 1_100_000n, 2_000_000n, [90, 50, 25])).toEqual([25, 50]);
    expect(crossedUpward(1_900_000n, 2_600_000n, 2_000_000n, [100, 120, 150])).toEqual([100, 120]);
  });
  it('spending going down never crosses; a zero limit never alerts', () => {
    expect(crossedUpward(2_000_000n, 500_000n, 2_000_000n, [80, 100])).toEqual([]);
    expect(crossedUpward(0n, 5n, 0n, [80])).toEqual([]);
  });
});

describe('ALR-01 BudgetEvaluator: the acceptance scenario', () => {
  it('Food budget 2,000,000 with 1,500,000 spent: adding 150,000 creates exactly one "82% of Food used" alert', async () => {
    const { ev: e, notify } = setup({ spent: [[FOOD, 1_650_000n]] }); // spend AFTER the new expense is committed
    const out = await e.evaluate(ev([exp(150_000)]));
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('u1', expect.objectContaining({
      type: 'BUDGET_WARNING', dedupeKey: `budget:${UID(50)}:80`, message: { en: '82% of Food used', vi: 'Đã dùng 82% ngân sách Ăn uống' },
      payload: expect.objectContaining({ budgetId: UID(50), categoryId: FOOD, threshold: 80, percentUsed: 82, spent: 1_650_000, limit: 2_000_000, period: '2026-11' }),
    }));
    expect(out.triggeredAlerts).toEqual([{ id: UID(700), type: 'BUDGET_WARNING', threshold: 80, budgetId: UID(50), categoryId: FOOD, percentUsed: 82, message: '82% of Food used' }]);
  });

  it('a second Food expense in the same month does NOT alert again for 80%', async () => {
    const { ev: e, notify } = setup({ spent: [[FOOD, 1_700_000n]] });
    const out = await e.evaluate(ev([exp(50_000)])); // 1,650,000 -> 1,700,000
    expect(notify).not.toHaveBeenCalled();
    expect(out.triggeredAlerts).toEqual([]);
  });

  it('and the database, not just the logic, guards it: a dedupe hit (notify -> null) yields no alert', async () => {
    const { ev: e, notify } = setup({ spent: [[FOOD, 1_650_000n]] });
    notify.mockResolvedValue(null as any);
    expect((await e.evaluate(ev([exp(150_000)]))).triggeredAlerts).toEqual([]);
  });

  it('crossing 100% later produces the BUDGET_EXCEEDED alert (once)', async () => {
    const { ev: e, notify } = setup({ spent: [[FOOD, 2_100_000n]] });
    const out = await e.evaluate(ev([exp(450_000)]));
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][1]).toMatchObject({ type: 'BUDGET_EXCEEDED', dedupeKey: `budget:${UID(50)}:100`, message: { en: '105% of Food used' } });
    expect(out.triggeredAlerts[0]).toMatchObject({ type: 'BUDGET_EXCEEDED', threshold: 100, percentUsed: 105 });
  });
  it('one big expense crossing both lines raises both alerts, 80 first', async () => {
    const { ev: e, notify } = setup({ spent: [[FOOD, 2_400_000n]] });
    await e.evaluate(ev([exp(1_000_000)]));
    expect(notify.mock.calls.map((c) => [c[1].type, c[1].payload.threshold])).toEqual([['BUDGET_WARNING', 80], ['BUDGET_EXCEEDED', 100]]);
  });
});

describe('ALR-01 BudgetEvaluator: which budgets are affected', () => {
  it('the total budget (category null) and the category budget are both evaluated', async () => {
    const { ev: e, notify } = setup({ budgets: [bud(), bud({ id: UID(51), categoryId: null, limitAmount: 2_000_000n })], spent: [[FOOD, 1_650_000n]] });
    const out = await e.evaluate(ev([exp(150_000)]));
    expect(notify.mock.calls.map((c) => c[1].dedupeKey).sort()).toEqual([`budget:${UID(50)}:80`, `budget:${UID(51)}:80`].sort());
    expect(notify.mock.calls.find((c) => c[1].dedupeKey.includes(UID(51)))![1].message.en).toBe('82% of total budget used');
    expect(out.triggeredAlerts).toHaveLength(2);
  });

  it('a sub-category expense counts towards its parent budget (and the query asks for the parent budget)', async () => {
    const { ev: e, notify, prisma } = setup({
      budgets: [bud()], children: [[FOOD, [FOOD_CHILD]]], spent: [[FOOD, 1_000_000n], [FOOD_CHILD, 650_000n]],
      parents: [{ id: FOOD_CHILD, parentId: FOOD, nameEn: 'Food', nameVi: 'Ăn uống' }],
    });
    await e.evaluate(ev([exp(150_000, FOOD_CHILD)]));
    const or = prisma.budget.findMany.mock.calls[0][0].where.OR;
    expect(or).toEqual(expect.arrayContaining([{ categoryId: null }, { categoryId: { in: expect.arrayContaining([FOOD, FOOD_CHILD]) } }]));
    expect(notify).toHaveBeenCalledTimes(1); // 1,650,000 across the family, 1,500,000 before
  });

  it('an expense in another category does not move this category budget', async () => {
    const { ev: e, notify } = setup({ budgets: [bud(), bud({ id: UID(52), categoryId: BILLS, limitAmount: 100_000n })], spent: [[FOOD, 1_650_000n], [BILLS, 20_000n]] });
    await e.evaluate(ev([exp(20_000, BILLS)]));
    expect(notify).not.toHaveBeenCalled(); // Food did not change; Bills went 0 -> 20%
  });

  it('income, transfers and empty events do nothing (no queries)', async () => {
    const { ev: e, prisma, notify } = setup();
    const income: TxSnapshot = { ...exp(1_000_000), type: 'INCOME' };
    const transfer: TxSnapshot = { ...exp(1_000_000), type: 'TRANSFER', transferWalletId: UID(2) };
    expect(await e.evaluate(ev([income, transfer]))).toEqual({ triggeredAlerts: [] });
    expect(await e.evaluate(ev([], []))).toEqual({ triggeredAlerts: [] });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('no budget for the period, or an unknown user: nothing happens', async () => {
    const a = setup({ budgets: [] });
    expect(await a.ev.evaluate(ev([exp(1)]))).toEqual({ triggeredAlerts: [] });
    expect(a.realtime.emit).not.toHaveBeenCalled();
    const b = setup();
    b.prisma.user.findUnique.mockResolvedValue(null);
    expect(await b.ev.evaluate(ev([exp(1)]))).toEqual({ triggeredAlerts: [] });
  });
});

describe('ALR-01 BudgetEvaluator: updates and deletes', () => {
  it('editing an expense uses the delta (current - previous): raising it across 80% alerts, lowering it does not', async () => {
    const up = setup({ spent: [[FOOD, 1_700_000n]] });
    await up.ev.evaluate(ev([exp(300_000)], [exp(100_000)], 'updated')); // 1,500,000 -> 1,700,000
    expect(up.notify).toHaveBeenCalledTimes(1);
    const down = setup({ spent: [[FOOD, 1_000_000n]] });
    await down.ev.evaluate(ev([exp(100_000)], [exp(300_000)], 'updated'));
    expect(down.notify).not.toHaveBeenCalled();
  });
  it('a delete never alerts but the budget still moves live (budget:updated)', async () => {
    const { ev: e, notify, realtime } = setup({ spent: [[FOOD, 1_000_000n]] });
    const out = await e.evaluate(ev([], [exp(650_000)], 'deleted'));
    expect(notify).not.toHaveBeenCalled();
    expect(out.triggeredAlerts).toEqual([]);
    expect(realtime.emit).toHaveBeenCalledWith('u1', 'budget:updated', expect.objectContaining({ id: UID(50), spent: 1_000_000n, percentUsed: 50 }));
  });
  it('dropping under 80 and crossing again is still deduped by the database key (same key both times)', async () => {
    const { ev: e, notify } = setup({ spent: [[FOOD, 1_650_000n]] });
    await e.evaluate(ev([exp(150_000)]));
    await e.evaluate(ev([exp(150_000)]));
    expect(new Set(notify.mock.calls.map((c) => c[1].dedupeKey)).size).toBe(1);
  });
});

describe('ALR-02 BudgetEvaluator: channels, thresholds, periods', () => {
  it('pushes budget:updated for every affected budget, with live progress', async () => {
    const { ev: e, realtime } = setup({ spent: [[FOOD, 1_000_000n]] });
    await e.evaluate(ev([exp(100_000)]));
    expect(realtime.emit).toHaveBeenCalledTimes(1);
    expect(realtime.emit).toHaveBeenCalledWith('u1', 'budget:updated', expect.objectContaining({ id: UID(50), period: '2026-11', limitAmount: 2_000_000n, spent: 1_000_000n, remaining: 1_000_000n, percentUsed: 50 }));
  });
  it('in-app muted: no live push and no triggeredAlerts, but the notification is still stored (dedupe + history)', async () => {
    const { ev: e, notify, realtime } = setup({ settings: { inApp: false }, spent: [[FOOD, 1_650_000n]] });
    notify.mockImplementation(async (_u: string, i: any) => ({ notification: { id: UID(700), message: i.message.en }, inApp: false, email: true }));
    const out = await e.evaluate(ev([exp(150_000)]));
    expect(notify).toHaveBeenCalledTimes(1);
    expect(realtime.emit).not.toHaveBeenCalled();
    expect(out.triggeredAlerts).toEqual([]);
  });
  it('Premium custom thresholds are honoured', async () => {
    const { ev: e, notify } = setup({ budgets: [bud({ alertThresholds: [50, 90] })], spent: [[FOOD, 1_100_000n]] });
    await e.evaluate(ev([exp(200_000)])); // 45% -> 55%
    expect(notify.mock.calls.map((c) => c[1].payload.threshold)).toEqual([50]);
    expect(notify.mock.calls[0][1].type).toBe('BUDGET_WARNING');
  });
  it('a back-dated expense is evaluated against the budgets of ITS period, not the current one', async () => {
    const { ev: e, prisma } = setup({ spent: [[FOOD, 1_650_000n]] });
    await e.evaluate(ev([exp(150_000, FOOD, new Date('2026-10-15T05:00:00Z'))]));
    expect(prisma.budget.findMany.mock.calls[0][0].where.period).toEqual(new Date('2026-10-01T00:00:00Z'));
    expect(prisma.transaction.groupBy.mock.calls[0][0].where.occurredAt).toEqual({ gte: new Date('2026-09-30T17:00:00Z'), lt: new Date('2026-10-31T17:00:00Z') });
  });
  it('respects month_start_day: with day 5, a 3 Nov expense belongs to the period that began 5 Oct', async () => {
    const { ev: e, prisma } = setup({ spent: [[FOOD, 1_650_000n]] });
    prisma.user.findUnique.mockResolvedValue({ monthStartDay: 5, notificationSettings: {} });
    await e.evaluate(ev([exp(150_000, FOOD, new Date('2026-11-03T05:00:00Z'))]));
    expect(prisma.budget.findMany.mock.calls[0][0].where.period).toEqual(new Date('2026-10-05T00:00:00Z'));
  });
  it('is wired to the transaction.changed event', async () => {
    const { ev: e } = setup();
    const spy = jest.spyOn(e, 'evaluate');
    await e.onTransactionChanged(ev([exp(1)]));
    expect(spy).toHaveBeenCalled();
  });
});
