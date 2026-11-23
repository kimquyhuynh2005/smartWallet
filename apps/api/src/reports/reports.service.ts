import { ForbiddenException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { currentBudgetPeriod, formatPeriod, periodBounds, shiftPeriodStart } from '@smartwallet/shared';
import { BudgetsService, Bounds, computeProgress } from '../budgets/budgets.service';
import type { AuthUser } from '../common/jwt-auth.guard';
import { PlansService } from '../common/plans.service';
import { ReportCache } from '../common/report-cache.service';
import { GoalsService } from '../goals/goals.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { sanitizeCell } from '../transactions/csv';
import { WalletsService } from '../wallets/wallets.service';

const DAY = 86_400_000;
const VN = 'Asia/Ho_Chi_Minh';
export const EXPORT_MAX_ROWS = 50_000;
export const DASHBOARD_TTL = 60;

const n = (v: bigint | null | undefined) => Number(v ?? 0n);
const dayStrings = (b: Bounds) => Array.from({ length: Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / DAY) }, (_, i) => new Date(b.periodStart.getTime() + i * DAY).toISOString().slice(0, 10));

/** RFC-4180 cell + formula-injection guard (the same rule as CSV import) */
export const csvCell = (v: string | number | null | undefined): string => {
  const s = sanitizeCell(String(v ?? ''));
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService, private budgets: BudgetsService, private plans: PlansService, private cache: ReportCache,
    private wallets: WalletsService, private goals: GoalsService, private txns: TransactionsService,
  ) {}

  /** the period to report on, and the Free-plan history window check */
  private async context(userId: string, period?: string): Promise<Bounds> {
    const bounds = await this.budgets.bounds(userId, period);
    const { limits } = await this.plans.forUser(userId);
    const months = limits.history_months;
    if (months !== null) {
      const day = await this.budgets.monthStartDay(userId);
      const oldest = shiftPeriodStart(currentBudgetPeriod(new Date(), day).periodStart, -(months - 1)); // current period + the previous (months - 1)
      if (bounds.periodStart < oldest) {
        throw new ForbiddenException({ code: 'PLAN_LIMIT_REACHED', message: `Your plan includes ${months} months of report history`, details: { key: 'history_months', limit: months, oldestPeriod: formatPeriod(oldest) } });
      }
    }
    return bounds;
  }

  private info(b: Bounds, now = new Date()) {
    return { label: b.label, start: b.startsAt, end: b.endsAt, daysLeft: computeProgress(1n, 0n, now, b.startsAt, b.endsAt).daysLeft };
  }

  async totals(userId: string, b: Pick<Bounds, 'startsAt' | 'endsAt'>) {
    const rows = await this.prisma.transaction.groupBy({
      by: ['type'], where: { userId, deletedAt: null, type: { in: ['INCOME', 'EXPENSE'] }, occurredAt: { gte: b.startsAt, lt: b.endsAt } }, _sum: { amount: true },
    });
    const income = n(rows.find((r) => r.type === 'INCOME')?._sum.amount);
    const expense = n(rows.find((r) => r.type === 'EXPENSE')?._sum.amount);
    return { income, expense, net: income - expense, savingsRate: income > 0 ? Math.round(((income - expense) / income) * 1000) / 10 : null };
  }

  private async categoryItems(userId: string, b: Pick<Bounds, 'startsAt' | 'endsAt'>, type: 'INCOME' | 'EXPENSE') {
    const rows = await this.prisma.transaction.groupBy({
      by: ['categoryId'], where: { userId, deletedAt: null, type, occurredAt: { gte: b.startsAt, lt: b.endsAt } }, _sum: { amount: true }, _count: { _all: true },
    });
    const ids = rows.map((r) => r.categoryId).filter((x): x is string => !!x);
    const cats = ids.length ? await this.prisma.category.findMany({ where: { id: { in: ids } }, select: { id: true, parentId: true, nameVi: true, nameEn: true } }) : [];
    const total = rows.reduce((a, r) => a + n(r._sum.amount), 0);
    const items = rows
      .map((r) => {
        const c = cats.find((x) => x.id === r.categoryId);
        const t = n(r._sum.amount);
        return {
          categoryId: r.categoryId, parentId: c?.parentId ?? null, nameVi: c?.nameVi ?? 'Chưa phân loại', nameEn: c?.nameEn ?? 'Uncategorized',
          total: t, count: r._count._all, percent: total > 0 ? Math.round((t / total) * 10_000) / 100 : 0,
        };
      })
      .sort((a, c) => c.total - a.total);
    return { total, items };
  }

  async byCategory(user: AuthUser, q: { period?: string; type: 'INCOME' | 'EXPENSE' }) {
    const b = await this.context(user.id, q.period);
    const { total, items } = await this.categoryItems(user.id, b, q.type);
    return { period: this.info(b), type: q.type, total, items };
  }

  private async dailyPoints(userId: string, b: Bounds) {
    // occurred_at is a UTC wall-clock `timestamp`: tag it UTC first, then convert to Vietnam time to get the local calendar day
    const rows = await this.prisma.$queryRaw<{ d: string; type: string; total: bigint }[]>`
      SELECT to_char(date_trunc('day', (occurred_at AT TIME ZONE 'UTC') AT TIME ZONE ${VN}), 'YYYY-MM-DD') AS d, type::text AS type, SUM(amount)::bigint AS total
      FROM transactions
      WHERE user_id = ${userId}::uuid AND deleted_at IS NULL AND type::text IN ('INCOME', 'EXPENSE') AND occurred_at >= ${b.startsAt} AND occurred_at < ${b.endsAt}
      GROUP BY 1, 2`;
    const by = new Map<string, { income: number; expense: number }>(dayStrings(b).map((d) => [d, { income: 0, expense: 0 }]));
    for (const r of rows) {
      const e = by.get(r.d);
      if (e) e[r.type === 'INCOME' ? 'income' : 'expense'] = Number(r.total);
    }
    return [...by.entries()].map(([date, v]) => ({ date, ...v }));
  }

  async daily(user: AuthUser, period?: string) {
    const b = await this.context(user.id, period);
    return { period: this.info(b), days: await this.dailyPoints(user.id, b) };
  }

  private async trendPoints(userId: string, months: number, currentStart: Date) {
    const starts = Array.from({ length: months }, (_, i) => shiftPeriodStart(currentStart, -(months - 1 - i)));
    return Promise.all(starts.map(async (periodStart) => ({ period: formatPeriod(periodStart), start: periodBounds(periodStart).startsAt, ...(await (async () => { const { income, expense, net } = await this.totals(userId, periodBounds(periodStart)); return { income, expense, net }; })()) })));
  }

  /** RPT-02: 1-12 periods ending with the current one. Free plans are capped at plans.limits.history_months (6). */
  async trend(user: AuthUser, months: number) {
    const { limits } = await this.plans.forUser(user.id);
    if (limits.history_months !== null && months > limits.history_months) {
      throw new ForbiddenException({ code: 'PLAN_LIMIT_REACHED', message: `Your plan includes ${limits.history_months} months of report history`, details: { key: 'history_months', limit: limits.history_months } });
    }
    const current = (await this.budgets.bounds(user.id)).periodStart;
    return { months, points: await this.trendPoints(user.id, months, current) };
  }

  /** RPT-01: the whole dashboard in one call, cached for 60 s (and dropped immediately when the user's data changes). */
  async dashboard(user: AuthUser, period?: string) {
    const b = await this.context(user.id, period);
    const key = `dashboard:${b.label}`;
    const hit = await this.cache.get<any>(user.id, key);
    if (hit) return hit;

    const { limits } = await this.plans.forUser(user.id);
    const trendMonths = limits.history_months === null ? 6 : Math.min(6, limits.history_months);
    const [totals, wallets, budgets, cat, daily, trend, goals, recent] = await Promise.all([
      this.totals(user.id, b),
      this.wallets.list(user),
      this.budgets.listForPeriod(user.id, b),
      this.categoryItems(user.id, b, 'EXPENSE'),
      this.dailyPoints(user.id, b),
      this.trendPoints(user.id, trendMonths, b.periodStart),
      this.goals.list(user),
      this.txns.list(user, { page: 1, limit: 5, sort: 'occurredAt:desc' }),
    ]);
    const result = {
      period: this.info(b), totals,
      wallets: { total: wallets.reduce((a, w) => a + n(w.balance), 0), items: wallets.map((w) => ({ id: w.id, name: w.name, type: w.type, balance: w.balance })) },
      budgets, topCategories: cat.items.slice(0, 5), dailySpending: daily, trend,
      goals: goals.filter((g) => g.status === 'ACTIVE'), recentTransactions: recent.items, generatedAt: new Date().toISOString(),
    };
    await this.cache.set(user.id, key, result, DASHBOARD_TTL);
    return result;
  }

  /** RPT-03 (Premium): every transaction of the period as CSV (UTF-8 with BOM so Excel shows Vietnamese correctly). */
  async exportCsv(user: AuthUser, period?: string): Promise<{ filename: string; body: string }> {
    const b = await this.context(user.id, period);
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { locale: true } });
    const [wallets, cats] = await Promise.all([
      this.prisma.wallet.findMany({ where: { userId: user.id }, select: { id: true, name: true } }),
      this.prisma.category.findMany({ where: { OR: [{ userId: null }, { userId: user.id }] }, select: { id: true, nameEn: true, nameVi: true } }), // includes deleted ones: history keeps its labels
    ]);
    const wName = new Map(wallets.map((w) => [w.id, w.name]));
    const cName = new Map(cats.map((c) => [c.id, u.locale === 'en' ? c.nameEn : c.nameVi]));

    const lines = ['date,type,amount,wallet,to_wallet,category,note,source'];
    const where = { userId: user.id, deletedAt: null, occurredAt: { gte: b.startsAt, lt: b.endsAt } };
    let cursor: string | undefined;
    for (;;) {
      const rows = await this.prisma.transaction.findMany({ where, orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }], take: 2000, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}) });
      if (!rows.length) break;
      cursor = rows[rows.length - 1].id;
      for (const t of rows) {
        const local = new Date(t.occurredAt.getTime() + 7 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ');
        lines.push([local, t.type, t.amount.toString(), wName.get(t.walletId), t.transferWalletId ? wName.get(t.transferWalletId) : '', t.categoryId ? cName.get(t.categoryId) : '', t.note, t.source].map(csvCell).join(','));
      }
      if (lines.length - 1 > EXPORT_MAX_ROWS) throw new UnprocessableEntityException({ code: 'EXPORT_TOO_LARGE', message: `Exports are limited to ${EXPORT_MAX_ROWS} rows`, details: { max: EXPORT_MAX_ROWS } });
      if (rows.length < 2000) break;
    }
    return { filename: `smartwallet-${b.label}.csv`, body: '﻿' + lines.join('\r\n') + '\r\n' };
  }
}
