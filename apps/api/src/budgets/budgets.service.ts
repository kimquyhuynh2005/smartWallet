import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Budget } from '@prisma/client';
import { currentBudgetPeriod, formatPeriod, periodBounds, periodFromMonth } from '@smartwallet/shared';
import type { AuthUser } from '../common/jwt-auth.guard';
import { PlansService } from '../common/plans.service';
import { ReportCache } from '../common/report-cache.service';
import { PrismaService } from '../prisma/prisma.service';

const DAY = 86_400_000;

export interface Bounds { periodStart: Date; startsAt: Date; endsAt: Date; label: string }

/**
 * BUD-04 maths (pure).
 *   percentUsed      = spent / limit * 100          (2 decimals, may exceed 100)
 *   safeToSpendToday = max(0, limit - spent) / daysLeftInPeriod   (whole VND, rounded down; today counts as a day left)
 * A finished period has 0 days left, so nothing is "safe to spend" there.
 */
export function computeProgress(limit: bigint, spent: bigint, now: Date, startsAt: Date, endsAt: Date) {
  const remaining = limit - spent;
  const percentUsed = limit > 0n ? Number((spent * 10000n) / limit) / 100 : 0;
  const from = now > startsAt ? now : startsAt;
  const daysLeft = now >= endsAt ? 0 : Math.max(1, Math.ceil((endsAt.getTime() - from.getTime()) / DAY));
  const safeToSpendToday = remaining > 0n && daysLeft > 0 ? remaining / BigInt(daysLeft) : 0n;
  return { spent, remaining, percentUsed, safeToSpendToday, daysLeft };
}

@Injectable()
export class BudgetsService {
  constructor(private prisma: PrismaService, private plans: PlansService, private cache: ReportCache) {}

  async monthStartDay(userId: string) {
    return (await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { monthStartDay: true } })).monthStartDay;
  }

  /** `period` = YYYY-MM of the period's START (default: the current one). Respects the user's month_start_day. */
  async bounds(userId: string, period?: string): Promise<Bounds> {
    const day = await this.monthStartDay(userId);
    const periodStart = period ? periodFromMonth(period, day) : currentBudgetPeriod(new Date(), day).periodStart;
    return { periodStart, ...periodBounds(periodStart), label: formatPeriod(periodStart) };
  }

  /** category -> total expense in the window (null key = uncategorised). One GROUP BY, whatever the number of budgets. */
  async spentMap(userId: string, startsAt: Date, endsAt: Date): Promise<Map<string | null, bigint>> {
    const rows = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { userId, type: 'EXPENSE', deletedAt: null, occurredAt: { gte: startsAt, lt: endsAt } },
      _sum: { amount: true },
    });
    return new Map(rows.map((r) => [r.categoryId, r._sum.amount ?? 0n]));
  }

  async childrenOf(parentIds: string[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (!parentIds.length) return out;
    for (const c of await this.prisma.category.findMany({ where: { parentId: { in: parentIds }, deletedAt: null }, select: { id: true, parentId: true } })) {
      (out.get(c.parentId!) ?? out.set(c.parentId!, []).get(c.parentId!)!).push(c.id);
    }
    return out;
  }

  /** A category budget covers the category AND its sub-categories; the total budget (category null) covers every expense. */
  spentFor(categoryId: string | null, spent: Map<string | null, bigint>, children: Map<string, string[]>): bigint {
    if (categoryId === null) return [...spent.values()].reduce((a, b) => a + b, 0n);
    return [categoryId, ...(children.get(categoryId) ?? [])].reduce((a, id) => a + (spent.get(id) ?? 0n), 0n);
  }

  toView(b: Budget, spent: bigint, bounds: Pick<Bounds, 'startsAt' | 'endsAt' | 'label'>, now = new Date()) {
    return {
      id: b.id, period: bounds.label, periodStartsAt: bounds.startsAt, periodEndsAt: bounds.endsAt, categoryId: b.categoryId, limitAmount: b.limitAmount,
      rolloverMode: b.rolloverMode, rolloverAmount: b.rolloverAmount, alertThresholds: b.alertThresholds,
      ...computeProgress(b.limitAmount, spent, now, bounds.startsAt, bounds.endsAt), createdAt: b.createdAt, updatedAt: b.updatedAt,
    };
  }

  /** progress for many budgets of ONE period with two queries in total */
  async views(userId: string, budgets: Budget[], bounds: Bounds, now = new Date()) {
    if (!budgets.length) return [];
    const [spent, children] = await Promise.all([
      this.spentMap(userId, bounds.startsAt, bounds.endsAt),
      this.childrenOf(budgets.map((b) => b.categoryId).filter((x): x is string => !!x)),
    ]);
    return budgets.map((b) => this.toView(b, this.spentFor(b.categoryId, spent, children), bounds, now));
  }

  async listForPeriod(userId: string, bounds: Bounds) {
    const rows = await this.prisma.budget.findMany({
      where: { userId, period: bounds.periodStart, deletedAt: null },
      orderBy: [{ categoryId: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
    });
    return this.views(userId, rows, bounds);
  }

  /** BUD-04: GET /budgets?period=YYYY-MM */
  async list(user: AuthUser, period?: string) {
    return this.listForPeriod(user.id, await this.bounds(user.id, period));
  }

  private async assertThresholdsAllowed(userId: string, thresholds?: number[]) {
    if (thresholds && (await this.plans.forUser(userId)).code !== 'PREMIUM') {
      throw new ForbiddenException({ code: 'PLAN_LIMIT_REACHED', message: 'Custom alert thresholds require Premium', details: { feature: 'alert_thresholds' } });
    }
  }

  /** BUD-01: one budget per category (plus one total, category null) per period. max_budgets is enforced by PlanLimitGuard. */
  async create(user: AuthUser, dto: { categoryId: string | null; limitAmount: number; period?: string; rolloverMode?: 'NONE' | 'CARRY_FORWARD'; alertThresholds?: number[] }) {
    const bounds = await this.bounds(user.id, dto.period);
    await this.assertThresholdsAllowed(user.id, dto.alertThresholds);
    if (dto.categoryId) {
      const c = await this.prisma.category.findFirst({ where: { id: dto.categoryId, type: 'EXPENSE', deletedAt: null, OR: [{ userId: null }, { userId: user.id }] } });
      if (!c) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Category not found' });
    }
    const existing = await this.prisma.budget.findFirst({ where: { userId: user.id, period: bounds.periodStart, categoryId: dto.categoryId } });
    if (existing && !existing.deletedAt) throw new ConflictException({ code: 'BUDGET_EXISTS', message: 'A budget already exists for this category and period' });
    const data = {
      limitAmount: BigInt(dto.limitAmount), rolloverAmount: 0n,
      ...(dto.rolloverMode ? { rolloverMode: dto.rolloverMode } : {}), ...(dto.alertThresholds ? { alertThresholds: dto.alertThresholds } : {}),
    };
    const row = existing
      ? await this.prisma.budget.update({ where: { id: existing.id }, data: { ...data, deletedAt: null } }) // revive a soft-deleted row
      : await this.prisma.budget.create({ data: { userId: user.id, period: bounds.periodStart, categoryId: dto.categoryId, ...data } });
    await this.cache.bump(user.id);
    return (await this.views(user.id, [row], bounds))[0];
  }

  async update(user: AuthUser, id: string, dto: { limitAmount?: number; rolloverMode?: 'NONE' | 'CARRY_FORWARD'; alertThresholds?: number[] }) {
    const b = await this.prisma.budget.findFirst({ where: { id, userId: user.id, deletedAt: null } });
    if (!b) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Budget not found' });
    await this.assertThresholdsAllowed(user.id, dto.alertThresholds);
    const row = await this.prisma.budget.update({
      where: { id },
      data: {
        ...(dto.limitAmount !== undefined ? { limitAmount: BigInt(dto.limitAmount) } : {}),
        ...(dto.rolloverMode ? { rolloverMode: dto.rolloverMode } : {}),
        ...(dto.alertThresholds ? { alertThresholds: dto.alertThresholds } : {}),
      },
    });
    await this.cache.bump(user.id);
    const bounds: Bounds = { periodStart: row.period, ...periodBounds(row.period), label: formatPeriod(row.period) };
    return (await this.views(user.id, [row], bounds))[0];
  }

  async remove(user: AuthUser, id: string) {
    const b = await this.prisma.budget.findFirst({ where: { id, userId: user.id, deletedAt: null } });
    if (!b) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Budget not found' });
    await this.prisma.budget.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.cache.bump(user.id);
  }
}
