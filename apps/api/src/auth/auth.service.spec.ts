import { BadRequestException, ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService, sha256 } from './auth.service';

process.env.JWT_ACTION_SECRET = 'unit-action';
process.env.APP_URL = 'http://app.test';

class FakeRedis {
  store = new Map<string, string>();
  ttl = new Map<string, number>();
  client = this;
  async get(k: string) { return this.store.get(k) ?? null; }
  async set(k: string, v: string, _ex?: string, s?: number) { this.store.set(k, v); if (s) this.ttl.set(k, s); }
  async incr(k: string) { const n = Number(this.store.get(k) ?? 0) + 1; this.store.set(k, String(n)); return n; }
  async expire() { return 1; }
  async del(...ks: string[]) { ks.forEach((k) => this.store.delete(k)); }
}

const PASSWORD = 'Correct1pass';
const user = (over: Record<string, unknown> = {}) => ({
  id: 'u1', email: 'a@b.com', fullName: 'An', locale: 'vi', role: 'USER', status: 'ACTIVE', deletedAt: null,
  emailVerifiedAt: new Date(), passwordHash: bcrypt.hashSync(PASSWORD, 4), ...over, // cost 4 keeps the suite fast
});

function setup() {
  const prisma: any = {
    user: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(async ({ data }: any) => ({ id: 'new', locale: 'vi', ...data })), update: jest.fn() },
    refreshToken: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
  };
  const redis = new FakeRedis();
  const mail = { send: jest.fn() };
  const plans = { freePlan: jest.fn(async () => ({ id: 'free-plan' })) };
  const audit = { record: jest.fn() };
  const jwt = new JwtService({ secret: 'unit-access', signOptions: { expiresIn: '15m' } });
  const svc = new AuthService(prisma, jwt, redis as any, mail as any, plans as any, audit as any);
  return { svc, prisma, redis, mail, jwt };
}
const tokenIn = (text: string) => /token=([^\s&]+)/.exec(text)![1];

describe('AUTH-01 register + verify email', () => {
  it('hashes with bcrypt cost 12, creates a FREE subscription and mails a 24 h verification link', async () => {
    const { svc, prisma, mail, jwt } = setup();
    prisma.user.findUnique.mockResolvedValue(null);
    const out = await svc.register({ email: ' A@B.com ', password: PASSWORD, fullName: 'An' });
    expect(out).toMatchObject({ email: 'a@b.com' });
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(bcrypt.getRounds(data.passwordHash)).toBe(12);
    expect(data.passwordHash).not.toContain(PASSWORD);
    expect(data.subscriptions.create.planId).toBe('free-plan');
    const claims: any = jwt.verify(tokenIn(mail.send.mock.calls[0][0].text), { secret: 'unit-action' });
    expect(claims.purpose).toBe('verify-email');
    expect(claims.exp - claims.iat).toBe(24 * 3600);
  });

  it('rejects a duplicate email with 409 EMAIL_TAKEN and creates nothing', async () => {
    const { svc, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue(user());
    await expect(svc.register({ email: 'a@b.com', password: PASSWORD, fullName: 'An' })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('verifyEmail rejects a reset-password token (wrong purpose)', async () => {
    const { svc, jwt } = setup();
    const t = jwt.sign({ sub: 'u1', purpose: 'reset-password' }, { secret: 'unit-action' });
    await expect(svc.verifyEmail(t)).rejects.toMatchObject({ response: { code: 'INVALID_TOKEN' } });
  });

  it('verifyEmail reports an expired link as TOKEN_EXPIRED', async () => {
    const { svc, jwt } = setup();
    const t = jwt.sign({ sub: 'u1', purpose: 'verify-email', email: 'a@b.com' }, { secret: 'unit-action', expiresIn: -5 });
    await expect(svc.verifyEmail(t)).rejects.toMatchObject({ response: { code: 'TOKEN_EXPIRED' } });
  });
});

describe('AUTH-02 login + AUTH-05 lockout', () => {
  it('issues a 15 min access token and stores only the sha256 of the refresh token', async () => {
    const { svc, prisma, jwt } = setup();
    prisma.user.findFirst.mockResolvedValue(user());
    const { accessToken, refreshToken } = await svc.login({ email: 'a@b.com', password: PASSWORD }, 'jest');
    const claims: any = jwt.verify(accessToken);
    expect(claims.sub).toBe('u1');
    expect(claims.exp - claims.iat).toBe(900);
    const stored = prisma.refreshToken.create.mock.calls[0][0].data;
    expect(stored.tokenHash).toBe(sha256(refreshToken));
    expect(stored.tokenHash).not.toBe(refreshToken);
    expect(stored.expiresAt.getTime() - Date.now()).toBeGreaterThan(6.9 * 86_400_000);
    expect(stored.userAgent).toBe('jest');
  });

  it('locks the account for 15 min after 5 failures, even for the correct password afterwards', async () => {
    const { svc, prisma, redis } = setup();
    prisma.user.findFirst.mockResolvedValue(user());
    for (let i = 0; i < 5; i++) {
      await expect(svc.login({ email: 'a@b.com', password: 'wrong-pass1' })).rejects.toBeInstanceOf(UnauthorizedException);
    }
    expect(redis.ttl.get('auth:lock:u1')).toBe(900);
    await expect(svc.login({ email: 'a@b.com', password: PASSWORD })).rejects.toMatchObject({ response: { code: 'ACCOUNT_LOCKED' } });
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('a successful login resets the failure counter', async () => {
    const { svc, prisma, redis } = setup();
    prisma.user.findFirst.mockResolvedValue(user());
    for (let i = 0; i < 4; i++) await svc.login({ email: 'a@b.com', password: 'wrong-pass1' }).catch(() => undefined);
    await svc.login({ email: 'a@b.com', password: PASSWORD });
    expect(redis.store.has('auth:fail:u1')).toBe(false);
  });

  it('unknown email and wrong password give the same error (no enumeration)', async () => {
    const { svc, prisma } = setup();
    prisma.user.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(user());
    const a = await svc.login({ email: 'nobody@b.com', password: 'whatever1' }).catch((e) => e.response);
    const b = await svc.login({ email: 'a@b.com', password: 'whatever1' }).catch((e) => e.response);
    expect(a).toEqual(b);
  });

  it('blocks unverified emails only after the password is proven correct', async () => {
    const { svc, prisma } = setup();
    prisma.user.findFirst.mockResolvedValue(user({ emailVerifiedAt: null }));
    await expect(svc.login({ email: 'a@b.com', password: 'wrong-pass1' })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(svc.login({ email: 'a@b.com', password: PASSWORD })).rejects.toMatchObject({ response: { code: 'EMAIL_NOT_VERIFIED' } });
  });

  it('refuses admin-locked accounts (status LOCKED)', async () => {
    const { svc, prisma } = setup();
    prisma.user.findFirst.mockResolvedValue(user({ status: 'LOCKED' }));
    await expect(svc.login({ email: 'a@b.com', password: PASSWORD })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('refresh token rotation', () => {
  const row = (over: Record<string, unknown> = {}) => ({ id: 'r1', userId: 'u1', revokedAt: null, expiresAt: new Date(Date.now() + 1e6), user: user(), ...over });

  it('revokes the presented token and issues a new one', async () => {
    const { svc, prisma } = setup();
    prisma.refreshToken.findFirst.mockResolvedValue(row());
    const out = await svc.refresh('raw-token');
    expect(prisma.refreshToken.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { revokedAt: expect.any(Date) } });
    expect(prisma.refreshToken.create).toHaveBeenCalled();
    expect(out.refreshToken).not.toBe('raw-token');
  });

  it('replaying a revoked token revokes ALL of the user\'s sessions', async () => {
    const { svc, prisma } = setup();
    prisma.refreshToken.findFirst.mockResolvedValue(row({ revokedAt: new Date() }));
    await expect(svc.refresh('stolen')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
  });

  it('rejects missing, unknown and expired tokens', async () => {
    const { svc, prisma } = setup();
    await expect(svc.refresh(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    prisma.refreshToken.findFirst.mockResolvedValueOnce(null);
    await expect(svc.refresh('nope')).rejects.toBeInstanceOf(UnauthorizedException);
    prisma.refreshToken.findFirst.mockResolvedValueOnce(row({ expiresAt: new Date(Date.now() - 1) }));
    await expect(svc.refresh('old')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('AUTH-04 forgot / reset password', () => {
  it('mails a 30 min link for a known email, and stays silent for an unknown one', async () => {
    const { svc, prisma, mail, jwt } = setup();
    prisma.user.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(user());
    await svc.forgotPassword('nobody@b.com');
    expect(mail.send).not.toHaveBeenCalled();
    await svc.forgotPassword('a@b.com');
    const claims: any = jwt.verify(tokenIn(mail.send.mock.calls[0][0].text), { secret: 'unit-action' });
    expect(claims.purpose).toBe('reset-password');
    expect(claims.exp - claims.iat).toBe(1800);
  });

  it('reset sets a cost-12 hash, revokes every refresh token and clears the lock', async () => {
    const { svc, prisma, mail, redis } = setup();
    const u = user();
    prisma.user.findFirst.mockResolvedValue(u);
    await svc.forgotPassword('a@b.com');
    redis.store.set('auth:lock:u1', '1');
    await svc.resetPassword(tokenIn(mail.send.mock.calls[0][0].text), 'Brandnew1pw');
    const upd = prisma.user.update.mock.calls[0][0];
    expect(bcrypt.getRounds(upd.data.passwordHash)).toBe(12);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(redis.store.has('auth:lock:u1')).toBe(false);
  });

  it('a reset link is single-use: it fails once the password hash has changed', async () => {
    const { svc, prisma, mail } = setup();
    prisma.user.findFirst.mockResolvedValueOnce(user());
    await svc.forgotPassword('a@b.com');
    prisma.user.findFirst.mockResolvedValue(user({ passwordHash: bcrypt.hashSync('Another1pass', 4) })); // already changed
    await expect(svc.resetPassword(tokenIn(mail.send.mock.calls[0][0].text), 'Brandnew1pw')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AUTH-03 google login', () => {
  it('refuses to link/create an account from an unverified Google email', async () => {
    const { svc, prisma } = setup();
    prisma.authProvider = { findFirst: jest.fn(async () => null) };
    await expect(svc.googleLogin({ id: 'g1', email: 'a@b.com', emailVerified: false })).rejects.toMatchObject({ response: { code: 'GOOGLE_EMAIL_UNVERIFIED' } });
  });
});
