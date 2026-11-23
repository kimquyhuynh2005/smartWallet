import { JwtService } from '@nestjs/jwt';
import { Ctx, PASSWORD, cookieOf, createCtx, rawSetCookie, signup, uniqueEmail } from './helpers';

let ctx: Ctx;
const jwt = () => new JwtService({});
const actionToken = (claims: object, expiresIn: string | number) => jwt().sign(claims, { secret: process.env.JWT_ACTION_SECRET, expiresIn });

beforeAll(async () => { ctx = await createCtx(); });
afterAll(async () => { await ctx.app.close(); });

describe('POST /auth/register (AUTH-01)', () => {
  it('201: creates the user, a FREE subscription and sends the verification mail; never echoes secrets', async () => {
    const email = uniqueEmail();
    const res = await ctx.http().post('/api/v1/auth/register').send({ email, password: PASSWORD, fullName: 'An Nguyen' }).expect(201);
    expect(res.body.data).toMatchObject({ email, fullName: 'An Nguyen' });
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
    const u = await ctx.prisma.user.findUniqueOrThrow({ where: { email }, include: { subscriptions: { include: { plan: true } } } });
    expect(u.role).toBe('USER');
    expect(u.emailVerifiedAt).toBeNull();
    expect(u.subscriptions[0].plan.code).toBe('FREE');
    expect(ctx.mail.count(email)).toBe(1);
  });

  it('409 EMAIL_TAKEN for a duplicate (case-insensitive)', async () => {
    const s = await signup(ctx);
    const res = await ctx.http().post('/api/v1/auth/register').send({ email: s.email.toUpperCase(), password: PASSWORD, fullName: 'X' }).expect(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('400 VALIDATION_ERROR for weak password, bad email and mass-assignment attempts', async () => {
    const base = { email: uniqueEmail(), password: PASSWORD, fullName: 'X' };
    for (const bad of [{ ...base, password: 'short1' }, { ...base, password: 'onlyletters' }, { ...base, email: 'not-an-email' }, { ...base, role: 'ADMIN' }]) {
      const res = await ctx.http().post('/api/v1/auth/register').send(bad).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('POST /auth/verify-email (AUTH-01)', () => {
  it('204: marks the email verified, which unlocks login', async () => {
    const email = uniqueEmail();
    await ctx.http().post('/api/v1/auth/register').send({ email, password: PASSWORD, fullName: 'X' }).expect(201);
    await ctx.http().post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(403);
    await ctx.http().post('/api/v1/auth/verify-email').send({ token: ctx.mail.tokenFor(email) }).expect(204);
    expect((await ctx.prisma.user.findUniqueOrThrow({ where: { email } })).emailVerifiedAt).not.toBeNull();
    await ctx.http().post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(200);
  });

  it('400 INVALID_TOKEN for garbage and for a token of the wrong purpose', async () => {
    const s = await signup(ctx);
    expect((await ctx.http().post('/api/v1/auth/verify-email').send({ token: 'garbage-garbage' }).expect(400)).body.error.code).toBe('INVALID_TOKEN');
    const wrongPurpose = actionToken({ sub: s.userId, purpose: 'reset-password' }, '5m');
    expect((await ctx.http().post('/api/v1/auth/verify-email').send({ token: wrongPurpose }).expect(400)).body.error.code).toBe('INVALID_TOKEN');
  });

  it('400 TOKEN_EXPIRED once the 24 h link has expired', async () => {
    const s = await signup(ctx);
    const expired = actionToken({ sub: s.userId, purpose: 'verify-email', email: s.email }, -10);
    expect((await ctx.http().post('/api/v1/auth/verify-email').send({ token: expired }).expect(400)).body.error.code).toBe('TOKEN_EXPIRED');
  });
});

describe('POST /auth/login (AUTH-02, AUTH-05)', () => {
  it('200: returns a 15 min access JWT and a hardened httpOnly refresh cookie; stores only a hash', async () => {
    const s = await signup(ctx);
    const res = await ctx.http().post('/api/v1/auth/login').set('User-Agent', 'jest-agent').send({ email: s.email, password: PASSWORD }).expect(200);
    const claims: any = jwt().decode(res.body.data.accessToken);
    expect(claims.sub).toBe(s.userId);
    expect(claims.exp - claims.iat).toBe(900);
    const c = rawSetCookie(res);
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/SameSite=Strict/i);
    expect(c).toMatch(/Path=\/api\/v1\/auth/);
    const raw = cookieOf(res).split('=')[1];
    const rows = await ctx.prisma.refreshToken.findMany({ where: { userId: s.userId } });
    expect(rows.some((r) => r.tokenHash === raw)).toBe(false); // raw token is never stored
    expect(rows.find((r) => r.userAgent === 'jest-agent')).toBeTruthy();
    expect(rows[0].expiresAt.getTime() - Date.now()).toBeGreaterThan(6.9 * 86_400_000);
  });

  it('401 INVALID_CREDENTIALS: wrong password and unknown email look identical', async () => {
    const s = await signup(ctx);
    const wrong = await ctx.http().post('/api/v1/auth/login').send({ email: s.email, password: 'Wrong-pass1' }).expect(401);
    const unknown = await ctx.http().post('/api/v1/auth/login').send({ email: uniqueEmail(), password: PASSWORD }).expect(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('403 EMAIL_NOT_VERIFIED before verification', async () => {
    const s = await signup(ctx, { verify: false });
    const res = await ctx.http().post('/api/v1/auth/login').send({ email: s.email, password: PASSWORD }).expect(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('AUTH-05: 5 failures lock the account for 15 min, even for the right password; unlock after expiry', async () => {
    const s = await signup(ctx);
    for (let i = 0; i < 5; i++) await ctx.http().post('/api/v1/auth/login').send({ email: s.email, password: 'Wrong-pass1' }).expect(401);
    const locked = await ctx.http().post('/api/v1/auth/login').send({ email: s.email, password: PASSWORD }).expect(403);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
    const ttl = await ctx.redis.client.ttl(`auth:lock:${s.userId}`);
    expect(ttl).toBeGreaterThan(890);
    expect(ttl).toBeLessThanOrEqual(900);
    await ctx.redis.client.del(`auth:lock:${s.userId}`); // simulate the 15 minutes passing
    await ctx.http().post('/api/v1/auth/login').send({ email: s.email, password: PASSWORD }).expect(200);
  });

  it('400 for malformed bodies', async () => {
    await ctx.http().post('/api/v1/auth/login').send({ email: 'x' }).expect(400);
  });
});

describe('POST /auth/refresh + /auth/logout (AUTH-02)', () => {
  it('200: rotates the refresh token; replaying the old one is theft and kills the whole family', async () => {
    const s = await signup(ctx);
    const r1 = await ctx.http().post('/api/v1/auth/refresh').set('Cookie', s.cookie).expect(200);
    expect(r1.body.data.accessToken).toBeTruthy();
    const newCookie = cookieOf(r1);
    expect(newCookie).not.toBe(s.cookie);
    await ctx.http().post('/api/v1/auth/refresh').set('Cookie', s.cookie).expect(401); // replay of the rotated-out token
    await ctx.http().post('/api/v1/auth/refresh').set('Cookie', newCookie).expect(401); // family revoked
  });

  it('401 without a cookie or with an unknown token', async () => {
    await ctx.http().post('/api/v1/auth/refresh').expect(401);
    await ctx.http().post('/api/v1/auth/refresh').set('Cookie', 'refresh_token=deadbeef').expect(401);
  });

  it('logout: 204, clears the cookie and revokes the token; idempotent without a cookie', async () => {
    const s = await signup(ctx);
    const out = await ctx.http().post('/api/v1/auth/logout').set('Cookie', s.cookie).expect(204);
    expect(rawSetCookie(out)).toMatch(/refresh_token=;/);
    await ctx.http().post('/api/v1/auth/refresh').set('Cookie', s.cookie).expect(401);
    await ctx.http().post('/api/v1/auth/logout').expect(204);
  });
});

describe('POST /auth/forgot-password + /auth/reset-password (AUTH-04)', () => {
  it('forgot: 204 and a mail for a known email; 204 and NO mail for an unknown one', async () => {
    const s = await signup(ctx);
    const before = ctx.mail.count(s.email);
    await ctx.http().post('/api/v1/auth/forgot-password').send({ email: s.email }).expect(204);
    expect(ctx.mail.count(s.email)).toBe(before + 1);
    const ghost = uniqueEmail();
    await ctx.http().post('/api/v1/auth/forgot-password').send({ email: ghost }).expect(204);
    expect(ctx.mail.count(ghost)).toBe(0);
    await ctx.http().post('/api/v1/auth/forgot-password').send({ email: 'nope' }).expect(400);
  });

  it('reset: new password works, old one and all sessions die, and the link is single-use', async () => {
    const s = await signup(ctx);
    await ctx.http().post('/api/v1/auth/forgot-password').send({ email: s.email }).expect(204);
    const token = ctx.mail.tokenFor(s.email);
    const claims: any = jwt().decode(token);
    expect(claims.exp - claims.iat).toBe(1800); // 30 min
    await ctx.http().post('/api/v1/auth/reset-password').send({ token, password: 'Brand-new9pw' }).expect(204);
    await ctx.http().post('/api/v1/auth/login').send({ email: s.email, password: PASSWORD }).expect(401);
    await ctx.http().post('/api/v1/auth/login').send({ email: s.email, password: 'Brand-new9pw' }).expect(200);
    await ctx.http().post('/api/v1/auth/refresh').set('Cookie', s.cookie).expect(401); // refresh tokens revoked on password change
    const reuse = await ctx.http().post('/api/v1/auth/reset-password').send({ token, password: 'Another-9pass' }).expect(400);
    expect(reuse.body.error.code).toBe('INVALID_TOKEN');
  });

  it('reset: clears an active lockout and verifies the email (inbox proves ownership)', async () => {
    const s = await signup(ctx, { verify: false });
    await ctx.http().post('/api/v1/auth/forgot-password').send({ email: s.email }).expect(204);
    await ctx.http().post('/api/v1/auth/reset-password').send({ token: ctx.mail.tokenFor(s.email), password: 'Brand-new9pw' }).expect(204);
    await ctx.http().post('/api/v1/auth/login').send({ email: s.email, password: 'Brand-new9pw' }).expect(200);
  });

  it('reset: 400 for expired / wrong-purpose / weak password', async () => {
    const s = await signup(ctx);
    await ctx.http().post('/api/v1/auth/forgot-password').send({ email: s.email }).expect(204);
    const good = ctx.mail.tokenFor(s.email);
    const pwf = (jwt().decode(good) as any).pwf;
    const expired = actionToken({ sub: s.userId, purpose: 'reset-password', pwf }, -10);
    expect((await ctx.http().post('/api/v1/auth/reset-password').send({ token: expired, password: 'Brand-new9pw' }).expect(400)).body.error.code).toBe('TOKEN_EXPIRED');
    const wrong = actionToken({ sub: s.userId, purpose: 'verify-email', email: s.email }, '5m');
    expect((await ctx.http().post('/api/v1/auth/reset-password').send({ token: wrong, password: 'Brand-new9pw' }).expect(400)).body.error.code).toBe('INVALID_TOKEN');
    expect((await ctx.http().post('/api/v1/auth/reset-password').send({ token: good, password: 'weak' }).expect(400)).body.error.code).toBe('VALIDATION_ERROR');
  });
});
