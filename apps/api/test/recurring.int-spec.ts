import { RecurringRuleOut } from '@smartwallet/shared';
import { RECURRING_QUEUE, RecurringScheduler } from '../src/recurring/recurring.scheduler';
import { RecurringService } from '../src/recurring/recurring.service';
import { randomUUID } from 'crypto';
import { Ctx, Session, balanceOf, captureEvents, createCtx, expectShape, mkWallet, signup, systemCategory } from './helpers';

let ctx: Ctx;
let s: Session;
beforeAll(async () => { ctx = await createCtx(); });
afterAll(async () => { await ctx.app.close(); });
beforeEach(async () => { s = await signup(ctx); });

const R = '/api/v1/recurring-rules';
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const daysAhead = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
const rule = (walletId: string, over: Record<string, unknown> = {}) => ({ walletId, type: 'EXPENSE', amount: 10_000, note: 'Netflix', frequency: 'DAILY', interval: 1, nextRunAt: daysAhead(1), ...over });

describe('POST/GET /recurring-rules (TXN-05)', () => {
  it('201: creates a rule; matches the documented schema; GET lists only mine', async () => {
    const w = await mkWallet(ctx, s);
    const cat = await systemCategory(ctx, s, 'EXPENSE', 'Bills');
    const res = await ctx.http().post(R).set(s.auth).send(rule(w.id, { categoryId: cat, frequency: 'MONTHLY', interval: 2, endAt: daysAhead(400) })).expect(201);
    expectShape(RecurringRuleOut, res.body.data);
    expect(res.body.data).toMatchObject({ walletId: w.id, categoryId: cat, frequency: 'MONTHLY', interval: 2, amount: 10_000, type: 'EXPENSE' });
    const list = await ctx.http().get(R).set(s.auth).expect(200);
    list.body.data.forEach((r: unknown) => expectShape(RecurringRuleOut, r));
    expect(list.body.data).toHaveLength(1);
    expect((await ctx.http().get(R).set((await signup(ctx)).auth)).body.data).toEqual([]);
  });
  it('defaults interval to 1', async () => {
    const w = await mkWallet(ctx, s);
    const { interval, ...noInterval } = rule(w.id);
    expect((await ctx.http().post(R).set(s.auth).send(noInterval).expect(201)).body.data.interval).toBe(1);
  });
  it('400: bad frequency/interval/amount, endAt before nextRunAt, forbidden keys', async () => {
    const w = await mkWallet(ctx, s);
    for (const bad of [{ frequency: 'YEARLY' }, { interval: 0 }, { interval: 400 }, { amount: 0 }, { type: 'TRANSFER' }, { endAt: daysAgo(5) }, { userId: s.userId }, { nextRunAt: 'soon' }]) {
      expect((await ctx.http().post(R).set(s.auth).send(rule(w.id, bad)).expect(400)).body.error.code).toBe('VALIDATION_ERROR');
    }
  });
  it('404 foreign wallet; 422 category type mismatch; 401 anonymous', async () => {
    const w = await mkWallet(ctx, s);
    const foreign = await mkWallet(ctx, await signup(ctx));
    await ctx.http().post(R).set(s.auth).send(rule(foreign.id)).expect(404);
    await ctx.http().post(R).set(s.auth).send(rule(w.id, { categoryId: await systemCategory(ctx, s, 'INCOME') })).expect(422);
    await ctx.http().post(R).send({}).expect(401);
    await ctx.http().get(R).expect(401);
  });
});

describe('PATCH/DELETE /recurring-rules/:id', () => {
  it('PATCH 200: updates fields; 400 for empty/invalid; 422 type flip against its category', async () => {
    const w = await mkWallet(ctx, s);
    const cat = await systemCategory(ctx, s, 'EXPENSE', 'Bills');
    const r = (await ctx.http().post(R).set(s.auth).send(rule(w.id, { categoryId: cat })).expect(201)).body.data;
    const res = await ctx.http().patch(`${R}/${r.id}`).set(s.auth).send({ amount: 99_000, note: null, frequency: 'WEEKLY', endAt: daysAhead(90) }).expect(200);
    expectShape(RecurringRuleOut, res.body.data);
    expect(res.body.data).toMatchObject({ amount: 99_000, note: null, frequency: 'WEEKLY' });
    for (const bad of [{}, { amount: -1 }, { userId: 'x' }, { endAt: daysAgo(10) }]) await ctx.http().patch(`${R}/${r.id}`).set(s.auth).send(bad).expect(400);
    await ctx.http().patch(`${R}/${r.id}`).set(s.auth).send({ type: 'INCOME' }).expect(422);
  });
  it('DELETE 204 stops the rule; unknown/foreign ids are 404 and the rule keeps running for its owner', async () => {
    const w = await mkWallet(ctx, s);
    const r = (await ctx.http().post(R).set(s.auth).send(rule(w.id)).expect(201)).body.data;
    const other = await signup(ctx);
    await ctx.http().patch(`${R}/${r.id}`).set(other.auth).send({ amount: 1 }).expect(404);
    await ctx.http().delete(`${R}/${r.id}`).set(other.auth).expect(404);
    await ctx.http().delete(`${R}/${r.id}`).expect(401);
    await ctx.http().delete(`${R}/${r.id}`).set(s.auth).expect(204);
    await ctx.http().delete(`${R}/${r.id}`).set(s.auth).expect(404);
    await ctx.http().delete(`${R}/nope`).set(s.auth).expect(404);
    expect((await ctx.http().get(R).set(s.auth)).body.data).toEqual([]);
  });
});

describe('the job body: RecurringService.generateDue', () => {
  const countFor = (ruleId: string) => ctx.prisma.transaction.count({ where: { recurringRuleId: ruleId, deletedAt: null } });

  it('posts every due occurrence (catch-up), advances next_run_at, updates the balance and publishes "generated"', async () => {
    const events = captureEvents(ctx);
    const w = await mkWallet(ctx, s, { openingBalance: 1_000_000 });
    const r = (await ctx.http().post(R).set(s.auth).send(rule(w.id, { nextRunAt: daysAgo(3) })).expect(201)).body.data;
    await ctx.app.get(RecurringService).generateDue();
    expect(await countFor(r.id)).toBe(4); // 3 days ago, 2, 1, today
    const rows = await ctx.prisma.transaction.findMany({ where: { recurringRuleId: r.id } });
    expect(rows.every((t) => t.source === 'RECURRING' && t.type === 'EXPENSE' && t.amount === 10_000n && t.userId === s.userId && t.note === 'Netflix')).toBe(true);
    expect(await balanceOf(ctx, s, w.id)).toBe(1_000_000 - 40_000);
    expect(new Date((await ctx.http().get(R).set(s.auth)).body.data[0].nextRunAt).getTime()).toBeGreaterThan(Date.now());
    expect(events.some((e) => e.action === 'generated' && e.userId === s.userId && e.current.length === 4)).toBe(true);
    const listed = (await ctx.http().get('/api/v1/transactions?limit=100').set(s.auth)).body.data;
    expect(listed.every((t: any) => t.recurringRuleId === r.id && t.source === 'RECURRING')).toBe(true);
  });
  it('is idempotent: a second run, or two workers racing, never duplicates an occurrence', async () => {
    const w = await mkWallet(ctx, s);
    const r = (await ctx.http().post(R).set(s.auth).send(rule(w.id, { nextRunAt: daysAgo(2) })).expect(201)).body.data;
    const svc = ctx.app.get(RecurringService);
    await Promise.all([svc.generateDue(), svc.generateDue(), svc.generateDue()]); // FOR UPDATE SKIP LOCKED
    expect(await countFor(r.id)).toBe(3);
    await svc.generateDue();
    expect(await countFor(r.id)).toBe(3);
  });
  it('honours end_at, interval and a rule that is not due yet', async () => {
    const w = await mkWallet(ctx, s);
    const ended = (await ctx.http().post(R).set(s.auth).send(rule(w.id, { nextRunAt: daysAgo(10), endAt: daysAgo(7) })).expect(201)).body.data;
    const every3 = (await ctx.http().post(R).set(s.auth).send(rule(w.id, { nextRunAt: daysAgo(7), interval: 3 })).expect(201)).body.data;
    const later = (await ctx.http().post(R).set(s.auth).send(rule(w.id, { nextRunAt: daysAhead(2) })).expect(201)).body.data;
    const svc = ctx.app.get(RecurringService);
    await svc.generateDue();
    await svc.generateDue();
    expect(await countFor(ended.id)).toBe(4); // days -10,-9,-8,-7 (the 8th would pass end_at)
    expect(await countFor(every3.id)).toBe(3); // days -7,-4,-1
    expect(await countFor(later.id)).toBe(0);
  });
  it('deleted rules, archived wallets and deleted wallets produce nothing', async () => {
    const w = await mkWallet(ctx, s, { name: 'A' });
    const archived = await mkWallet(ctx, s, { name: 'B' });
    const gone = await mkWallet(ctx, s, { name: 'C' });
    const rDeleted = (await ctx.http().post(R).set(s.auth).send(rule(w.id, { nextRunAt: daysAgo(2) })).expect(201)).body.data;
    const rArchived = (await ctx.http().post(R).set(s.auth).send(rule(archived.id, { nextRunAt: daysAgo(2) })).expect(201)).body.data;
    const rGone = (await ctx.http().post(R).set(s.auth).send(rule(gone.id, { nextRunAt: daysAgo(2) })).expect(201)).body.data;
    await ctx.http().delete(`${R}/${rDeleted.id}`).set(s.auth).expect(204);
    await ctx.http().patch(`/api/v1/wallets/${archived.id}`).set(s.auth).send({ isArchived: true }).expect(200);
    await ctx.http().delete(`/api/v1/wallets/${gone.id}`).set(s.auth).expect(204); // also stops its rules
    await ctx.app.get(RecurringService).generateDue();
    for (const id of [rDeleted.id, rArchived.id, rGone.id]) expect(await countFor(id)).toBe(0);
  });
  it('generated expenses count towards budget alerts (via transaction.changed)', async () => {
    const w = await mkWallet(ctx, s);
    await ctx.http().post('/api/v1/budgets').set(s.auth).send({ categoryId: null, limitAmount: 5_000 }).expect(201);
    await ctx.http().post(R).set(s.auth).send(rule(w.id, { nextRunAt: new Date(Date.now() - 60_000).toISOString() })).expect(201); // due a minute ago: inside the current period
    await ctx.app.get(RecurringService).generateDue();
    const types = (await ctx.http().get('/api/v1/notifications').set(s.auth)).body.data.map((n: any) => n.type);
    expect(types).toContain('BUDGET_EXCEEDED');
  });
});

describe('BullMQ repeatable job (TXN-05)', () => {
  it('registers ONE repeatable scheduler and a real worker generates due transactions end-to-end', async () => {
    const scheduler = ctx.app.get(RecurringScheduler);
    const prefix = `sw-test-${randomUUID().slice(0, 8)}`;
    await scheduler.start({ prefix, everyMs: 60_000 });
    await scheduler.start({ prefix }); // starting twice must not create a second schedule

    const schedulers = await scheduler.queue!.getJobSchedulers();
    expect(schedulers).toHaveLength(1);
    expect(schedulers[0]).toMatchObject({ key: 'generate-due-transactions', every: 60_000 });
    expect(scheduler.queue!.name).toBe(RECURRING_QUEUE);

    const w = await mkWallet(ctx, s);
    const r = (await ctx.http().post(R).set(s.auth).send(rule(w.id, { nextRunAt: daysAgo(1) })).expect(201)).body.data;
    const out = await scheduler.runNow(); // enqueue + wait for the worker
    expect(out.transactions).toBeGreaterThanOrEqual(2);
    expect(await ctx.prisma.transaction.count({ where: { recurringRuleId: r.id } })).toBe(2);
    await scheduler.queue!.obliterate({ force: true });
  }, 30_000);
});
