import { Ctx, createCtx, mkWallet, signup } from './helpers';

let ctx: Ctx;
beforeAll(async () => { ctx = await createCtx(); });
afterAll(async () => { await ctx.app.close(); });

/** Money invariants must hold even if a bug (or a script) bypasses the API. */
describe('database-level invariants', () => {
  it('goals: target_amount > 0 and saved_amount >= 0 (CHECK)', async () => {
    const s = await signup(ctx);
    const base = { userId: s.userId, name: 'g' };
    await expect(ctx.prisma.goal.create({ data: { ...base, targetAmount: 0n } })).rejects.toThrow();
    await expect(ctx.prisma.goal.create({ data: { ...base, targetAmount: 10n, savedAmount: -1n } })).rejects.toThrow();
    await expect(ctx.prisma.goal.create({ data: { ...base, targetAmount: 10n } })).resolves.toBeDefined();
  });
  it('recurring_rules: amount > 0 and interval > 0 (CHECK)', async () => {
    const s = await signup(ctx);
    const w = await mkWallet(ctx, s);
    const base = { userId: s.userId, walletId: w.id, type: 'EXPENSE' as const, frequency: 'DAILY' as const, nextRunAt: new Date() };
    await expect(ctx.prisma.recurringRule.create({ data: { ...base, amount: 0n } })).rejects.toThrow();
    await expect(ctx.prisma.recurringRule.create({ data: { ...base, amount: 5n, interval: 0 } })).rejects.toThrow();
  });
  it('transactions: a transfer must have a different destination wallet; non-transfers must not have one', async () => {
    const s = await signup(ctx);
    const a = await mkWallet(ctx, s);
    const b = await mkWallet(ctx, s, { name: 'B' });
    const base = { userId: s.userId, walletId: a.id, amount: 1n, occurredAt: new Date() };
    await expect(ctx.prisma.transaction.create({ data: { ...base, type: 'TRANSFER' } })).rejects.toThrow(); // no destination
    await expect(ctx.prisma.transaction.create({ data: { ...base, type: 'EXPENSE', transferWalletId: b.id } })).rejects.toThrow(); // destination on an expense
    await expect(ctx.prisma.transaction.create({ data: { ...base, type: 'TRANSFER', transferWalletId: b.id } })).resolves.toBeDefined();
  });
  it('budgets: only ONE total budget per period (NULL category), and one per category', async () => {
    const s = await signup(ctx);
    const period = new Date(Date.UTC(2030, 0, 1));
    await ctx.prisma.budget.create({ data: { userId: s.userId, period, limitAmount: 10n } });
    await expect(ctx.prisma.budget.create({ data: { userId: s.userId, period, limitAmount: 20n } })).rejects.toThrow();
    const cat = (await ctx.prisma.category.findFirstOrThrow({ where: { userId: null, type: 'EXPENSE' } })).id;
    await ctx.prisma.budget.create({ data: { userId: s.userId, period, categoryId: cat, limitAmount: 10n } });
    await expect(ctx.prisma.budget.create({ data: { userId: s.userId, period, categoryId: cat, limitAmount: 10n } })).rejects.toThrow();
  });
  it('notifications.dedupe_key is unique (a threshold can only fire once)', async () => {
    const s = await signup(ctx);
    const data = { userId: s.userId, type: 'BUDGET_WARNING' as const, payload: {}, dedupeKey: `budget:${s.userId}:80` };
    await ctx.prisma.notification.create({ data });
    await expect(ctx.prisma.notification.create({ data })).rejects.toThrow();
  });
});
