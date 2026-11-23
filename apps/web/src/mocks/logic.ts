import { alertDedupeKey, currentBudgetPeriod, formatPeriod, normalizeText, periodBounds, periodFromMonth, shiftPeriodStart } from '@smartwallet/shared';
import { mockBus } from './bus';
import { db, GLOBAL_RULES, iso, SYSTEM_CATEGORIES, uuid, type BudgetRec, type NotificationRec, type TxnRec, type UserRec, type WalletRec } from './db';

const DAY = 86_400_000;
export const FREE_LIMITS = { max_wallets: 3, max_budgets: 5, max_goals: 2, history_months: 6 };
export const PREMIUM_LIMITS = { max_wallets: null, max_budgets: null, max_goals: null, history_months: null };
export const limitsOf = (u: UserRec) => (u.plan === 'PREMIUM' ? PREMIUM_LIMITS : FREE_LIMITS);

export const userTxns = (userId: string) => db.txns.filter((t) => t.userId === userId && !t.deletedAt);

// ---------------- wallets ----------------
export function walletBalance(w: WalletRec): number {
  let b = w.openingBalance;
  for (const t of db.txns) {
    if (t.deletedAt) continue;
    if (t.walletId === w.id) b += t.type === 'INCOME' ? t.amount : -t.amount; // expense and transfer-out reduce
    if (t.type === 'TRANSFER' && t.transferWalletId === w.id) b += t.amount;
  }
  return b;
}
export const walletView = (w: WalletRec) => ({ id: w.id, name: w.name, type: w.type, openingBalance: w.openingBalance, currency: w.currency, color: w.color, isArchived: w.isArchived, balance: walletBalance(w), createdAt: w.createdAt, updatedAt: w.updatedAt });

export const txnView = (t: TxnRec) => ({
  id: t.id, walletId: t.walletId, transferWalletId: t.transferWalletId, categoryId: t.categoryId, type: t.type, amount: t.amount, occurredAt: t.occurredAt, note: t.note,
  receiptUrl: t.receiptKey ? `https://receipts.smartwallet.demo/${t.receiptKey}?sig=mock` : null, recurringRuleId: t.recurringRuleId, source: t.source, createdAt: t.createdAt, updatedAt: t.updatedAt,
});

// ---------------- categories ----------------
export function categoriesFor(userId: string) {
  const sys = SYSTEM_CATEGORIES.map((c) => ({ id: c.id, isSystem: true, parentId: null as string | null, nameVi: c.nameVi, nameEn: c.nameEn, type: c.type, icon: c.icon, color: c.color }));
  const own = db.categories.filter((c) => c.userId === userId).map((c) => ({ id: c.id, isSystem: false, parentId: c.parentId, nameVi: c.nameVi, nameEn: c.nameEn, type: c.type, icon: c.icon, color: c.color }));
  return [...sys, ...own];
}
export function familyOf(userId: string, categoryId: string): string[] {
  return [categoryId, ...db.categories.filter((c) => c.userId === userId && c.parentId === categoryId).map((c) => c.id)];
}

// ---------------- periods and budgets ----------------
const monthStartDay = (userId: string) => db.users.find((u) => u.id === userId)?.monthStartDay ?? 1;
export function boundsFor(userId: string, period?: string) {
  const day = monthStartDay(userId);
  const periodStart = period ? periodFromMonth(period, day) : currentBudgetPeriod(new Date(), day).periodStart;
  return { periodStart, ...periodBounds(periodStart), label: formatPeriod(periodStart) };
}
export function spentInRange(userId: string, categoryId: string | null, startsAt: Date, endsAt: Date): number {
  const cats = categoryId ? new Set(familyOf(userId, categoryId)) : null;
  return userTxns(userId)
    .filter((t) => t.type === 'EXPENSE' && new Date(t.occurredAt) >= startsAt && new Date(t.occurredAt) < endsAt && (!cats || (t.categoryId && cats.has(t.categoryId))))
    .reduce((a, t) => a + t.amount, 0);
}
export function spentInPeriod(userId: string, categoryId: string | null, at: Date): number {
  const b = boundsFor(userId);
  void at;
  return spentInRange(userId, categoryId, b.startsAt, b.endsAt);
}

export function computeProgress(limit: number, spent: number, now: Date, startsAt: Date, endsAt: Date) {
  const remaining = limit - spent;
  const percentUsed = limit > 0 ? Math.floor((spent * 10000) / limit) / 100 : 0;
  const from = now > startsAt ? now : startsAt;
  const daysLeft = now >= endsAt ? 0 : Math.max(1, Math.ceil((endsAt.getTime() - from.getTime()) / DAY));
  return { spent, remaining, percentUsed, safeToSpendToday: remaining > 0 && daysLeft > 0 ? Math.floor(remaining / daysLeft) : 0, daysLeft };
}
export function budgetView(b: BudgetRec) {
  const periodStart = new Date(b.period);
  const bounds = periodBounds(periodStart);
  const spent = spentInRange(b.userId, b.categoryId, bounds.startsAt, bounds.endsAt);
  return {
    id: b.id, period: formatPeriod(periodStart), periodStartsAt: iso(bounds.startsAt), periodEndsAt: iso(bounds.endsAt), categoryId: b.categoryId, limitAmount: b.limitAmount,
    rolloverMode: b.rolloverMode, rolloverAmount: b.rolloverAmount, alertThresholds: b.alertThresholds, ...computeProgress(b.limitAmount, spent, new Date(), bounds.startsAt, bounds.endsAt),
    createdAt: b.createdAt, updatedAt: b.updatedAt,
  };
}
export const budgetsOfPeriod = (userId: string, periodStart: Date) =>
  db.budgets.filter((b) => b.userId === userId && !b.deletedAt && new Date(b.period).getTime() === periodStart.getTime()).sort((a, b) => (a.categoryId === null ? -1 : b.categoryId === null ? 1 : a.createdAt.localeCompare(b.createdAt)));

// ---------------- alerts (same rule as the API: thresholds crossed UPWARD by this change, once per budget) ----------------
export interface MockAlert { id: string; type: 'BUDGET_WARNING' | 'BUDGET_EXCEEDED'; threshold: number; budgetId: string; categoryId: string | null; percentUsed: number; message: string }

export function notificationView(n: NotificationRec, locale: string) {
  return { id: n.id, type: n.type, message: locale === 'en' ? n.message.en : n.message.vi, payload: n.payload, readAt: n.readAt, createdAt: n.createdAt };
}

export function evaluateAlerts(userId: string, t: TxnRec, before: number | null): MockAlert[] {
  if (t.type !== 'EXPENSE') return [];
  const user = db.users.find((u) => u.id === userId)!;
  const { periodStart } = currentBudgetPeriod(new Date(t.occurredAt), user.monthStartDay);
  const bounds = periodBounds(periodStart);
  void before;
  const fam = (b: BudgetRec) => (b.categoryId ? new Set(familyOf(userId, b.categoryId)) : null);
  const alerts: MockAlert[] = [];
  for (const b of budgetsOfPeriod(userId, periodStart)) {
    const f = fam(b);
    if (f && !(t.categoryId && f.has(t.categoryId))) continue;
    const now = spentInRange(userId, b.categoryId, bounds.startsAt, bounds.endsAt);
    const prev = now - t.amount;
    const view = budgetView(b);
    if (user.settings.inApp) mockBus.emit(userId, 'budget:updated', view);
    for (const th of [...b.alertThresholds].sort((a, c) => a - c)) {
      if (!(prev * 100 < th * b.limitAmount && now * 100 >= th * b.limitAmount)) continue;
      const key = alertDedupeKey(b.id, th);
      if (db.notifications.some((n) => n.dedupeKey === key)) continue; // once per budget per period
      const pct = Math.floor((now * 100) / b.limitAmount);
      const cat = b.categoryId ? SYSTEM_CATEGORIES.find((c) => c.id === b.categoryId) ?? db.categories.find((c) => c.id === b.categoryId) : null;
      const en = (cat as { nameEn?: string } | null)?.nameEn ?? 'total budget';
      const vi = (cat as { nameVi?: string } | null)?.nameVi ?? 'tổng ngân sách';
      const n: NotificationRec = {
        id: uuid(), userId, type: th >= 100 ? 'BUDGET_EXCEEDED' : 'BUDGET_WARNING', dedupeKey: key, readAt: null, createdAt: iso(Date.now()),
        message: { en: `${pct}% of ${en} used`, vi: `Đã dùng ${pct}% ngân sách ${vi}` }, payload: { budgetId: b.id, categoryId: b.categoryId, threshold: th, percentUsed: pct, spent: now, limit: b.limitAmount },
      };
      db.notifications.push(n);
      if (user.settings.inApp) {
        const v = notificationView(n, user.locale);
        mockBus.emit(userId, 'notification:new', v);
        alerts.push({ id: n.id, type: n.type as MockAlert['type'], threshold: th, budgetId: b.id, categoryId: b.categoryId, percentUsed: pct, message: v.message });
      }
    }
  }
  return alerts;
}

// ---------------- auto-categorization (CAT-03): the same scoring idea as the API ----------------
const STOP = new Set(['di', 'o', 'tai', 'cho', 'va', 'la', 'cua', 'cac', 'mot', 'voi', 'de', 'tu', 'den', 've', 'tien', 'mon', 'thang']);
const conf = (score: number, total: number) => (score > 0 && total > 0 ? Math.round((score / total) * (1 - Math.exp(-score)) * 100) / 100 : 0);
export function suggestFor(userId: string, note: string, amount?: number, type?: 'INCOME' | 'EXPENSE') {
  const norm = normalizeText(note);
  if (!norm) return { suggestions: [], preselectedCategoryId: null };
  const hay = ` ${norm} `;
  const scores = new Map<string, { s: number; why: Set<string> }>();
  const add = (id: string, pts: number, why: string) => { const e = scores.get(id) ?? { s: 0, why: new Set() }; e.s += pts; e.why.add(why); scores.set(id, e); };
  for (const [cat, kws] of Object.entries(GLOBAL_RULES)) for (const kw of kws) if (hay.includes(` ${kw} `)) add(cat, 1, 'global_keyword');
  const tokens = norm.split(' ').filter((t) => t.length >= 2 && !/^\d+$/.test(t) && !STOP.has(t));
  const since = Date.now() - 90 * DAY;
  const perToken = new Map<string, Map<string, number>>();
  for (const t of userTxns(userId)) {
    if (!t.categoryId || !t.note || new Date(t.occurredAt).getTime() < since) continue;
    const words = new Set(normalizeText(t.note).split(' '));
    for (const tok of tokens) if (words.has(tok)) { const m = perToken.get(tok) ?? perToken.set(tok, new Map()).get(tok)!; m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + 1); }
  }
  for (const m of perToken.values()) {
    let best: [string, number] | null = null;
    for (const [c, n] of m) if (!best || n > best[1]) best = [c, n];
    if (best) add(best[0], 1 + Math.min(best[1] - 1, 4) * 0.25, 'history');
  }
  void amount;
  let cand = [...scores.entries()].filter(([id]) => { const c = SYSTEM_CATEGORIES.find((x) => x.id === id) ?? db.categories.find((x) => x.id === id); return !!c && (!type || c.type === type); });
  const total = cand.reduce((a, [, e]) => a + e.s, 0);
  cand = cand.sort((a, b) => b[1].s - a[1].s).slice(0, 3);
  const suggestions = cand.map(([id, e]) => {
    const c = (SYSTEM_CATEGORIES.find((x) => x.id === id) ?? db.categories.find((x) => x.id === id))!;
    return { categoryId: id, confidence: conf(e.s, total), nameVi: c.nameVi, nameEn: c.nameEn, type: c.type, reasons: [...e.why] };
  });
  return { suggestions, preselectedCategoryId: suggestions[0] && suggestions[0].confidence >= 0.6 ? suggestions[0].categoryId : null };
}

// ---------------- reports ----------------
export function totalsFor(userId: string, startsAt: Date, endsAt: Date) {
  let income = 0, expense = 0;
  for (const t of userTxns(userId)) {
    const at = new Date(t.occurredAt);
    if (at < startsAt || at >= endsAt) continue;
    if (t.type === 'INCOME') income += t.amount; else if (t.type === 'EXPENSE') expense += t.amount;
  }
  return { income, expense, net: income - expense, savingsRate: income > 0 ? Math.round(((income - expense) / income) * 1000) / 10 : null };
}
export function byCategoryFor(userId: string, startsAt: Date, endsAt: Date, type: 'INCOME' | 'EXPENSE') {
  const map = new Map<string | null, { total: number; count: number }>();
  for (const t of userTxns(userId)) {
    const at = new Date(t.occurredAt);
    if (t.type !== type || at < startsAt || at >= endsAt) continue;
    const e = map.get(t.categoryId) ?? { total: 0, count: 0 };
    e.total += t.amount; e.count++;
    map.set(t.categoryId, e);
  }
  const all = categoriesFor(userId);
  const total = [...map.values()].reduce((a, e) => a + e.total, 0);
  const items = [...map.entries()].map(([id, e]) => {
    const c = id ? all.find((x) => x.id === id) : null;
    return { categoryId: id, parentId: c?.parentId ?? null, nameVi: c?.nameVi ?? 'Chưa phân loại', nameEn: c?.nameEn ?? 'Uncategorized', total: e.total, count: e.count, percent: total ? Math.round((e.total / total) * 10000) / 100 : 0 };
  }).sort((a, b) => b.total - a.total);
  return { total, items };
}
export function dailyFor(userId: string, b: { periodStart: Date; startsAt: Date; endsAt: Date }) {
  const days = Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / DAY);
  const rows = Array.from({ length: days }, (_, i) => ({ date: new Date(b.periodStart.getTime() + i * DAY).toISOString().slice(0, 10), income: 0, expense: 0 }));
  const by = new Map(rows.map((r) => [r.date, r]));
  for (const t of userTxns(userId)) {
    const at = new Date(t.occurredAt);
    if (t.type === 'TRANSFER' || at < b.startsAt || at >= b.endsAt) continue;
    const r = by.get(new Date(at.getTime() + 7 * 3_600_000).toISOString().slice(0, 10));
    if (r) r[t.type === 'INCOME' ? 'income' : 'expense'] += t.amount;
  }
  return rows;
}
export function trendFor(userId: string, months: number) {
  const cur = boundsFor(userId).periodStart;
  return Array.from({ length: months }, (_, i) => {
    const start = shiftPeriodStart(cur, -(months - 1 - i));
    const b = periodBounds(start);
    const { income, expense, net } = totalsFor(userId, b.startsAt, b.endsAt);
    return { period: formatPeriod(start), start: iso(b.startsAt), income, expense, net };
  });
}
