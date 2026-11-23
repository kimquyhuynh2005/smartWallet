import { Ctx, clearRateLimits, createCtx, signup, uniqueEmail } from './helpers';

let ctx: Ctx;
beforeAll(async () => { ctx = await createCtx(); });
afterAll(async () => { process.env.RATE_LIMIT_DISABLED = 'true'; await clearRateLimits(ctx); await ctx.app.close(); });
beforeEach(async () => { await clearRateLimits(ctx); process.env.RATE_LIMIT_DISABLED = 'false'; });
afterEach(() => { process.env.RATE_LIMIT_DISABLED = 'true'; });

describe('Redis rate limiting', () => {
  it('auth routes: the 11th request within a minute is 429 RATE_LIMITED with Retry-After', async () => {
    for (let i = 0; i < 10; i++) {
      await ctx.http().post('/api/v1/auth/login').send({ email: uniqueEmail(), password: 'Whatever1x' }).expect(401);
    }
    const res = await ctx.http().post('/api/v1/auth/login').send({ email: uniqueEmail(), password: 'Whatever1x' }).expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(60);
    const keys = await ctx.redis.client.keys('rl:auth:*');
    expect(keys.length).toBeGreaterThan(0); // counters live in Redis, not process memory
  });

  it('other auth routes share the same 10/min budget', async () => {
    for (let i = 0; i < 10; i++) await ctx.http().post('/api/v1/auth/forgot-password').send({ email: uniqueEmail() }).expect(204);
    await ctx.http().post('/api/v1/auth/refresh').expect(429);
  });

  it('API routes: 100 req/min PER USER, so a second user is unaffected', async () => {
    process.env.RATE_LIMIT_DISABLED = 'true';
    const u1 = await signup(ctx);
    const u2 = await signup(ctx);
    await clearRateLimits(ctx);
    process.env.RATE_LIMIT_DISABLED = 'false';
    for (let i = 0; i < 100; i++) await ctx.http().get('/api/v1/me').set(u1.auth).expect(200);
    const blocked = await ctx.http().get('/api/v1/me').set(u1.auth).expect(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    await ctx.http().get('/api/v1/me').set(u2.auth).expect(200);
  }, 60000);
});
