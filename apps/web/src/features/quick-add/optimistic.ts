import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { Budget, Category, Transaction, TransactionFilters, Wallet } from '@/api';
import { qk } from '@/lib/queryKeys';
import { vnDayKey } from '@/lib/format';

type Page = { data: Transaction[]; meta: { page: number; limit: number; total: number } };

/** What a save is about to change, in the shape of the cached server data. */
export interface Draft {
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  amount: number;
  walletId: string;
  transferWalletId: string | null;
  categoryId: string | null;
  note: string | null;
  occurredAt: string;
}

let seq = 0;
const fake = (d: Draft): Transaction => {
  const ts = new Date().toISOString();
  return { id: `optimistic-${++seq}`, ...d, receiptUrl: null, recurringRuleId: null, source: 'MANUAL', createdAt: ts, updatedAt: ts };
};

function matches(f: TransactionFilters, t: Transaction): boolean {
  if (f.type && f.type !== t.type) return false;
  if (f.walletId && f.walletId !== t.walletId && f.walletId !== t.transferWalletId) return false;
  if (f.categoryId && f.categoryId !== t.categoryId) return false;
  if (f.minAmount !== undefined && t.amount < f.minAmount) return false;
  if (f.maxAmount !== undefined && t.amount > f.maxAmount) return false;
  if (f.q && !(t.note ?? '').toLowerCase().includes(f.q.toLowerCase())) return false;
  const day = vnDayKey(t.occurredAt);
  if (f.from && day < vnDayKey(f.from)) return false;
  if (f.to && day > vnDayKey(f.to)) return false;
  return true;
}

const insertSorted = (rows: Transaction[], t: Transaction) => {
  const i = rows.findIndex((r) => r.occurredAt < t.occurredAt);
  return i === -1 ? [...rows, t] : [...rows.slice(0, i), t, ...rows.slice(i)];
};

const walletDelta = (d: Draft, walletId: string): number => {
  if (d.type === 'INCOME') return walletId === d.walletId ? d.amount : 0;
  if (d.type === 'EXPENSE') return walletId === d.walletId ? -d.amount : 0;
  return walletId === d.walletId ? -d.amount : walletId === d.transferWalletId ? d.amount : 0;
};

/**
 * Optimistic update for a new transaction: inserts it into every cached transaction list it belongs to, moves the wallet balances and
 * the budget progress of the period it falls in. Returns `rollback` (put every touched cache back) for when the server says no.
 * The caller invalidates afterwards, so the server numbers always win.
 */
export function applyOptimistic(qc: QueryClient, d: Draft): { rollback: () => void } {
  const keys = [qk.transactions.all, qk.wallets.all, qk.budgets.all];
  const snapshot = keys.flatMap((k) => qc.getQueriesData({ queryKey: k }));
  const tx = fake(d);

  for (const [key, old] of qc.getQueriesData<Page | InfiniteData<Page>>({ queryKey: qk.transactions.all })) {
    if (key[1] !== 'list' || !old) continue;
    const f = (key[2] ?? {}) as TransactionFilters;
    if (!matches(f, tx)) continue;
    const bump = (p: Page): Page => ({ data: insertSorted(p.data, tx).slice(0, Math.max(p.meta.limit, p.data.length)), meta: { ...p.meta, total: p.meta.total + 1 } });
    if ('pages' in old) qc.setQueryData(key, { ...old, pages: old.pages.map((p, i) => (i === 0 ? bump(p) : { ...p, meta: { ...p.meta, total: p.meta.total + 1 } })) });
    else if ((f.page ?? 1) === 1) qc.setQueryData(key, bump(old));
  }

  const patchWallet = (w: Wallet): Wallet => ({ ...w, balance: w.balance + walletDelta(d, w.id) });
  qc.setQueriesData<Wallet[] | Wallet>({ queryKey: qk.wallets.all }, (old) => (Array.isArray(old) ? old.map(patchWallet) : old && 'balance' in old ? patchWallet(old) : old));

  if (d.type === 'EXPENSE') {
    const cats = qc.getQueryData<Category[]>(qk.categories.all) ?? [];
    const parent = cats.find((c) => c.id === d.categoryId)?.parentId ?? null;
    const patchBudget = (b: Budget): Budget => {
      if (b.categoryId !== null && b.categoryId !== d.categoryId && b.categoryId !== parent) return b;
      if (d.occurredAt < b.periodStartsAt || d.occurredAt >= b.periodEndsAt) return b;
      const spent = b.spent + d.amount;
      return { ...b, spent, remaining: b.limitAmount - spent, percentUsed: b.limitAmount > 0 ? (spent / b.limitAmount) * 100 : b.percentUsed };
    };
    qc.setQueriesData<Budget[]>({ queryKey: qk.budgets.all }, (old) => (Array.isArray(old) ? old.map(patchBudget) : old));
  }

  return { rollback: () => { for (const [k, v] of snapshot) qc.setQueryData(k, v); } };
}
