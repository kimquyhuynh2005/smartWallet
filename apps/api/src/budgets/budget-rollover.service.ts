import { Injectable } from '@nestjs/common';
import { formatPeriod, periodBounds, shiftPeriodStart } from '@smartwallet/shared';
import type { AuthUser } from '../common/jwt-auth.guard';
import { PlansService } from '../common/plans.service';
import { ReportCache } from '../common/report-cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { BudgetsService } from './budgets.service';

/**
 * BUD-03: moves the previous period's budgets into the target period (default: the current one).
 *   - CARRY_FORWARD budgets add what was left unspent (never a negative amount) on top of their BASE limit
 *     (base = limit - rollover_amount, so carried money is never carried twice).
 *   - NONE budgets are copied at their base limit.
 * Idempotent: running it again recomputes the carried part only and keeps manual edits to the base limit.
 */
@Injectable()
export class BudgetRolloverService {
  constructor(private prisma: PrismaService, private budgets: BudgetsService, private plans: PlansService, private cache: ReportCache) {}

  async rollover(user: AuthUser, dto: { period?: string }) {
    const target = await this.budgets.bounds(user.id, dto.period);
    const prevStart = shiftPeriodStart(target.periodStart, -1);
    const prev = { periodStart: prevStart, ...periodBounds(prevStart), label: formatPeriod(prevStart) };

    const prevBudgets = await this.prisma.budget.findMany({ where: { userId: user.id, period: prevStart, deletedAt: null } });
    const [spent, children] = await Promise.all([
      this.budgets.spentMap(user.id, prev.startsAt, prev.endsAt),
      this.budgets.childrenOf(prevBudgets.map((b) => b.categoryId).filter((x): x is string => !!x)),
    ]);
    const { limits } = await this.plans.forUser(user.id);

    let created = 0, updated = 0, skipped = 0, skippedForPlanLimit = 0, carriedOver = 0n;
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.budget.findMany({ where: { userId: user.id, period: target.periodStart } });
      const byCat = new Map(existing.map((b) => [b.categoryId, b]));
      let active = existing.filter((b) => !b.deletedAt).length;
      // total budget first, then the largest: if the plan is full the least important ones are dropped
      for (const b of [...prevBudgets].sort((x, y) => (x.categoryId === null ? -1 : y.categoryId === null ? 1 : Number(y.limitAmount - x.limitAmount)))) {
        const carry = b.rolloverMode === 'CARRY_FORWARD';
        const used = this.budgets.spentFor(b.categoryId, spent, children);
        const leftover = carry && b.limitAmount > used ? b.limitAmount - used : 0n;
        const cur = byCat.get(b.categoryId);
        if (cur && !cur.deletedAt) {
          if (!carry) { skipped++; continue; } // already exists and has nothing to carry
          const base = cur.limitAmount - cur.rolloverAmount; // keeps a manually edited base
          await tx.budget.update({ where: { id: cur.id }, data: { limitAmount: base + leftover, rolloverAmount: leftover } });
          carriedOver += leftover - cur.rolloverAmount > 0n ? leftover - cur.rolloverAmount : 0n;
          updated++;
        } else if (limits.max_budgets !== null && active >= limits.max_budgets) {
          skippedForPlanLimit++;
        } else {
          const data = { limitAmount: b.limitAmount - b.rolloverAmount + leftover, rolloverAmount: leftover, rolloverMode: b.rolloverMode, alertThresholds: b.alertThresholds, deletedAt: null };
          if (cur) await tx.budget.update({ where: { id: cur.id }, data });
          else await tx.budget.create({ data: { userId: user.id, period: target.periodStart, categoryId: b.categoryId, ...data } });
          carriedOver += leftover;
          created++; active++;
        }
      }
    });
    await this.cache.bump(user.id);
    return { period: target.label, from: prev.label, created, updated, skipped, skippedForPlanLimit, carriedOver, budgets: await this.budgets.listForPeriod(user.id, target) };
  }
}
