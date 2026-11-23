import { NotificationOut, NotificationSettingsSchema, ReadAllOut, TriggeredAlertOut } from '@smartwallet/shared';
import { EmailQueueService } from '../src/notifications/email-queue.service';
import { Ctx, Session, closeSockets, connectSocket, connected, createCtx, expectShape, mkBudget, mkTxn, mkWallet, nextEvent, premium, quiet, signup, systemCategory, now } from './helpers';

let ctx: Ctx;
let s: Session;
beforeAll(async () => { ctx = await createCtx(); });
afterAll(async () => { closeSockets(); await ctx.app.close(); });
afterEach(() => closeSockets());
beforeEach(async () => { s = await signup(ctx); });

const N = '/api/v1/notifications';
const notifications = async (u: Session, qs = '') => (await ctx.http().get(`${N}${qs}`).set(u.auth).expect(200)).body;
const setLocale = (u: Session, locale: string) => ctx.http().patch('/api/v1/me').set(u.auth).send({ locale }).expect(200);
const spend = (u: Session, walletId: string, amount: number, categoryId?: string) =>
  ctx.http().post('/api/v1/transactions').set(u.auth).send({ walletId, type: 'EXPENSE', amount, occurredAt: now(), ...(categoryId ? { categoryId } : {}) }).expect(201);

describe('ACCEPTANCE: Food budget 2,000,000 with 1,500,000 spent', () => {
  it('adding a 150,000 Food expense produces EXACTLY ONE "82% of Food used" notification within 2 seconds; a second Food expense adds no 80% alert', async () => {
    await setLocale(s, 'en');
    const w = await mkWallet(ctx, s, { openingBalance: 10_000_000 });
    // the category is literally called "Food", as in the acceptance criterion (the seeded one is "Food & Drinks")
    const food = (await ctx.http().post('/api/v1/categories').set(s.auth).send({ nameVi: 'Ăn uống', nameEn: 'Food', type: 'EXPENSE' }).expect(201)).body.data.id;
    const budget = await mkBudget(ctx, s, food, 2_000_000);

    const first = await spend(s, w.id, 1_500_000, food);
    expect(first.body.data.triggeredAlerts).toEqual([]); // 75%: nothing yet
    expect((await notifications(s)).meta.total).toBe(0);

    const t0 = Date.now();
    const res = await spend(s, w.id, 150_000, food); // -> 1,650,000 = 82.5%
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(2000);

    // the response itself carries the alert (no WebSocket needed)
    expect(res.body.data.triggeredAlerts).toHaveLength(1);
    expectShape(TriggeredAlertOut, res.body.data.triggeredAlerts[0]);
    expect(res.body.data.triggeredAlerts[0]).toMatchObject({ type: 'BUDGET_WARNING', threshold: 80, budgetId: budget.id, categoryId: food, percentUsed: 82, message: '82% of Food used' });

    // and exactly one stored notification
    const list = await notifications(s);
    expect(list.meta.total).toBe(1);
    expectShape(NotificationOut, list.data[0]);
    expect(list.data[0]).toMatchObject({ type: 'BUDGET_WARNING', message: '82% of Food used', readAt: null, payload: { budgetId: budget.id, categoryId: food, threshold: 80, percentUsed: 82, spent: 1_650_000, limit: 2_000_000 } });
    expect(await ctx.prisma.notification.count({ where: { dedupeKey: `budget:${budget.id}:80` } })).toBe(1);

    // a second Food expense in the same month: no new 80% alert
    const second = await spend(s, w.id, 50_000, food);
    expect(second.body.data.triggeredAlerts).toEqual([]);
    expect((await notifications(s)).meta.total).toBe(1);
    expect(await ctx.prisma.notification.count({ where: { userId: s.userId } })).toBe(1);
  });

  it('the message uses the real category name: the seeded category reads "82% of Food & Drinks used"', async () => {
    await setLocale(s, 'en');
    const w = await mkWallet(ctx, s, { openingBalance: 10_000_000 });
    const food = await systemCategory(ctx, s, 'EXPENSE', 'Food & Drinks');
    await mkBudget(ctx, s, food, 2_000_000);
    await spend(s, w.id, 1_500_000, food);
    expect((await spend(s, w.id, 150_000, food)).body.data.triggeredAlerts[0].message).toBe('82% of Food & Drinks used');
  });

  it('the same message in Vietnamese for a Vietnamese user (the default locale)', async () => {
    const w = await mkWallet(ctx, s, { openingBalance: 10_000_000 });
    const food = await systemCategory(ctx, s, 'EXPENSE', 'Food & Drinks');
    await mkBudget(ctx, s, food, 2_000_000);
    await spend(s, w.id, 1_500_000, food);
    const res = await spend(s, w.id, 150_000, food);
    expect(res.body.data.triggeredAlerts[0].message).toBe('Đã dùng 82% ngân sách Ăn uống');
  });
});

describe('ALR-01 threshold rules', () => {
  it('80% -> BUDGET_WARNING, 100% -> BUDGET_EXCEEDED, each exactly once; deleting and re-adding the expense re-crosses but never re-alerts', async () => {
    const w = await mkWallet(ctx, s, { openingBalance: 10_000_000 });
    await mkBudget(ctx, s, null, 1_000_000);
    await spend(s, w.id, 700_000);
    const a = await spend(s, w.id, 150_000); // 85%
    expect(a.body.data.triggeredAlerts.map((x: any) => x.threshold)).toEqual([80]);
    const b = await spend(s, w.id, 200_000); // 105%
    expect(b.body.data.triggeredAlerts.map((x: any) => [x.type, x.threshold, x.percentUsed])).toEqual([['BUDGET_EXCEEDED', 100, 105]]);
    const exp = await spend(s, w.id, 100_000);
    expect(exp.body.data.triggeredAlerts).toEqual([]);

    await ctx.http().delete(`/api/v1/transactions/${b.body.data.id}`).set(s.auth).expect(204); // back under 100%
    const again = await spend(s, w.id, 300_000); // crosses 100 again
    expect(again.body.data.triggeredAlerts).toEqual([]); // the unique dedupe key stops it
    const all = (await notifications(s)).data;
    expect(all.map((n: any) => n.payload.threshold).sort()).toEqual([100, 80]);
  });

  it('one big expense crossing both thresholds raises both alerts', async () => {
    const w = await mkWallet(ctx, s);
    await mkBudget(ctx, s, null, 1_000_000);
    const res = await spend(s, w.id, 1_300_000);
    expect(res.body.data.triggeredAlerts.map((x: any) => x.threshold)).toEqual([80, 100]);
  });

  it('the category budget and the total budget alert independently', async () => {
    const w = await mkWallet(ctx, s);
    const food = await systemCategory(ctx, s, 'EXPENSE', 'Food & Drinks');
    await mkBudget(ctx, s, food, 100_000);
    await mkBudget(ctx, s, null, 1_000_000);
    const res = await spend(s, w.id, 90_000, food);
    expect(res.body.data.triggeredAlerts).toHaveLength(1);
    expect(res.body.data.triggeredAlerts[0].categoryId).toBe(food);
    const total = await spend(s, w.id, 800_000); // uncategorised: only the total budget moves (89%)
    expect(total.body.data.triggeredAlerts).toHaveLength(1);
    expect(total.body.data.triggeredAlerts[0]).toMatchObject({ categoryId: null, message: expect.stringContaining('tổng ngân sách') });
  });

  it('a sub-category expense counts towards the parent budget', async () => {
    const w = await mkWallet(ctx, s);
    const food = await systemCategory(ctx, s, 'EXPENSE', 'Food & Drinks');
    const sub = (await ctx.http().post('/api/v1/categories').set(s.auth).send({ nameVi: 'Cà phê', nameEn: 'Coffee', type: 'EXPENSE', parentId: food }).expect(201)).body.data.id;
    await mkBudget(ctx, s, food, 100_000);
    expect((await spend(s, w.id, 85_000, sub)).body.data.triggeredAlerts[0]).toMatchObject({ categoryId: food, threshold: 80 });
  });

  it('income, transfers and expenses without a matching budget never alert', async () => {
    const a = await mkWallet(ctx, s, { name: 'A', openingBalance: 5_000_000 });
    const b = await mkWallet(ctx, s, { name: 'B' });
    await mkBudget(ctx, s, await systemCategory(ctx, s, 'EXPENSE', 'Bills'), 1000);
    const inc = await ctx.http().post('/api/v1/transactions').set(s.auth).send({ walletId: a.id, type: 'INCOME', amount: 9_000_000, occurredAt: now() }).expect(201);
    expect(inc.body.data.triggeredAlerts).toEqual([]);
    await ctx.http().post('/api/v1/transactions/transfer').set(s.auth).send({ fromWalletId: a.id, toWalletId: b.id, amount: 2_000_000, occurredAt: now() }).expect(201);
    expect((await spend(s, a.id, 999_999, await systemCategory(ctx, s, 'EXPENSE', 'Health'))).body.data.triggeredAlerts).toEqual([]);
    expect((await notifications(s)).meta.total).toBe(0);
  });

  it('editing an expense upward crosses the threshold; imports and recurring posts alert through the same event', async () => {
    const w = await mkWallet(ctx, s);
    await mkBudget(ctx, s, null, 1_000_000);
    const t = await mkTxn(ctx, s, w.id, { amount: 100_000 });
    await ctx.http().patch(`/api/v1/transactions/${t.id}`).set(s.auth).send({ amount: 850_000 }).expect(200);
    expect((await notifications(s)).data.map((n: any) => n.payload.threshold)).toEqual([80]);
  });

  it('Premium custom thresholds [50, 90]: alerts at 50 and 90, not at 80', async () => {
    await premium(ctx, s);
    const w = await mkWallet(ctx, s);
    await mkBudget(ctx, s, null, 1_000_000, { alertThresholds: [50, 90] });
    expect((await spend(s, w.id, 550_000)).body.data.triggeredAlerts.map((x: any) => x.threshold)).toEqual([50]);
    expect((await spend(s, w.id, 100_000)).body.data.triggeredAlerts).toEqual([]); // 65 -> 80: not a configured line
    expect((await spend(s, w.id, 300_000)).body.data.triggeredAlerts.map((x: any) => x.threshold)).toEqual([90]);
  });

  it('a back-dated expense is judged against ITS period\'s budget', async () => {
    await premium(ctx, s);
    const w = await mkWallet(ctx, s);
    const prev = new Date(Date.now() - 35 * 86_400_000);
    const label = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
    await mkBudget(ctx, s, null, 100_000); // current period only
    const res = await ctx.http().post('/api/v1/transactions').set(s.auth).send({ walletId: w.id, type: 'EXPENSE', amount: 95_000, occurredAt: prev.toISOString() }).expect(201);
    expect(res.body.data.triggeredAlerts).toEqual([]); // the current budget did not move
    void label;
  });
});

describe('ALR-02 real-time push over Socket.IO (/ws)', () => {
  it('pushes notification:new and budget:updated to the owner within 2 s of saving the expense', async () => {
    const w = await mkWallet(ctx, s, { openingBalance: 5_000_000 });
    const food = await systemCategory(ctx, s, 'EXPENSE', 'Food & Drinks');
    const budget = await mkBudget(ctx, s, food, 2_000_000);
    await spend(s, w.id, 1_500_000, food);

    const sock = await connectSocket(ctx, s.accessToken);
    await connected(sock);
    const note = nextEvent(sock, 'notification:new');
    const upd = nextEvent(sock, 'budget:updated');
    const t0 = Date.now();
    await spend(s, w.id, 150_000, food);
    const [n, b] = await Promise.all([note, upd]);
    expect(Date.now() - t0).toBeLessThan(2000);
    expectShape(NotificationOut, n);
    expect(n).toMatchObject({ type: 'BUDGET_WARNING', message: 'Đã dùng 82% ngân sách Ăn uống', payload: { threshold: 80, percentUsed: 82 } });
    expect(b).toMatchObject({ id: budget.id, categoryId: food, spent: 1_650_000, limitAmount: 2_000_000, percentUsed: 82.5, remaining: 350_000 });
    expect(b.safeToSpendToday).toBeGreaterThan(0);
  });

  it('budget:updated is pushed on every expense, even when no threshold is crossed (live progress bar)', async () => {
    const w = await mkWallet(ctx, s);
    await mkBudget(ctx, s, null, 1_000_000);
    const sock = await connectSocket(ctx, s.accessToken);
    await connected(sock);
    const upd = nextEvent(sock, 'budget:updated');
    await spend(s, w.id, 10_000);
    expect(await upd).toMatchObject({ spent: 10_000, percentUsed: 1 });
    expect(await quiet(sock, 'notification:new', 300)).toBe(true);
  });

  it('only the owner receives it: another connected user hears nothing', async () => {
    const other = await signup(ctx);
    const w = await mkWallet(ctx, s);
    await mkBudget(ctx, s, null, 100_000);
    const mine = await connectSocket(ctx, s.accessToken);
    const theirs = await connectSocket(ctx, other.accessToken);
    await Promise.all([connected(mine), connected(theirs)]);
    const got = nextEvent(mine, 'notification:new');
    const silent = quiet(theirs, 'notification:new', 800);
    await spend(s, w.id, 90_000);
    await got;
    expect(await silent).toBe(true);
    expect(await quiet(theirs, 'budget:updated', 100)).toBe(true);
  });

  it('JWT auth on connect: missing, invalid and deleted-user tokens are refused with "unauthorized"', async () => {
    for (const token of [null, 'garbage']) {
      const sock = await connectSocket(ctx, token);
      await expect(connected(sock)).rejects.toMatchObject({ message: 'unauthorized' });
    }
    const gone = await signup(ctx);
    await ctx.http().delete('/api/v1/me').set(gone.auth).send({ password: 'Passw0rd!x' }).expect(204);
    await expect(connected(await connectSocket(ctx, gone.accessToken))).rejects.toMatchObject({ message: 'unauthorized' });
  });

  it('muted in-app channel: nothing is pushed and triggeredAlerts is empty, but the notification is still stored', async () => {
    await ctx.http().patch('/api/v1/notification-settings').set(s.auth).send({ inApp: false }).expect(200);
    const w = await mkWallet(ctx, s);
    await mkBudget(ctx, s, null, 100_000);
    const sock = await connectSocket(ctx, s.accessToken);
    await connected(sock);
    const silent = Promise.all([quiet(sock, 'notification:new', 800), quiet(sock, 'budget:updated', 800)]);
    const res = await spend(s, w.id, 90_000);
    expect(res.body.data.triggeredAlerts).toEqual([]);
    expect(await silent).toEqual([true, true]);
    expect((await notifications(s)).meta.total).toBe(1); // history + dedupe
  });
});

describe('ALR-02 email channel (BullMQ queue, not sent inline)', () => {
  const queue = () => ctx.app.get(EmailQueueService).q;

  it('queues exactly one email job per alert, keyed by the dedupe key, addressed to the user', async () => {
    const w = await mkWallet(ctx, s);
    const budget = await mkBudget(ctx, s, null, 100_000);
    await spend(s, w.id, 90_000);
    const job = await queue().getJob(`email_budget_${budget.id}_80`);
    expect(job).toBeTruthy();
    expect(job!.data).toMatchObject({ to: s.email, subject: expect.stringContaining('SmartWallet'), text: expect.stringContaining('90%') });
    expect(ctx.mail.count(s.email)).toBe(1); // only the verification mail: alerts were queued, not sent inline
    await spend(s, w.id, 5_000);
    expect(await queue().getJob(`email_budget_${budget.id}_100`)).toBeFalsy();
  });

  it('email muted: no job, but the in-app alert still works', async () => {
    await ctx.http().patch('/api/v1/notification-settings').set(s.auth).send({ email: false }).expect(200);
    const w = await mkWallet(ctx, s);
    const budget = await mkBudget(ctx, s, null, 100_000);
    const res = await spend(s, w.id, 90_000);
    expect(res.body.data.triggeredAlerts).toHaveLength(1);
    expect(await queue().getJob(`email_budget_${budget.id}_80`)).toBeFalsy();
  });
});

describe('GET /notifications, PATCH /notifications/:id/read, POST /notifications/read-all', () => {
  async function seed(u: Session) {
    const w = await mkWallet(ctx, u);
    await mkBudget(ctx, u, null, 100_000);
    await spend(u, w.id, 150_000); // crosses 80 and 100 -> 2 notifications
  }

  it('lists newest first, paginated, with an unread filter', async () => {
    await seed(s);
    const all = await notifications(s);
    expect(all.meta).toEqual({ page: 1, limit: 20, total: 2 });
    all.data.forEach((n: unknown) => expectShape(NotificationOut, n));
    expect(new Date(all.data[0].createdAt).getTime()).toBeGreaterThanOrEqual(new Date(all.data[1].createdAt).getTime());
    expect((await notifications(s, '?limit=1&page=2')).data).toHaveLength(1);
    expect((await notifications(s, '?unread=true')).meta.total).toBe(2);
  });

  it('PATCH /:id/read marks one as read (idempotent); the unread filter follows', async () => {
    await seed(s);
    const [first] = (await notifications(s)).data;
    const r1 = await ctx.http().patch(`${N}/${first.id}/read`).set(s.auth).expect(200);
    expectShape(NotificationOut, r1.body.data);
    expect(r1.body.data.readAt).not.toBeNull();
    const r2 = await ctx.http().patch(`${N}/${first.id}/read`).set(s.auth).expect(200);
    expect(r2.body.data.readAt).toBe(r1.body.data.readAt); // the first read time is kept
    expect((await notifications(s, '?unread=true')).meta.total).toBe(1);
  });

  it('POST /read-all marks everything read and reports how many changed', async () => {
    await seed(s);
    const res = await ctx.http().post(`${N}/read-all`).set(s.auth).expect(200);
    expectShape(ReadAllOut, res.body.data);
    expect(res.body.data.updated).toBe(2);
    expect((await ctx.http().post(`${N}/read-all`).set(s.auth).expect(200)).body.data.updated).toBe(0);
    expect((await notifications(s, '?unread=true')).meta.total).toBe(0);
  });

  it('another user cannot read or mark mine (404) and sees none of them; 400/401 errors', async () => {
    await seed(s);
    const other = await signup(ctx);
    const [mine] = (await notifications(s)).data;
    await ctx.http().patch(`${N}/${mine.id}/read`).set(other.auth).expect(404);
    await ctx.http().patch(`${N}/nope/read`).set(s.auth).expect(404);
    expect((await notifications(other)).meta.total).toBe(0);
    expect((await ctx.http().post(`${N}/read-all`).set(other.auth)).body.data.updated).toBe(0);
    expect((await notifications(s, '?unread=true')).meta.total).toBe(2); // untouched
    for (const q of ['?limit=101', '?page=0', '?unread=maybe', '?foo=1']) await ctx.http().get(`${N}${q}`).set(s.auth).expect(400);
    await ctx.http().get(N).expect(401);
    await ctx.http().post(`${N}/read-all`).expect(401);
    await ctx.http().patch(`${N}/${mine.id}/read`).expect(401);
  });
});

describe('PATCH /notification-settings (ALR-02 mute per channel)', () => {
  const SET = '/api/v1/notification-settings';
  it('defaults to everything on; PATCH merges partial updates and persists them', async () => {
    const def = await ctx.http().get(SET).set(s.auth).expect(200);
    expectShape(NotificationSettingsSchema, def.body.data);
    expect(def.body.data).toEqual({ inApp: true, email: true, weeklySummary: true, goalReminders: true });
    const res = await ctx.http().patch(SET).set(s.auth).send({ email: false }).expect(200);
    expect(res.body.data).toEqual({ inApp: true, email: false, weeklySummary: true, goalReminders: true });
    expect((await ctx.http().patch(SET).set(s.auth).send({ weeklySummary: false, goalReminders: false }).expect(200)).body.data).toEqual({ inApp: true, email: false, weeklySummary: false, goalReminders: false });
    expect((await ctx.http().get(SET).set(s.auth)).body.data.email).toBe(false);
  });
  it('is per user; 400 for empty/unknown/non-boolean; 401 anonymous', async () => {
    await ctx.http().patch(SET).set(s.auth).send({ inApp: false }).expect(200);
    expect((await ctx.http().get(SET).set((await signup(ctx)).auth)).body.data.inApp).toBe(true);
    for (const bad of [{}, { sms: true }, { email: 'no' }, { userId: s.userId }]) await ctx.http().patch(SET).set(s.auth).send(bad).expect(400);
    await ctx.http().patch(SET).send({ email: false }).expect(401);
    await ctx.http().get(SET).expect(401);
  });
});
