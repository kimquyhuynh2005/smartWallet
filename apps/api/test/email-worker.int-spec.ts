import { randomUUID } from 'crypto';
import { EmailQueueService } from '../src/notifications/email-queue.service';
import { Ctx, createCtx, mkBudget, mkWallet, now, signup, sleep } from './helpers';

// Kept in its own file: Nest's EventEmitterModule.forRoot() builds ONE emitter per process, so two live apps in one Jest file would
// both react to the same event. (In production there is one app per process.)
let ctx: Ctx;
const saved = process.env.BULL_PREFIX;
beforeAll(async () => {
  process.env.BULL_PREFIX = `sw-mail-${randomUUID().slice(0, 8)}`; // isolated queue: never drains leftovers from other tests
  ctx = await createCtx();
});
afterAll(async () => {
  await ctx.app.get(EmailQueueService).q.obliterate({ force: true });
  await ctx.app.close();
  if (saved === undefined) delete process.env.BULL_PREFIX; else process.env.BULL_PREFIX = saved;
});

describe('ALR-02 email worker', () => {
  it('delivers queued alert emails through the MailService (not inline in the request)', async () => {
    const u = await signup(ctx);
    ctx.app.get(EmailQueueService).startWorker();
    const w = await mkWallet(ctx, u);
    const budget = await mkBudget(ctx, u, null, 100_000);
    await ctx.http().post('/api/v1/transactions').set(u.auth).send({ walletId: w.id, type: 'EXPENSE', amount: 90_000, occurredAt: now() }).expect(201);
    // the request only queued it (the job is kept for an hour after completion, so this holds even if the worker is already done)
    expect(await ctx.app.get(EmailQueueService).q.getJob(`email_budget_${budget.id}_80`)).toBeTruthy();
    for (let i = 0; i < 50 && !ctx.mail.sent.some((m) => m.to === u.email && m.subject.startsWith('SmartWallet:')); i++) await sleep(100);
    const alert = ctx.mail.sent.find((m) => m.to === u.email && m.subject.startsWith('SmartWallet:'));
    expect(alert).toBeTruthy();
    expect(alert!.text).toContain('90%');
  }, 30_000);
});
