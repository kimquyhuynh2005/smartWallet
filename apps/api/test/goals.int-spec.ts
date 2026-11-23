import { ContributionResultOut, GoalOut } from '@smartwallet/shared';
import { Ctx, Session, captureEvents, createCtx, expectShape, mkWallet, premium, signup } from './helpers';

let ctx: Ctx;
let s: Session;
beforeAll(async () => { ctx = await createCtx(); });
afterAll(async () => { await ctx.app.close(); });
beforeEach(async () => { s = await signup(ctx); });

const G = '/api/v1/goals';
const mk = (u: Session, body: object = {}) => ctx.http().post(G).set(u.auth).send({ name: 'Laptop', targetAmount: 20_000_000, ...body });
const addTo = (u: Session, id: string, amount: number, extra: object = {}) => ctx.http().post(`${G}/${id}/contributions`).set(u.auth).send({ amount, ...extra });
const months = (n: number) => new Date(Date.now() + n * 30.4375 * 86_400_000 - 3600_000).toISOString();

describe('POST /goals (GOAL-01)', () => {
  it('201: creates an ACTIVE goal at 0%; matches the documented schema', async () => {
    const res = await mk(s).expect(201);
    expectShape(GoalOut, res.body.data);
    expect(res.body.data).toMatchObject({ name: 'Laptop', targetAmount: 20_000_000, savedAmount: 0, remainingAmount: 20_000_000, percent: 0, status: 'ACTIVE', deadline: null, requiredMonthlySaving: null });
    expect(res.body.data).not.toHaveProperty('userId');
  });
  it('with a deadline it reports the required monthly saving (GOAL-02)', async () => {
    const res = await mk(s, { deadline: months(10) }).expect(201);
    expect(res.body.data.requiredMonthlySaving).toBe(2_000_000);
  });
  it('can be linked to my wallet, never to someone else\'s (404)', async () => {
    const w = await mkWallet(ctx, s);
    expect((await mk(s, { walletId: w.id }).expect(201)).body.data.walletId).toBe(w.id);
    await mk(s, { walletId: (await mkWallet(ctx, await signup(ctx))).id }).expect(404);
  });
  it('400: bad name/target/deadline, forbidden keys; 401 anonymous', async () => {
    for (const bad of [{ name: '' }, { targetAmount: 0 }, { targetAmount: 1.5 }, { deadline: 'soon' }, { savedAmount: 100 }, { status: 'ACHIEVED' }, { userId: s.userId }]) {
      expect((await mk(s, bad).expect(400)).body.error.code).toBe('VALIDATION_ERROR');
    }
    await ctx.http().post(G).send({}).expect(401);
  });
  it('403 PLAN_LIMIT_REACHED on the 3rd ACTIVE goal (Free); canceling frees a slot; Premium is unlimited', async () => {
    const g1 = (await mk(s).expect(201)).body.data;
    await mk(s).expect(201);
    const res = await mk(s).expect(403);
    expect(res.body.error).toMatchObject({ code: 'PLAN_LIMIT_REACHED', details: { key: 'max_goals', limit: 2 } });
    await ctx.http().patch(`${G}/${g1.id}`).set(s.auth).send({ status: 'CANCELED' }).expect(200);
    await mk(s).expect(201);
    await premium(ctx, s);
    for (let i = 0; i < 4; i++) await mk(s).expect(201);
  });
});

describe('GET /goals', () => {
  it('lists my goals only, newest first, schema-valid', async () => {
    await mk(s, { name: 'A' }).expect(201);
    await mk(s, { name: 'B' }).expect(201);
    const res = await ctx.http().get(G).set(s.auth).expect(200);
    res.body.data.forEach((g: unknown) => expectShape(GoalOut, g));
    expect(res.body.data.map((g: any) => g.name)).toEqual(['B', 'A']);
    expect((await ctx.http().get(G).set((await signup(ctx)).auth)).body.data).toEqual([]);
    await ctx.http().get(G).expect(401);
  });
});

describe('PATCH /goals/:id', () => {
  it('200: renames, retargets, sets/clears the deadline; raising the target reopens an ACHIEVED goal', async () => {
    const g = (await mk(s, { targetAmount: 1_000 }).expect(201)).body.data;
    await addTo(s, g.id, 1_000).expect(201);
    expect((await ctx.http().get(G).set(s.auth)).body.data[0].status).toBe('ACHIEVED');
    const res = await ctx.http().patch(`${G}/${g.id}`).set(s.auth).send({ name: 'Bigger', targetAmount: 5_000, deadline: months(4) }).expect(200);
    expectShape(GoalOut, res.body.data);
    expect(res.body.data).toMatchObject({ name: 'Bigger', targetAmount: 5_000, status: 'ACTIVE', remainingAmount: 4_000, percent: 20 });
    expect(res.body.data.requiredMonthlySaving).toBe(1_000);
    expect((await ctx.http().patch(`${G}/${g.id}`).set(s.auth).send({ deadline: null }).expect(200)).body.data.requiredMonthlySaving).toBeNull();
  });
  it('ACTIVE after CANCELED goes back through the plan limit (403 when Free is full)', async () => {
    const g = (await mk(s).expect(201)).body.data;
    await ctx.http().patch(`${G}/${g.id}`).set(s.auth).send({ status: 'CANCELED' }).expect(200);
    await mk(s).expect(201);
    await mk(s).expect(201);
    expect((await ctx.http().patch(`${G}/${g.id}`).set(s.auth).send({ status: 'ACTIVE' }).expect(403)).body.error.code).toBe('PLAN_LIMIT_REACHED');
  });
  it('400: empty body, ACHIEVED set by hand, saved_amount, unknown keys; 404 others; 401', async () => {
    const g = (await mk(s).expect(201)).body.data;
    for (const bad of [{}, { status: 'ACHIEVED' }, { savedAmount: 5 }, { userId: 'x' }, { targetAmount: 0 }, { name: '' }]) await ctx.http().patch(`${G}/${g.id}`).set(s.auth).send(bad).expect(400);
    await ctx.http().patch(`${G}/${g.id}`).set((await signup(ctx)).auth).send({ name: 'x' }).expect(404);
    await ctx.http().patch(`${G}/nope`).set(s.auth).send({ name: 'x' }).expect(404);
    await ctx.http().patch(`${G}/${g.id}`).send({ name: 'x' }).expect(401);
  });
});

describe('POST /goals/:id/contributions (GOAL-02)', () => {
  it('201: adds savings, returns the contribution and the updated goal; publishes goal.contribution.changed', async () => {
    const events = captureEvents(ctx, 'goal.contribution.changed');
    const g = (await mk(s).expect(201)).body.data;
    const res = await addTo(s, g.id, 3_000_000, { note: 'Lương tháng 11' }).expect(201);
    expectShape(ContributionResultOut, res.body.data);
    expect(res.body.data.contribution).toMatchObject({ goalId: g.id, amount: 3_000_000, note: 'Lương tháng 11' });
    expect(res.body.data.goal).toMatchObject({ savedAmount: 3_000_000, percent: 15, remainingAmount: 17_000_000, status: 'ACTIVE' });
    expect(events.at(-1)).toMatchObject({ userId: s.userId, goalId: g.id, amount: 3_000_000, savedAmount: 3_000_000, status: 'ACTIVE' });
    expect(await ctx.prisma.goalContribution.count({ where: { goalId: g.id } })).toBe(1);
  });
  it('the goal becomes ACHIEVED when saved reaches the target, and ACTIVE again after a withdrawal', async () => {
    const g = (await mk(s, { targetAmount: 1_000 }).expect(201)).body.data;
    expect((await addTo(s, g.id, 600).expect(201)).body.data.goal.status).toBe('ACTIVE');
    const done = (await addTo(s, g.id, 400).expect(201)).body.data.goal;
    expect(done).toMatchObject({ status: 'ACHIEVED', percent: 100, remainingAmount: 0, requiredMonthlySaving: 0 });
    expect((await addTo(s, g.id, -100).expect(201)).body.data.goal).toMatchObject({ status: 'ACTIVE', savedAmount: 900 });
    expect((await addTo(s, g.id, 500).expect(201)).body.data.goal).toMatchObject({ status: 'ACHIEVED', percent: 140 }); // over-saving is fine
  });
  it('422 INSUFFICIENT_GOAL_BALANCE: cannot withdraw more than was saved (nothing is written)', async () => {
    const g = (await mk(s).expect(201)).body.data;
    await addTo(s, g.id, 100).expect(201);
    expect((await addTo(s, g.id, -101).expect(422)).body.error.code).toBe('INSUFFICIENT_GOAL_BALANCE');
    expect(await ctx.prisma.goalContribution.count({ where: { goalId: g.id } })).toBe(1);
    expect((await ctx.http().get(G).set(s.auth)).body.data[0].savedAmount).toBe(100);
  });
  it('two concurrent withdrawals can never overdraw the goal (the guard is part of the UPDATE)', async () => {
    const g = (await mk(s).expect(201)).body.data;
    await addTo(s, g.id, 100).expect(201);
    const [a, b] = await Promise.all([addTo(s, g.id, -60), addTo(s, g.id, -60)]);
    expect([a.status, b.status].sort()).toEqual([201, 422]);
    const row = await ctx.prisma.goal.findUniqueOrThrow({ where: { id: g.id } });
    expect(row.savedAmount).toBe(40n);
    const sum = await ctx.prisma.goalContribution.aggregate({ where: { goalId: g.id }, _sum: { amount: true } });
    expect(sum._sum.amount).toBe(40n); // saved_amount always equals the sum of its contributions
  });
  it('409 GOAL_NOT_ACTIVE for canceled goals', async () => {
    const g = (await mk(s).expect(201)).body.data;
    await ctx.http().patch(`${G}/${g.id}`).set(s.auth).send({ status: 'CANCELED' }).expect(200);
    expect((await addTo(s, g.id, 10).expect(409)).body.error.code).toBe('GOAL_NOT_ACTIVE');
  });
  it('400: zero / fractional / missing amount, bad date, unknown keys; 404 other user\'s goal; 401', async () => {
    const g = (await mk(s).expect(201)).body.data;
    for (const bad of [{ amount: 0 }, { amount: 1.5 }, {}, { amount: 5, occurredAt: 'x' }, { amount: 5, goalId: 'x' }, { amount: 5, note: 'x'.repeat(201) }]) {
      await ctx.http().post(`${G}/${g.id}/contributions`).set(s.auth).send(bad).expect(400);
    }
    await addTo(await signup(ctx), g.id, 5).expect(404);
    await ctx.http().post(`${G}/${g.id}/contributions`).send({ amount: 5 }).expect(401);
    await ctx.http().post(`${G}/nope/contributions`).set(s.auth).send({ amount: 5 }).expect(404);
  });
});

describe('DELETE /goals/:id', () => {
  it('204: removes the goal and its contributions; frees the plan slot; 404 on repeat', async () => {
    const g = (await mk(s).expect(201)).body.data;
    await addTo(s, g.id, 50).expect(201);
    await ctx.http().delete(`${G}/${g.id}`).set(s.auth).expect(204);
    expect((await ctx.http().get(G).set(s.auth)).body.data).toEqual([]);
    expect(await ctx.prisma.goalContribution.count({ where: { goalId: g.id, deletedAt: null } })).toBe(0);
    await ctx.http().delete(`${G}/${g.id}`).set(s.auth).expect(404);
    await mk(s).expect(201);
    await mk(s).expect(201);
  });
  it('404 for other users, 401 anonymous; the goal survives', async () => {
    const g = (await mk(s).expect(201)).body.data;
    await ctx.http().delete(`${G}/${g.id}`).set((await signup(ctx)).auth).expect(404);
    await ctx.http().delete(`${G}/${g.id}`).expect(401);
    expect((await ctx.http().get(G).set(s.auth)).body.data).toHaveLength(1);
  });
});
