import { Injectable, Logger } from '@nestjs/common';
import { BudgetsService } from '../budgets/budgets.service';
import { Localized, NotificationsService, parseSettings } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { isoWeekKey, vnd } from './week';

const PAGE = 200;
const WEEK_MS = 7 * 86_400_000;

export interface WeeklyData {
  income: number; expense: number; transactions: number;
  top: { nameEn: string; nameVi: string; total: number }[];
  budgetsOver: number; budgetsNear: number;
  goals: { name: string; percent: number }[];
}

/** Pure: the weekly summary text in both languages. */
export function renderWeekly(d: WeeklyData): Localized {
  const net = d.income - d.expense;
  const parts = (loc: 'en' | 'vi') => {
    const money = (n: number) => vnd(n, 'vi-VN');
    const topS = d.top.length ? d.top.map((t) => `${loc === 'en' ? t.nameEn : t.nameVi} ${money(t.total)}`).join(', ') : '';
    const bud = d.budgetsOver || d.budgetsNear
      ? (loc === 'en' ? `Budgets: ${d.budgetsOver} over the limit, ${d.budgetsNear} close to it.` : `Ngân sách: ${d.budgetsOver} vượt hạn mức, ${d.budgetsNear} sắp chạm hạn mức.`)
      : '';
    const goals = d.goals.length ? (loc === 'en' ? 'Goals: ' : 'Mục tiêu: ') + d.goals.map((g) => `${g.name} ${g.percent}%`).join(', ') + '.' : '';
    const head = loc === 'en'
      ? `Your week: spent ${money(d.expense)}, earned ${money(d.income)} (net ${net >= 0 ? '+' : ''}${money(net)}).`
      : `Tuần của bạn: chi ${money(d.expense)}, thu ${money(d.income)} (chênh lệch ${net >= 0 ? '+' : ''}${money(net)}).`;
    return [head, topS && (loc === 'en' ? `Top spending: ${topS}.` : `Chi nhiều nhất: ${topS}.`), bud, goals].filter(Boolean).join(' ');
  };
  return { en: parts('en'), vi: parts('vi') };
}

/** ALR-03: Monday 09:00 (Vietnam) weekly summary. One per user per week: the notification's dedupe key (weekly:{user}:{monday}) makes re-runs harmless. */
@Injectable()
export class WeeklySummaryService {
  private log = new Logger('WeeklySummary');
  constructor(private prisma: PrismaService, private budgets: BudgetsService, private notifications: NotificationsService) {}

  /** `only` restricts the run to specific users (ops tooling and tests); the scheduled job runs for everyone. */
  async run(now = new Date(), only?: string[]): Promise<{ users: number; sent: number }> {
    const week = isoWeekKey(now);
    let users = 0, sent = 0;
    let cursor: string | undefined;
    for (;;) {
      const page = await this.prisma.user.findMany({
        where: { deletedAt: null, status: 'ACTIVE', emailVerifiedAt: { not: null }, ...(only ? { id: { in: only } } : {}) },
        select: { id: true, notificationSettings: true },
        orderBy: { id: 'asc' }, take: PAGE, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (!page.length) break;
      cursor = page[page.length - 1].id;
      for (const u of page) {
        if (!parseSettings(u.notificationSettings).weeklySummary) continue;
        users++;
        try {
          const data = await this.collect(u.id, now);
          if (!data.transactions) continue; // nothing happened: do not send an empty email
          const message = renderWeekly(data);
          const r = await this.notifications.notify(u.id, {
            type: 'SYSTEM', dedupeKey: `weekly:${u.id}:${week}`, payload: { kind: 'weekly_summary', week, ...data }, message,
            emailSubject: { en: 'Your SmartWallet week', vi: 'Tuần của bạn trên SmartWallet' },
          });
          if (r) sent++;
        } catch (e) { this.log.error(`weekly summary failed for ${u.id}: ${(e as Error).message}`); }
      }
      if (page.length < PAGE) break;
    }
    return { users, sent };
  }

  async collect(userId: string, now: Date): Promise<WeeklyData> {
    const range = { gte: new Date(now.getTime() - WEEK_MS), lt: now };
    const base = { userId, deletedAt: null, occurredAt: range };
    const [totals, transactions, top, goals] = await Promise.all([
      this.prisma.transaction.groupBy({ by: ['type'], where: { ...base, type: { in: ['INCOME', 'EXPENSE'] } }, _sum: { amount: true } }),
      this.prisma.transaction.count({ where: base }),
      this.prisma.transaction.groupBy({ by: ['categoryId'], where: { ...base, type: 'EXPENSE', categoryId: { not: null } }, _sum: { amount: true }, orderBy: { _sum: { amount: 'desc' } }, take: 3 }),
      this.prisma.goal.findMany({ where: { userId, deletedAt: null, status: 'ACTIVE' }, take: 3, orderBy: { createdAt: 'asc' } }),
    ]);
    const cats = top.length ? await this.prisma.category.findMany({ where: { id: { in: top.map((t) => t.categoryId!) } }, select: { id: true, nameEn: true, nameVi: true } }) : [];
    const sum = (t: string) => Number(totals.find((r) => r.type === t)?._sum.amount ?? 0n);
    const bounds = await this.budgets.bounds(userId);
    const views = await this.budgets.listForPeriod(userId, bounds);
    return {
      income: sum('INCOME'), expense: sum('EXPENSE'), transactions,
      top: top.flatMap((t) => { const c = cats.find((x) => x.id === t.categoryId); return c ? [{ nameEn: c.nameEn, nameVi: c.nameVi, total: Number(t._sum.amount ?? 0n) }] : []; }),
      budgetsOver: views.filter((v) => v.percentUsed >= 100).length,
      budgetsNear: views.filter((v) => v.percentUsed >= 80 && v.percentUsed < 100).length,
      goals: goals.map((g) => ({ name: g.name, percent: Number((g.savedAmount * 100n) / g.targetAmount) })),
    };
  }
}
