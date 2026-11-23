import { UnauthorizedException } from '@nestjs/common';
import { GoogleAuthGuard } from '../src/auth/google';
import { Ctx, PASSWORD, cookieOf, createCtx, signup, uniqueEmail } from './helpers';

// The real Google redirect cannot run in CI, so the passport guard is replaced by one that injects the profile
// Passport would have produced. Everything after the guard (linking, tokens, cookie, redirect) is the real code.
const fakeGuard = {
  canActivate: (c: any) => {
    const raw = c.switchToHttp().getRequest().headers['x-test-google'];
    if (!raw) throw new UnauthorizedException();
    c.switchToHttp().getRequest().user = JSON.parse(raw as string);
    return true;
  },
};
const profile = (over: object = {}) => JSON.stringify({ id: `g-${Math.random().toString(36).slice(2)}`, email: uniqueEmail(), emailVerified: true, name: 'G User', ...over });

describe('GET /auth/google (AUTH-03) when not configured', () => {
  let ctx: Ctx;
  beforeAll(async () => { ctx = await createCtx(); });
  afterAll(async () => { await ctx.app.close(); });

  it('501 GOOGLE_NOT_CONFIGURED for both the start and the callback route', async () => {
    expect((await ctx.http().get('/api/v1/auth/google').expect(501)).body.error.code).toBe('GOOGLE_NOT_CONFIGURED');
    await ctx.http().get('/api/v1/auth/google/callback?code=x').expect(501);
  });
});

describe('GET /auth/google/callback (AUTH-03)', () => {
  let ctx: Ctx;
  beforeAll(async () => { ctx = await createCtx((b) => b.overrideGuard(GoogleAuthGuard).useValue(fakeGuard)); });
  afterAll(async () => { await ctx.app.close(); });

  it('302: creates a verified user + google provider + FREE plan, sets the refresh cookie, and the session works', async () => {
    const raw = profile({ name: 'Lan Tran' });
    const p = JSON.parse(raw);
    const res = await ctx.http().get('/api/v1/auth/google/callback').set('x-test-google', raw).expect(302);
    expect(res.headers.location).toBe('http://app.test/auth/callback');
    const u = await ctx.prisma.user.findUniqueOrThrow({ where: { email: p.email }, include: { authProviders: true, subscriptions: { include: { plan: true } } } });
    expect(u.emailVerifiedAt).not.toBeNull();
    expect(u.passwordHash).toBeNull();
    expect(u.authProviders[0]).toMatchObject({ provider: 'GOOGLE', providerUserId: p.id });
    expect(u.subscriptions[0].plan.code).toBe('FREE');
    const refreshed = await ctx.http().post('/api/v1/auth/refresh').set('Cookie', cookieOf(res)).expect(200);
    await ctx.http().get('/api/v1/me').set('Authorization', `Bearer ${refreshed.body.data.accessToken}`).expect(200);
  });

  it('is idempotent: the same Google account signs into the same user', async () => {
    const raw = profile();
    const p = JSON.parse(raw);
    await ctx.http().get('/api/v1/auth/google/callback').set('x-test-google', raw).expect(302);
    await ctx.http().get('/api/v1/auth/google/callback').set('x-test-google', raw).expect(302);
    expect(await ctx.prisma.user.count({ where: { email: p.email } })).toBe(1);
    expect(await ctx.prisma.authProvider.count({ where: { providerUserId: p.id } })).toBe(1);
  });

  it('links to an existing password account with the same verified email, and verifies it', async () => {
    const s = await signup(ctx, { verify: false });
    await ctx.http().get('/api/v1/auth/google/callback').set('x-test-google', profile({ email: s.email })).expect(302);
    const u = await ctx.prisma.user.findUniqueOrThrow({ where: { id: s.userId }, include: { authProviders: true } });
    expect(u.authProviders).toHaveLength(1);
    expect(u.emailVerifiedAt).not.toBeNull();
    await ctx.http().post('/api/v1/auth/login').send({ email: s.email, password: PASSWORD }).expect(200); // password still works
  });

  it('403 GOOGLE_EMAIL_UNVERIFIED: never links by an unverified Google email (account-takeover guard)', async () => {
    const s = await signup(ctx);
    const res = await ctx.http().get('/api/v1/auth/google/callback').set('x-test-google', profile({ email: s.email, emailVerified: false })).expect(403);
    expect(res.body.error.code).toBe('GOOGLE_EMAIL_UNVERIFIED');
    expect(await ctx.prisma.authProvider.count({ where: { userId: s.userId } })).toBe(0);
  });

  it('401 when Google authentication itself fails; 403 for a deleted account', async () => {
    await ctx.http().get('/api/v1/auth/google/callback').expect(401);
    const raw = profile();
    const done = await ctx.http().get('/api/v1/auth/google/callback').set('x-test-google', raw).expect(302);
    const at = (await ctx.http().post('/api/v1/auth/refresh').set('Cookie', cookieOf(done)).expect(200)).body.data.accessToken;
    await ctx.http().delete('/api/v1/me').set('Authorization', `Bearer ${at}`).send({}).expect(204); // google-only account: no password to confirm
    await ctx.http().get('/api/v1/auth/google/callback').set('x-test-google', raw).expect(403);
  });
});
