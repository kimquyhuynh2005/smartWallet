import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { currentBudgetPeriod } from '@smartwallet/shared';
import { AuditService } from '../common/audit.service';
import { PlansService } from '../common/plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildTemplateBudgets } from './onboarding';

const PURGE_AFTER_DAYS = 30;
const SAFE = {
  id: true, email: true, fullName: true, avatarUrl: true, role: true, status: true, locale: true,
  currency: true, monthStartDay: true, emailVerifiedAt: true, createdAt: true,
} as const;

@Injectable()
export class UsersService implements OnModuleInit {
  private log = new Logger('UsersService');

  constructor(private prisma: PrismaService, private plans: PlansService, private audit: AuditService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    const t = setInterval(() => this.purgeExpired().catch((e) => this.log.error(e)), 24 * 3600_000);
    t.unref();
  }

  /** USER-01 */
  async me(userId: string) {
    const u = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { ...SAFE, passwordHash: true } });
    if (!u) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' });
    const { passwordHash, ...rest } = u; // never expose the hash; expose whether one exists
    const [plan, wallets] = await Promise.all([this.plans.forUser(userId), this.prisma.wallet.count({ where: { userId, deletedAt: null } })]);
    return { ...rest, hasPassword: !!passwordHash, plan: plan.code, onboarded: wallets > 0 };
  }

  async update(userId: string, dto: Record<string, unknown>) {
    await this.prisma.user.update({ where: { id: userId }, data: dto });
    return this.me(userId);
  }

  /** USER-02: wallet + budget template in ONE database transaction, so a failure never leaves a half-onboarded user. */
  async onboard(userId: string, dto: { monthlyIncome: number; wallet: { name: string; type: any; openingBalance: number }; template: '50_30_20' | '6_JARS' | 'NONE' }) {
    const user = await this.prisma.user.findFirstOrThrow({ where: { id: userId, deletedAt: null } });
    if (await this.prisma.wallet.count({ where: { userId, deletedAt: null } })) {
      throw new ConflictException({ code: 'ONBOARDING_DONE', message: 'Onboarding already completed' });
    }
    const { limits } = await this.plans.forUser(userId);
    const tpl = buildTemplateBudgets(dto.template, dto.monthlyIncome);
    const cats = await this.prisma.category.findMany({ where: { userId: null, type: 'EXPENSE', deletedAt: null } });
    const idOf = new Map(cats.map((c) => [c.nameEn, c.id]));
    // respect the plan's budget cap: keep the total budget + the largest category budgets that fit
    const room = limits.max_budgets === null ? Infinity : Math.max(0, limits.max_budgets - 1);
    const items = [...tpl.items].sort((a, b) => b.limit - a.limit).slice(0, room);
    const { periodStart } = currentBudgetPeriod(new Date(), user.monthStartDay);

    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.create({
        data: { userId, name: dto.wallet.name, type: dto.wallet.type, openingBalance: BigInt(dto.wallet.openingBalance), currency: user.currency },
      });
      const rows = [
        ...(tpl.total > 0 ? [{ categoryId: null as string | null, limit: tpl.total }] : []),
        ...items.map((i) => ({ categoryId: idOf.get(i.categoryNameEn) ?? null, limit: i.limit })).filter((r) => r.categoryId),
      ];
      const budgets = [];
      for (const r of rows) {
        budgets.push(await tx.budget.create({ data: { userId, period: periodStart, categoryId: r.categoryId, limitAmount: BigInt(r.limit) } }));
      }
      const w = { id: wallet.id, name: wallet.name, type: wallet.type, openingBalance: wallet.openingBalance, currency: wallet.currency, color: wallet.color, isArchived: wallet.isArchived, balance: wallet.openingBalance, createdAt: wallet.createdAt, updatedAt: wallet.updatedAt };
      return { wallet: w, budgets };
    });
  }

  /** USER-03: soft delete now (login + tokens die immediately), hard purge after 30 days. */
  async remove(userId: string, dto: { password?: string }) {
    const user = await this.prisma.user.findFirstOrThrow({ where: { id: userId, deletedAt: null } });
    if (user.passwordHash && !(dto.password && (await bcrypt.compare(dto.password, user.passwordHash)))) {
      throw new ForbiddenException({ code: 'INVALID_PASSWORD', message: 'Password confirmation failed' });
    }
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { deletedAt: now } }),
      this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
      this.prisma.subscription.updateMany({ where: { userId, status: 'ACTIVE' }, data: { status: 'CANCELED' } }),
    ]);
    this.audit.record('ACCOUNT_DELETED', userId);
  }

  /** Hard-deletes accounts soft-deleted more than 30 days ago, children first. Returns the number purged. */
  async purgeExpired(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - PURGE_AFTER_DAYS * 86_400_000);
    const users = await this.prisma.user.findMany({ where: { deletedAt: { lt: cutoff } }, select: { id: true } });
    for (const { id: userId } of users) {
      await this.prisma.$transaction([
        this.prisma.goalContribution.deleteMany({ where: { goal: { userId } } }),
        this.prisma.goal.deleteMany({ where: { userId } }),
        this.prisma.transaction.deleteMany({ where: { userId } }),
        this.prisma.recurringRule.deleteMany({ where: { userId } }),
        this.prisma.budget.deleteMany({ where: { userId } }),
        this.prisma.categoryRule.deleteMany({ where: { userId } }),
        this.prisma.notification.deleteMany({ where: { userId } }),
        this.prisma.category.deleteMany({ where: { userId, parentId: { not: null } } }),
        this.prisma.category.deleteMany({ where: { userId } }),
        this.prisma.wallet.deleteMany({ where: { userId } }),
        this.prisma.subscription.deleteMany({ where: { userId } }),
        this.prisma.refreshToken.deleteMany({ where: { userId } }),
        this.prisma.authProvider.deleteMany({ where: { userId } }),
        this.prisma.user.delete({ where: { id: userId } }),
      ]);
      this.audit.record('ACCOUNT_PURGED', userId);
    }
    return users.length;
  }
}
