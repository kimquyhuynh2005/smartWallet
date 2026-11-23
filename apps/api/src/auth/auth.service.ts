import { BadRequestException, ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { AuditService } from '../common/audit.service';
import { PlansService } from '../common/plans.service';
import { RedisService } from '../common/redis.service';
import { MailService } from '../mail/mail.service';
import { resetPasswordMail, verifyEmailMail } from '../mail/templates';
import { PrismaService } from '../prisma/prisma.service';

export const BCRYPT_COST = 12;
export const MAX_FAILED_LOGINS = 5;
export const LOCK_SECONDS = 15 * 60;
export const REFRESH_TTL_MS = 7 * 24 * 3600_000;
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

type ActionPurpose = 'verify-email' | 'reset-password';
export interface GoogleProfile { id: string; email?: string; emailVerified?: boolean; name?: string; avatarUrl?: string }
export interface Tokens { accessToken: string; refreshToken: string }

@Injectable()
export class AuthService {
  private dummyHash?: string;

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private redis: RedisService,
    private mail: MailService,
    private plans: PlansService,
    private audit: AuditService,
  ) {}

  // ---------- AUTH-01 ----------
  async register(dto: { email: string; password: string; fullName: string }) {
    const email = dto.email.toLowerCase().trim();
    if (await this.prisma.user.findUnique({ where: { email } })) throw this.emailTaken();
    const free = await this.plans.freePlan();
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);
    let user;
    try {
      user = await this.prisma.user.create({
        data: { email, fullName: dto.fullName, passwordHash, subscriptions: { create: { planId: free.id, status: 'ACTIVE', currentPeriodStart: new Date() } } },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw this.emailTaken(); // lost a race on the unique index
      throw e;
    }
    await this.sendVerification(user);
    this.audit.record('REGISTER', user.id);
    return { id: user.id, email: user.email, fullName: user.fullName };
  }

  async verifyEmail(token: string) {
    const claims = this.readActionToken(token, 'verify-email');
    const user = await this.prisma.user.findFirst({ where: { id: claims.sub, deletedAt: null } });
    if (!user || user.email !== claims.email) throw this.invalidToken();
    if (!user.emailVerifiedAt) await this.prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    this.audit.record('EMAIL_VERIFIED', user.id);
  }

  // ---------- AUTH-02 + AUTH-05 ----------
  async login(dto: { email: string; password: string }, userAgent?: string): Promise<Tokens> {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findFirst({ where: { email, deletedAt: null } });
    if (!user || !user.passwordHash) {
      await bcrypt.compare(dto.password, await this.getDummyHash()); // equalise timing: do not reveal which emails exist
      throw this.invalidCredentials();
    }
    if (await this.redis.client.get(this.lockKey(user.id))) {
      this.audit.record('LOGIN_BLOCKED_LOCKED', user.id);
      throw this.locked();
    }
    if (!(await bcrypt.compare(dto.password, user.passwordHash))) {
      await this.registerFailure(user.id);
      throw this.invalidCredentials();
    }
    if (user.status !== 'ACTIVE') throw this.locked();
    if (!user.emailVerifiedAt) throw new ForbiddenException({ code: 'EMAIL_NOT_VERIFIED', message: 'Please verify your email first' });
    await this.redis.client.del(this.failKey(user.id));
    this.audit.record('LOGIN_SUCCESS', user.id);
    return this.issueTokens(user, userAgent);
  }

  /** Rotating refresh. A revoked token being replayed means theft: revoke the whole family (all sessions). */
  async refresh(raw: string | undefined, userAgent?: string): Promise<Tokens> {
    if (!raw) throw new UnauthorizedException();
    const row = await this.prisma.refreshToken.findFirst({ where: { tokenHash: sha256(raw), deletedAt: null }, include: { user: true } });
    if (!row) throw new UnauthorizedException();
    if (row.revokedAt) {
      await this.revokeAllRefreshTokens(row.userId);
      this.audit.record('REFRESH_REUSE_DETECTED', row.userId);
      throw new UnauthorizedException();
    }
    if (row.expiresAt < new Date() || row.user.deletedAt || row.user.status !== 'ACTIVE') throw new UnauthorizedException();
    await this.prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    return this.issueTokens(row.user, userAgent);
  }

  async logout(raw: string | undefined) {
    if (!raw) return;
    await this.prisma.refreshToken.updateMany({ where: { tokenHash: sha256(raw), revokedAt: null }, data: { revokedAt: new Date() } });
  }

  // ---------- AUTH-04 ----------
  /** Always resolves the same way whether or not the email exists (no account enumeration). */
  async forgotPassword(emailRaw: string) {
    const user = await this.prisma.user.findFirst({ where: { email: emailRaw.toLowerCase().trim(), deletedAt: null, status: 'ACTIVE' } });
    if (!user) return;
    const token = this.signActionToken({ sub: user.id, purpose: 'reset-password', pwf: this.fingerprint(user.passwordHash) }, '30m');
    await this.mail.send(resetPasswordMail(user.email, user.fullName, `${this.appUrl()}/reset-password?token=${token}`, user.locale));
    this.audit.record('PASSWORD_RESET_REQUESTED', user.id);
  }

  async resetPassword(token: string, password: string) {
    const claims = this.readActionToken(token, 'reset-password');
    const user = await this.prisma.user.findFirst({ where: { id: claims.sub, deletedAt: null } });
    // the fingerprint of the old hash makes every reset link single-use
    if (!user || claims.pwf !== this.fingerprint(user.passwordHash)) throw this.invalidToken();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await bcrypt.hash(password, BCRYPT_COST), emailVerifiedAt: user.emailVerifiedAt ?? new Date() }, // inbox access proves the email
      }),
      this.prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.redis.client.del(this.failKey(user.id), this.lockKey(user.id));
    this.audit.record('PASSWORD_CHANGED', user.id);
  }

  // ---------- AUTH-03 ----------
  async googleLogin(profile: GoogleProfile, userAgent?: string): Promise<Tokens> {
    const link = await this.prisma.authProvider.findFirst({ where: { provider: 'GOOGLE', providerUserId: profile.id, deletedAt: null }, include: { user: true } });
    let user = link?.user ?? null;
    if (!user) {
      if (!profile.email || !profile.emailVerified) throw new ForbiddenException({ code: 'GOOGLE_EMAIL_UNVERIFIED', message: 'Google account email is not verified' });
      const email = profile.email.toLowerCase();
      user = await this.prisma.user.findUnique({ where: { email } }); // include soft-deleted: the unique index still holds the email
      if (user?.deletedAt) throw this.locked();
      if (user) {
        await this.prisma.$transaction([
          this.prisma.authProvider.create({ data: { userId: user.id, provider: 'GOOGLE', providerUserId: profile.id } }),
          ...(user.emailVerifiedAt ? [] : [this.prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } })]),
        ]);
      } else {
        const free = await this.plans.freePlan();
        user = await this.prisma.user.create({
          data: {
            email, fullName: profile.name || email.split('@')[0], avatarUrl: profile.avatarUrl, emailVerifiedAt: new Date(),
            authProviders: { create: { provider: 'GOOGLE', providerUserId: profile.id } },
            subscriptions: { create: { planId: free.id, status: 'ACTIVE', currentPeriodStart: new Date() } },
          },
        });
      }
    }
    if (user.deletedAt || user.status !== 'ACTIVE') throw this.locked();
    this.audit.record('LOGIN_GOOGLE', user.id);
    return this.issueTokens(user, userAgent);
  }

  // ---------- helpers ----------
  async revokeAllRefreshTokens(userId: string) {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  private async registerFailure(userId: string) {
    const fails = await this.redis.client.incr(this.failKey(userId));
    if (fails === 1) await this.redis.client.expire(this.failKey(userId), LOCK_SECONDS);
    this.audit.record('LOGIN_FAILED', userId, { fails });
    if (fails >= MAX_FAILED_LOGINS) {
      await this.redis.client.set(this.lockKey(userId), '1', 'EX', LOCK_SECONDS);
      await this.redis.client.del(this.failKey(userId));
      this.audit.record('ACCOUNT_LOCKED', userId);
    }
  }

  private async issueTokens(user: { id: string; role: string }, userAgent?: string): Promise<Tokens> {
    const accessToken = this.jwt.sign({ sub: user.id, role: user.role }); // 15 min (module default)
    const refreshToken = randomBytes(48).toString('hex');
    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: sha256(refreshToken), expiresAt: new Date(Date.now() + REFRESH_TTL_MS), userAgent: userAgent?.slice(0, 255) },
    });
    return { accessToken, refreshToken };
  }

  private async sendVerification(user: { id: string; email: string; fullName: string; locale: string }) {
    const token = this.signActionToken({ sub: user.id, purpose: 'verify-email', email: user.email }, '24h');
    await this.mail.send(verifyEmailMail(user.email, user.fullName, `${this.appUrl()}/verify-email?token=${token}`, user.locale));
  }

  private signActionToken(payload: Record<string, unknown>, expiresIn: string) {
    return this.jwt.sign(payload, { secret: process.env.JWT_ACTION_SECRET, expiresIn });
  }

  private readActionToken(token: string, purpose: ActionPurpose): any {
    let claims: any;
    try {
      claims = this.jwt.verify(token, { secret: process.env.JWT_ACTION_SECRET });
    } catch (e: any) {
      throw new BadRequestException(e?.name === 'TokenExpiredError' ? { code: 'TOKEN_EXPIRED', message: 'Link has expired' } : { code: 'INVALID_TOKEN', message: 'Invalid link' });
    }
    if (claims.purpose !== purpose) throw this.invalidToken();
    return claims;
  }

  private fingerprint(hash: string | null) {
    return sha256(hash ?? '').slice(0, 16);
  }

  private async getDummyHash() {
    return (this.dummyHash ??= await bcrypt.hash('dummy-password', BCRYPT_COST));
  }

  private appUrl() { return process.env.APP_URL ?? 'http://localhost:5173'; }
  private failKey(id: string) { return `auth:fail:${id}`; }
  private lockKey(id: string) { return `auth:lock:${id}`; }
  private invalidToken() { return new BadRequestException({ code: 'INVALID_TOKEN', message: 'Invalid link' }); }
  private emailTaken() { return new ConflictException({ code: 'EMAIL_TAKEN', message: 'Email already registered' }); }
  private invalidCredentials() { return new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }); }
  private locked() { return new ForbiddenException({ code: 'ACCOUNT_LOCKED', message: 'Account is locked. Try again in 15 minutes.' }); }
}
