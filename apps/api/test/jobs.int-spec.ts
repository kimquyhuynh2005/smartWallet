import { randomUUID } from 'crypto';
import { AlertJobsScheduler, ALERT_JOBS_QUEUE, JOBS } from '../src/alerts/alert-jobs.scheduler';
import { GoalCheckService } from '../src/alerts/goal-check.service';
import { WeeklySummaryService } from '../src/alerts/weekly-summary.service';
import { isoWeekKey } from '../src/alerts/week';
import { EmailQueueService } from '../src/notifications/email-queue.service';
import { Ctx, Session, createCtx, mkBudget, mkWallet, now, signup, systemCategory } from './helpers';

let ctx: Ctx;
let s: Session;
beforeAll(async () => { ctx = await createCtx(); });
afterAll(async () => { await ctx.app.close(); });
beforeEach(async () => { s = await signup(ctx); });

const DAY = 86_400_000;
const queue = () => ctx.app.get(EmailQueueService).q;
const weekly = (u: Session) => ctx.app.get(WeeklySummaryService).run(new Date(), [u.userId]);
const note = (userId: string, dedupeKey: string) => ctx.prisma.notification.findFirst({ where: { userId, dedupeKey } });
const insertTxn = (userId: string, walletId: string, type: 'INCOME' | 'EXPENSE', amount: number, daysAgo: number, categoryId: string | null = null) =>
  ctx.prisma.transaction.create({ data: { userId, walletId, type, amount: BigInt(amount), categoryId, note: 'x', occurredAt: new Date(Date.now() - daysAgo * DAY) } });

describe('ALR-03 weekly summary', () => {
  async function activeWeek(u: Session) {
    const w = await mkWallet(ctx, u);
    const food = await systemCategory(ctx, u, 'EXPENSE', 'Food & Drinks');
    await insertTxn(u.userId, w.id, 'INCOME', 5_000_000, 2);
    await insertTxn(u.userId, w.id, 'EXPENSE', 300_000, 1, food);
    await insertTxn(u.userId, w.id, 'EXPENSE', 100_000, 3, food);
    await insertTxn(u.userId, w.id, 'EXPENSE', 999_000, 20, food); // older than a week: not in the summary
    return { w, food };
  }

  it('creates ONE summary per user per week: in-app SYSTEM notification (dedupe weekly:{user}:{monday}) + a queued email', async () => {
    await activeWeek(s);
    await ctx.http().post('/api/v1/goals').set(s.auth).send({ name: 'Laptop', targetAmount: 20_000_000 }).expect(201);
    const key = `weekly:${s.userId}:${isoWeekKey(new Date())}`;
    expect(await weekly(s)).toEqual({ users: 1, sent: 1 });
    const n = await note(s.userId, key);
    expect(n).toMatchObject({ type: 'SYSTEM' });
    expect(n!.payload).toMatchObject({ kind: 'weekly_summary', income: 5_000_000, expense: 400_000, transactions: 3, top: [{ nameEn: 'Food & Drinks', total: 400_000 }], goals: [{ name: 'Laptop', percent: 0 }] });
    expect((n!.payload as any).message.vi).toContain('chi 400.000 ₫');
    expect((n!.payload as any).message.en).toContain('spent 400.000 ₫');
    const job = await queue().getJob(`email_weekly_${s.userId}_${isoWeekKey(new Date())}`);
    expect(job!.data).toMatchObject({ to: s.email, subject: 'Tuần của bạn trên SmartWallet' });
    // visible in the API like any notification
    const list = (await ctx.http().get('/api/v1/notifications').set(s.auth)).body.data;
    expect(list.map((x: any) => x.type)).toEqual(['SYSTEM']);
  });

  it('running again the same week changes nothing (the unique key is the guard)', async () => {
    await activeWeek(s);
    expect((await weekly(s)).sent).toBe(1);
    expect((await weekly(s)).sent).toBe(0);
    expect(await ctx.prisma.notification.count({ where: { userId: s.userId } })).toBe(1);
  });

  it('shows how many budgets are over or near their limit', async () => {
    const { w } = await activeWeek(s);
    await mkBudget(ctx, s, null, 300_000); // 400k spent this week > 300k
    await ctx.http().post('/api/v1/transactions').set(s.auth).send({ walletId: w.id, type: 'EXPENSE', amount: 1, occurredAt: now() }).expect(201);
    await weekly(s);
    const msg = (await note(s.userId, `weekly:${s.userId}:${isoWeekKey(new Date())}`))!.payload as any;
    expect(msg.budgetsOver).toBe(1);
    expect(msg.message.en).toContain('Budgets: 1 over the limit');
  });

  it('skips a quiet week (no transactions), users who turned the summary off, and unverified emails', async () => {
    expect(await weekly(s)).toEqual({ users: 1, sent: 0 }); // no transactions at all
    const off = await signup(ctx);
    await activeWeek(off);
    await ctx.http().patch('/api/v1/notification-settings').set(off.auth).send({ weeklySummary: false }).expect(200);
    expect(await weekly(off)).toEqual({ users: 0, sent: 0 });
    const unverified = await signup(ctx, { verify: false });
    expect(await ctx.app.get(WeeklySummaryService).run(new Date(), [unverified.userId])).toEqual({ users: 0, sent: 0 });
    expect(await ctx.prisma.notification.count({ where: { userId: { in: [s.userId, off.userId, unverified.userId] } } })).toBe(0);
  });

  it('email muted: the in-app summary is still created but no email job is queued', async () => {
    await activeWeek(s);
    await ctx.http().patch('/api/v1/notification-settings').set(s.auth).send({ email: false }).expect(200);
    await weekly(s);
    expect(await note(s.userId, `weekly:${s.userId}:${isoWeekKey(new Date())}`)).toBeTruthy();
    expect(await queue().getJob(`email_weekly_${s.userId}_${isoWeekKey(new Date())}`)).toBeFalsy();
  });
});

describe('ALR-03 daily goal check', () => {
  const run = () => ctx.app.get(GoalCheckService).run();
  const goal = (u: Session, over: Record<string, unknown> = {}) =>
    ctx.prisma.goal.create({
      data: { userId: u.userId, name: 'Laptop', targetAmount: 10_000_000n, savedAmount: 1_000_000n, createdAt: new Date(Date.now() - 100 * DAY), deadline: new Date(Date.now() + 100 * DAY), ...over },
    });

  it('reminds when a goal is more than 20% behind schedule, at most once a week per goal', async () => {
    const g = await goal(s); // 50% of the time is gone, 10% saved
    await run();
    const key = `goal:${g.id}:behind:${isoWeekKey(new Date())}`;
    const n = await note(s.userId, key);
    expect(n).toMatchObject({ type: 'GOAL' });
    expect(n!.payload).toMatchObject({ goalId: g.id, event: 'behind', percent: 10, expectedPercent: 50 });
    expect((n!.payload as any).requiredMonthlySaving).toBeGreaterThan(0);
    expect((n!.payload as any).message.en).toContain('behind schedule');
    await run();
    expect(await ctx.prisma.notification.count({ where: { userId: s.userId } })).toBe(1);
    expect((await ctx.http().get('/api/v1/notifications').set(s.auth)).body.data[0]).toMatchObject({ type: 'GOAL' });
    expect(await queue().getJob(`email_goal_${g.id}_behind_${isoWeekKey(new Date())}`)).toBeTruthy();
  });

  it('does not remind goals that are on track, have no deadline, or whose owner muted goal reminders', async () => {
    await goal(s, { savedAmount: 5_000_000n }); // exactly on schedule
    await goal(s, { deadline: null });
    const muted = await signup(ctx);
    await ctx.http().patch('/api/v1/notification-settings').set(muted.auth).send({ goalReminders: false }).expect(200);
    await goal(muted);
    await run();
    expect(await ctx.prisma.notification.count({ where: { userId: { in: [s.userId, muted.userId] } } })).toBe(0);
  });

  it('marks goals with saved >= target as ACHIEVED and congratulates once, even if reminders are muted', async () => {
    await ctx.http().patch('/api/v1/notification-settings').set(s.auth).send({ goalReminders: false }).expect(200);
    const g = await goal(s, { savedAmount: 10_000_000n });
    expect((await run()).achieved).toBeGreaterThanOrEqual(1);
    expect((await ctx.prisma.goal.findUniqueOrThrow({ where: { id: g.id } })).status).toBe('ACHIEVED');
    expect((await note(s.userId, `goal:${g.id}:achieved`))!.payload).toMatchObject({ event: 'achieved', name: 'Laptop' });
    expect((await ctx.http().get('/api/v1/goals').set(s.auth)).body.data[0]).toMatchObject({ status: 'ACHIEVED', percent: 100 });
    await run();
    expect(await ctx.prisma.notification.count({ where: { userId: s.userId } })).toBe(1);
  });

  it('achieving a goal frees its plan slot (only ACTIVE goals count)', async () => {
    await goal(s, { savedAmount: 10_000_000n });
    await goal(s);
    await ctx.http().post('/api/v1/goals').set(s.auth).send({ name: 'x', targetAmount: 1 }).expect(403); // 2 active
    await run();
    await ctx.http().post('/api/v1/goals').set(s.auth).send({ name: 'x', targetAmount: 1 }).expect(201);
  });

  it('canceled and deleted goals are ignored', async () => {
    await goal(s, { status: 'CANCELED' });
    await goal(s, { deletedAt: new Date() });
    await run();
    expect(await ctx.prisma.notification.count({ where: { userId: s.userId } })).toBe(0);
  });
});

describe('BullMQ: cron schedulers', () => {
  it('registers ONE weekly (Mon 09:00) and ONE daily (08:00) scheduler in Vietnam time; a second start adds none; the worker runs a job', async () => {
    const sched = ctx.app.get(AlertJobsScheduler);
    const prefix = `sw-e2e-${randomUUID().slice(0, 8)}`;
    await sched.start({ prefix });
    await sched.start({ prefix });
    const all = await sched.queue!.getJobSchedulers();
    expect(all).toHaveLength(2);
    const by = Object.fromEntries(all.map((x) => [x.key, x]));
    expect(by[JOBS.weekly]).toMatchObject({ pattern: '0 9 * * 1', tz: 'Asia/Ho_Chi_Minh', name: JOBS.weekly });
    expect(by[JOBS.goals]).toMatchObject({ pattern: '0 8 * * *', tz: 'Asia/Ho_Chi_Minh', name: JOBS.goals });
    expect(sched.queue!.name).toBe(ALERT_JOBS_QUEUE);
    const out: any = await sched.runNow(JOBS.goals);
    expect(out).toEqual({ achieved: expect.any(Number), reminded: expect.any(Number) });
    await sched.queue!.obliterate({ force: true });
  }, 30_000);

});
