import { UsersService } from '../src/users/users.service';
import { Ctx, PASSWORD, createCtx, signup } from './helpers';

let ctx: Ctx;
beforeAll(async () => { ctx = await createCtx(); });
afterAll(async () => { await ctx.app.close(); });

const onboardingBody = (over: object = {}) => ({ monthlyIncome: 10_000_000, wallet: { name: 'Ví chính', type: 'BANK', openingBalance: 2_000_000 }, template: '50_30_20', ...over });

describe('GET /me (USER-01)', () => {
  it('200: own profile only, without the password hash', async () => {
    const s = await signup(ctx);
    const res = await ctx.http().get('/api/v1/me').set(s.auth).expect(200);
    expect(res.body.data).toMatchObject({ id: s.userId, email: s.email, locale: 'vi', currency: 'VND', monthStartDay: 1, role: 'USER', plan: 'FREE', hasPassword: true, onboarded: false });
    expect(res.body.data.passwordHash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/); // no bcrypt hash anywhere
  });

  it('401 without a token, with garbage, and with an expired token', async () => {
    await ctx.http().get('/api/v1/me').expect(401);
    await ctx.http().get('/api/v1/me').set('Authorization', 'Bearer nope').expect(401);
    const s = await signup(ctx);
    const { JwtService } = await import('@nestjs/jwt');
    const expired = new JwtService({}).sign({ sub: s.userId }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: -10 });
    await ctx.http().get('/api/v1/me').set('Authorization', `Bearer ${expired}`).expect(401);
  });
});

describe('PATCH /me (USER-01)', () => {
  it('200: updates name, avatar, currency, language and month_start_day', async () => {
    const s = await signup(ctx);
    const res = await ctx.http().patch('/api/v1/me').set(s.auth)
      .send({ fullName: 'Trần Văn B', avatarUrl: 'https://cdn.test/a.png', currency: 'USD', locale: 'en', monthStartDay: 5 }).expect(200);
    expect(res.body.data).toMatchObject({ fullName: 'Trần Văn B', avatarUrl: 'https://cdn.test/a.png', currency: 'USD', locale: 'en', monthStartDay: 5 });
    expect((await ctx.http().get('/api/v1/me').set(s.auth)).body.data.monthStartDay).toBe(5);
  });

  it('400: out-of-range day, bad locale, empty body, and fields a user must never set', async () => {
    const s = await signup(ctx);
    for (const bad of [{ monthStartDay: 29 }, { monthStartDay: 0 }, { locale: 'fr' }, { currency: 'vnd' }, {}, { role: 'ADMIN' }, { email: 'x@y.com' }, { status: 'ACTIVE' }, { emailVerifiedAt: null }]) {
      const res = await ctx.http().patch('/api/v1/me').set(s.auth).send(bad).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect((await ctx.http().get('/api/v1/me').set(s.auth)).body.data.role).toBe('USER');
  });

  it('401 without a token', async () => {
    await ctx.http().patch('/api/v1/me').send({ fullName: 'x' }).expect(401);
  });
});

describe('POST /me/onboarding (USER-02)', () => {
  it('201: income -> first wallet -> budget template, atomically; Free plan caps budgets at 5', async () => {
    const s = await signup(ctx);
    const res = await ctx.http().post('/api/v1/me/onboarding').set(s.auth).send(onboardingBody()).expect(201);
    const { wallet, budgets } = res.body.data;
    expect(wallet).toMatchObject({ name: 'Ví chính', type: 'BANK', openingBalance: 2_000_000 });
    expect(budgets).toHaveLength(5); // total + 4 largest categories (Free max_budgets = 5)
    expect(budgets.filter((b: any) => b.categoryId === null)).toHaveLength(1);
    expect(budgets.find((b: any) => b.categoryId === null).limitAmount).toBe(8_000_000); // 80% spendable, 20% reserved for savings
    expect((await ctx.http().get('/api/v1/me').set(s.auth)).body.data.onboarded).toBe(true);
    const list = await ctx.http().get('/api/v1/budgets').set(s.auth).expect(200);
    expect(list.body.data).toHaveLength(5);
  });

  it('Premium users get the full template (total + 6 categories)', async () => {
    const s = await signup(ctx);
    await ctx.http().post('/api/v1/subscriptions/mock-checkout').set(s.auth).expect(200);
    const res = await ctx.http().post('/api/v1/me/onboarding').set(s.auth).send(onboardingBody()).expect(201);
    expect(res.body.data.budgets).toHaveLength(7);
  });

  it('template NONE creates only the wallet', async () => {
    const s = await signup(ctx);
    const res = await ctx.http().post('/api/v1/me/onboarding').set(s.auth).send(onboardingBody({ template: 'NONE' })).expect(201);
    expect(res.body.data.budgets).toHaveLength(0);
  });

  it('409 ONBOARDING_DONE when repeated; nothing is duplicated', async () => {
    const s = await signup(ctx);
    await ctx.http().post('/api/v1/me/onboarding').set(s.auth).send(onboardingBody()).expect(201);
    const again = await ctx.http().post('/api/v1/me/onboarding').set(s.auth).send(onboardingBody()).expect(409);
    expect(again.body.error.code).toBe('ONBOARDING_DONE');
    expect(await ctx.prisma.wallet.count({ where: { userId: s.userId } })).toBe(1);
  });

  it('400 for invalid input; 401 without a token', async () => {
    const s = await signup(ctx);
    for (const bad of [onboardingBody({ monthlyIncome: -5 }), onboardingBody({ monthlyIncome: 1.5 }), onboardingBody({ template: 'RANDOM' }), onboardingBody({ wallet: { name: '', type: 'BANK' } }), { ...onboardingBody(), userId: 'x' }]) {
      await ctx.http().post('/api/v1/me/onboarding').set(s.auth).send(bad).expect(400);
    }
    expect(await ctx.prisma.wallet.count({ where: { userId: s.userId } })).toBe(0);
    await ctx.http().post('/api/v1/me/onboarding').send(onboardingBody()).expect(401);
  });
});

describe('DELETE /me (USER-03)', () => {
  it('403 INVALID_PASSWORD without or with a wrong password confirmation; account stays usable', async () => {
    const s = await signup(ctx);
    expect((await ctx.http().delete('/api/v1/me').set(s.auth).send({}).expect(403)).body.error.code).toBe('INVALID_PASSWORD');
    await ctx.http().delete('/api/v1/me').set(s.auth).send({ password: 'Wrong-pass1' }).expect(403);
    await ctx.http().get('/api/v1/me').set(s.auth).expect(200);
  });

  it('204: soft-deletes, and the account is dead immediately (access token, login, refresh)', async () => {
    const s = await signup(ctx);
    await ctx.http().delete('/api/v1/me').set(s.auth).send({ password: PASSWORD }).expect(204);
    const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: s.userId } });
    expect(row.deletedAt).not.toBeNull(); // soft delete, row still exists
    await ctx.http().get('/api/v1/me').set(s.auth).expect(401); // still-valid JWT is rejected
    await ctx.http().post('/api/v1/auth/login').send({ email: s.email, password: PASSWORD }).expect(401);
    await ctx.http().post('/api/v1/auth/refresh').set('Cookie', s.cookie).expect(401);
  });

  it('401 without a token', async () => {
    await ctx.http().delete('/api/v1/me').send({}).expect(401);
  });

  it('purges accounts deleted more than 30 days ago (with their data) and keeps newer ones', async () => {
    const old = await signup(ctx);
    const recent = await signup(ctx);
    await ctx.http().post('/api/v1/me/onboarding').set(old.auth).send(onboardingBody()).expect(201);
    await ctx.http().delete('/api/v1/me').set(old.auth).send({ password: PASSWORD }).expect(204);
    await ctx.http().delete('/api/v1/me').set(recent.auth).send({ password: PASSWORD }).expect(204);
    const day = 86_400_000;
    await ctx.prisma.user.update({ where: { id: old.userId }, data: { deletedAt: new Date(Date.now() - 31 * day) } });
    await ctx.prisma.user.update({ where: { id: recent.userId }, data: { deletedAt: new Date(Date.now() - 29 * day) } });

    const purged = await ctx.app.get(UsersService).purgeExpired();
    expect(purged).toBeGreaterThanOrEqual(1);
    expect(await ctx.prisma.user.findUnique({ where: { id: old.userId } })).toBeNull();
    expect(await ctx.prisma.wallet.count({ where: { userId: old.userId } })).toBe(0);
    expect(await ctx.prisma.budget.count({ where: { userId: old.userId } })).toBe(0);
    expect(await ctx.prisma.user.findUnique({ where: { id: recent.userId } })).not.toBeNull();
  });
});
