import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { alertDedupeKey, formatPeriod, periodBounds, periodStartFor, WS_EVENTS } from '@smartwallet/shared';
import { BudgetsService } from '../budgets/budgets.service';
import { TRANSACTION_CHANGED, TransactionChangedEvent } from '../common/events';
import { NotificationsService, parseSettings } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimePublisher } from '../realtime/realtime.gateway';

export interface TriggeredAlert {
  id: string;
  type: 'BUDGET_WARNING' | 'BUDGET_EXCEEDED';
  threshold: number;
  budgetId: string;
  categoryId: string | null;
  percentUsed: number;
  message: string;
}

/**
 * Thresholds crossed UPWARD by this change: spent was below the line before, and is at/above it now. Exact integer maths (no floats).
 * Dropping back under a line and crossing it again is still "crossed", but the unique dedupe_key keeps it to one alert per period.
 */
export function crossedUpward(before: bigint, now: bigint, limit: bigint, thresholds: number[]): number[] {
  if (limit <= 0n) return [];
  return [...thresholds].sort((a, b) => a - b).filter((t) => before * 100n < BigInt(t) * limit && now * 100n >= BigInt(t) * limit);
}

interface Delta { categoryId: string | null; amount: bigint }

/**
 * ALR-01: on transaction.changed, recompute what the affected budgets (the category's, its parent's, and the total) have spent,
 * insert one notification per newly crossed threshold (unique dedupe_key budget:{id}:{threshold}), push it live, queue the email,
 * and tell the UI the budget moved (budget:updated). Returns the alerts so POST /transactions can echo them as triggeredAlerts.
 */
@Injectable()
export class BudgetEvaluator {
  constructor(private prisma: PrismaService, private budgets: BudgetsService, private notifications: NotificationsService, private realtime: RealtimePublisher) {}

  @OnEvent(TRANSACTION_CHANGED)
  onTransactionChanged(e: TransactionChangedEvent) {
    return this.evaluate(e);
  }

  async evaluate(e: TransactionChangedEvent): Promise<{ triggeredAlerts: TriggeredAlert[] }> {
    const rows = [...e.current.map((s) => ({ s, sign: 1n })), ...e.previous.map((s) => ({ s, sign: -1n }))].filter((r) => r.s.type === 'EXPENSE');
    if (!rows.length) return { triggeredAlerts: [] };
    const user = await this.prisma.user.findUnique({ where: { id: e.userId }, select: { monthStartDay: true, notificationSettings: true } });
    if (!user) return { triggeredAlerts: [] };
    const settings = parseSettings(user.notificationSettings);

    // a change can touch more than one period (a back-dated expense lands in an older one)
    const periods = new Map<number, { periodStart: Date; deltas: Delta[] }>();
    for (const { s, sign } of rows) {
      const periodStart = periodStartFor(s.occurredAt, user.monthStartDay);
      const p = periods.get(periodStart.getTime()) ?? { periodStart, deltas: [] };
      p.deltas.push({ categoryId: s.categoryId, amount: sign * BigInt(s.amount) });
      periods.set(periodStart.getTime(), p);
    }

    const triggeredAlerts: TriggeredAlert[] = [];
    for (const p of periods.values()) triggeredAlerts.push(...(await this.evaluatePeriod(e.userId, settings.inApp, p.periodStart, p.deltas)));
    return { triggeredAlerts };
  }

  private async evaluatePeriod(userId: string, inApp: boolean, periodStart: Date, deltas: Delta[]): Promise<TriggeredAlert[]> {
    const bounds = { periodStart, ...periodBounds(periodStart), label: formatPeriod(periodStart) };
    const touched = [...new Set(deltas.map((d) => d.categoryId).filter((x): x is string => !!x))];
    const parents = touched.length ? await this.prisma.category.findMany({ where: { id: { in: touched } }, select: { parentId: true } }) : [];
    const candidates = [...new Set([...touched, ...parents.map((c) => c.parentId).filter((x): x is string => !!x)])];

    const budgets = await this.prisma.budget.findMany({
      where: { userId, period: periodStart, deletedAt: null, OR: [{ categoryId: null }, ...(candidates.length ? [{ categoryId: { in: candidates } }] : [])] },
    });
    if (!budgets.length) return [];
    const catIds = budgets.map((b) => b.categoryId).filter((x): x is string => !!x);
    const [spent, children, names] = await Promise.all([
      this.budgets.spentMap(userId, bounds.startsAt, bounds.endsAt),
      this.budgets.childrenOf(catIds),
      catIds.length ? this.prisma.category.findMany({ where: { id: { in: catIds } }, select: { id: true, nameEn: true, nameVi: true } }) : [],
    ]);
    const nameOf = new Map(names.map((c) => [c.id, c]));

    const alerts: TriggeredAlert[] = [];
    for (const b of budgets) {
      const now = this.budgets.spentFor(b.categoryId, spent, children);
      const family = b.categoryId === null ? null : new Set([b.categoryId, ...(children.get(b.categoryId) ?? [])]);
      const delta = deltas.filter((d) => family === null || (d.categoryId !== null && family.has(d.categoryId))).reduce((a, d) => a + d.amount, 0n);
      const before = now - delta > 0n ? now - delta : 0n;

      if (inApp) this.realtime.emit(userId, WS_EVENTS.budget, this.budgets.toView(b, now, bounds)); // live progress, even when no threshold was crossed

      const percentUsed = Number((now * 100n) / b.limitAmount); // whole percent, rounded down: 1,650,000 of 2,000,000 -> 82
      const cat = b.categoryId ? nameOf.get(b.categoryId) : null;
      const en = cat?.nameEn ?? 'total budget';
      const vi = cat?.nameVi ?? 'tổng ngân sách';
      for (const threshold of crossedUpward(before, now, b.limitAmount, b.alertThresholds)) {
        const type = threshold >= 100 ? ('BUDGET_EXCEEDED' as const) : ('BUDGET_WARNING' as const);
        const result = await this.notifications.notify(userId, {
          type,
          dedupeKey: alertDedupeKey(b.id, threshold),
          message: { en: `${percentUsed}% of ${en} used`, vi: `Đã dùng ${percentUsed}% ngân sách ${vi}` },
          payload: { budgetId: b.id, categoryId: b.categoryId, categoryName: { en: cat?.nameEn ?? null, vi: cat?.nameVi ?? null }, threshold, percentUsed, spent: Number(now), limit: Number(b.limitAmount), period: bounds.label },
        });
        if (result?.inApp) alerts.push({ id: result.notification.id, type, threshold, budgetId: b.id, categoryId: b.categoryId, percentUsed, message: result.notification.message });
      }
    }
    return alerts;
  }
}
