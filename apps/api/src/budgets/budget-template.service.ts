import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { BUDGET_TEMPLATES, periodBounds, shiftPeriodStart } from '@smartwallet/shared';
import { CategoriesService } from '../categories/categories.service';
import type { AuthUser } from '../common/jwt-auth.guard';
import { PlansService } from '../common/plans.service';
import { ReportCache } from '../common/report-cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { BudgetsService } from './budgets.service';
import { planTemplate } from './templates';

export interface ApplyTemplateInput {
  template: '50_30_20' | '6_JARS' | 'CUSTOM';
  monthlyIncome: number;
  period?: string;
  overwrite: boolean;
  groups?: { name: string; percent: number; categoryIds: string[] }[];
}

/** BUD-02: turns a template (or custom percentages that total 100) into budgets, splitting each group by the user's last 3 months of spending. */
@Injectable()
export class BudgetTemplateService {
  constructor(private prisma: PrismaService, private budgets: BudgetsService, private categories: CategoriesService, private plans: PlansService, private cache: ReportCache) {}

  /** group -> category ids (standard templates reference system categories by English name) */
  private async resolveGroups(user: AuthUser, dto: ApplyTemplateInput): Promise<{ percent: number; ids: string[] }[]> {
    if (dto.template === 'CUSTOM') {
      const seen = new Set<string>();
      for (const g of dto.groups!) {
        for (const id of g.categoryIds) {
          if (seen.has(id)) throw new UnprocessableEntityException({ code: 'DUPLICATE_CATEGORY', message: 'A category can belong to one group only', details: { categoryId: id } });
          seen.add(id);
          await this.categories.assertUsable(user.id, id, 'EXPENSE'); // 404 if not visible, 422 if it is an income category
        }
      }
      return dto.groups!.map((g) => ({ percent: g.percent, ids: g.categoryIds }));
    }
    const sys = await this.prisma.category.findMany({ where: { userId: null, type: 'EXPENSE', deletedAt: null }, select: { id: true, nameEn: true } });
    const byName = new Map(sys.map((c) => [c.nameEn, c.id]));
    return BUDGET_TEMPLATES[dto.template].map((g) => ({ percent: g.percent, ids: g.categories.map((n) => byName.get(n)).filter((x): x is string => !!x) }));
  }

  async apply(user: AuthUser, dto: ApplyTemplateInput) {
    const bounds = await this.budgets.bounds(user.id, dto.period);
    const groups = await this.resolveGroups(user, dto);
    const allIds = groups.flatMap((g) => g.ids);

    // spending of the 3 periods before this one, rolled up into the group's categories (sub-category spend counts for its parent)
    const historyStart = periodBounds(shiftPeriodStart(bounds.periodStart, -3)).startsAt;
    const [spend, children] = await Promise.all([this.budgets.spentMap(user.id, historyStart, bounds.startsAt), this.budgets.childrenOf(allIds)]);
    const weights: Record<string, number> = {};
    for (const id of allIds) weights[id] = Number(this.budgets.spentFor(id, spend, children));

    const plan = planTemplate(groups.map((g) => ({ percent: g.percent, keys: g.ids })), dto.monthlyIncome, weights);
    const wanted: { categoryId: string | null; limit: number }[] = [
      ...(plan.total > 0 ? [{ categoryId: null, limit: plan.total }] : []),
      ...[...plan.items].sort((a, b) => b.limit - a.limit).map((i) => ({ categoryId: i.key, limit: i.limit })),
    ];

    const { limits } = await this.plans.forUser(user.id);
    let created = 0, updated = 0, skipped = 0, truncated = 0;
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.budget.findMany({ where: { userId: user.id, period: bounds.periodStart } });
      const byCat = new Map(existing.map((b) => [b.categoryId, b]));
      let active = existing.filter((b) => !b.deletedAt).length;
      for (const w of wanted) {
        const cur = byCat.get(w.categoryId);
        if (cur && !cur.deletedAt) {
          if (dto.overwrite) { await tx.budget.update({ where: { id: cur.id }, data: { limitAmount: BigInt(w.limit) } }); updated++; } else skipped++;
        } else if (limits.max_budgets !== null && active >= limits.max_budgets) {
          truncated++; // plan is full: the biggest budgets were created first, the smallest are dropped
        } else {
          if (cur) await tx.budget.update({ where: { id: cur.id }, data: { limitAmount: BigInt(w.limit), rolloverAmount: 0n, deletedAt: null } });
          else await tx.budget.create({ data: { userId: user.id, period: bounds.periodStart, categoryId: w.categoryId, limitAmount: BigInt(w.limit) } });
          created++; active++;
        }
      }
    });
    await this.cache.bump(user.id);
    return {
      period: bounds.label, template: dto.template, totalBudget: plan.total, reservedForSavings: plan.reservedForSavings,
      created, updated, skipped, truncatedByPlan: truncated, budgets: await this.budgets.listForPeriod(user.id, bounds),
    };
  }
}
