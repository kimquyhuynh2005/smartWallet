import { QueryClient } from '@tanstack/react-query';
import { preselectCategory } from '@smartwallet/shared';
import { describe, expect, it } from 'vitest';
import { qk } from '@/lib/queryKeys';
import { applyOptimistic, type Draft } from './optimistic';
import { pressKey } from './Keypad';

const W1 = 'w1', W2 = 'w2';
const wallet = (id: string, balance: number) => ({ id, name: id, balance, isArchived: false });
const txn = (id: string, o: Record<string, unknown> = {}) => ({ id, type: 'EXPENSE', amount: 1000, walletId: W1, transferWalletId: null, categoryId: null, note: null, occurredAt: '2026-11-10T05:00:00.000Z', ...o });
const page = (rows: unknown[], total = rows.length) => ({ data: rows, meta: { page: 1, limit: 20, total } });
const draft = (o: Partial<Draft> = {}): Draft => ({ type: 'EXPENSE', amount: 50_000, walletId: W1, transferWalletId: null, categoryId: null, note: 'cafe', occurredAt: '2026-11-15T05:00:00.000Z', ...o });

function client() {
  const qc = new QueryClient();
  qc.setQueryData(qk.wallets.list(false), [wallet(W1, 1_000_000), wallet(W2, 500_000)]);
  qc.setQueryData(qk.transactions.list({}), page([txn('a', { occurredAt: '2026-11-12T05:00:00.000Z' }), txn('b', { occurredAt: '2026-11-01T05:00:00.000Z' })]));
  return qc;
}
const balances = (qc: QueryClient) => Object.fromEntries((qc.getQueryData<ReturnType<typeof wallet>[]>(qk.wallets.list(false)) ?? []).map((w) => [w.id, w.balance]));

describe('TC-FE-TXN-01 optimistic update', () => {
  it('TC-FE-TXN-01-20 an expense lowers the wallet balance, is inserted newest-first and bumps total', () => {
    const qc = client();
    applyOptimistic(qc, draft());
    expect(balances(qc)).toEqual({ [W1]: 950_000, [W2]: 500_000 });
    const p = qc.getQueryData<ReturnType<typeof page>>(qk.transactions.list({}))!;
    expect(p.data.map((t) => (t as { id: string }).id)).toEqual([expect.stringMatching(/^optimistic-/), 'a', 'b']);
    expect(p.meta.total).toBe(3);
  });

  it('TC-FE-TXN-01-21 income raises the balance', () => {
    const qc = client();
    applyOptimistic(qc, draft({ type: 'INCOME', amount: 2_000_000 }));
    expect(balances(qc)[W1]).toBe(3_000_000);
  });

  it('TC-FE-TXN-02-20 a transfer moves money between the two wallets (net zero)', () => {
    const qc = client();
    applyOptimistic(qc, draft({ type: 'TRANSFER', amount: 200_000, transferWalletId: W2 }));
    expect(balances(qc)).toEqual({ [W1]: 800_000, [W2]: 700_000 });
  });

  it('TC-FE-TXN-01-22 rollback restores wallets and lists exactly', () => {
    const qc = client();
    const before = JSON.stringify([qc.getQueryData(qk.wallets.list(false)), qc.getQueryData(qk.transactions.list({}))]);
    const { rollback } = applyOptimistic(qc, draft());
    expect(balances(qc)[W1]).toBe(950_000);
    rollback();
    expect(JSON.stringify([qc.getQueryData(qk.wallets.list(false)), qc.getQueryData(qk.transactions.list({}))])).toBe(before);
  });

  it('TC-FE-TXN-01-23 a list whose filters exclude the new row is left alone (other type / other wallet / other page)', () => {
    const qc = client();
    qc.setQueryData(qk.transactions.list({ type: 'INCOME' }), page([]));
    qc.setQueryData(qk.transactions.list({ walletId: W2 }), page([]));
    qc.setQueryData(qk.transactions.list({ page: 2 }), page([txn('z')], 21));
    applyOptimistic(qc, draft());
    expect((qc.getQueryData(qk.transactions.list({ type: 'INCOME' })) as ReturnType<typeof page>).meta.total).toBe(0);
    expect((qc.getQueryData(qk.transactions.list({ walletId: W2 })) as ReturnType<typeof page>).meta.total).toBe(0);
    expect((qc.getQueryData(qk.transactions.list({ page: 2 })) as ReturnType<typeof page>).data).toHaveLength(1);
  });

  it('TC-FE-TXN-01-24 a transfer shows up in the list filtered by the DESTINATION wallet too', () => {
    const qc = client();
    qc.setQueryData(qk.transactions.list({ walletId: W2 }), page([]));
    applyOptimistic(qc, draft({ type: 'TRANSFER', transferWalletId: W2 }));
    expect((qc.getQueryData(qk.transactions.list({ walletId: W2 })) as ReturnType<typeof page>).meta.total).toBe(1);
  });

  const budget = (o: Record<string, unknown>) => ({ id: 'b', categoryId: null, limitAmount: 1_000_000, spent: 100_000, remaining: 900_000, percentUsed: 10, periodStartsAt: '2026-11-01T00:00:00.000Z', periodEndsAt: '2026-12-01T00:00:00.000Z', ...o });

  it('TC-FE-BUD-04-20 an expense moves the matching budget and the total budget (spent, remaining, percent), integer maths', () => {
    const qc = client();
    qc.setQueryData(qk.categories.all, [{ id: 'food', parentId: null }]);
    qc.setQueryData(qk.budgets.list(), [budget({ id: 'total', categoryId: null }), budget({ id: 'food', categoryId: 'food', limitAmount: 500_000, spent: 0, remaining: 500_000, percentUsed: 0 }), budget({ id: 'other', categoryId: 'transport' })]);
    applyOptimistic(qc, draft({ categoryId: 'food', amount: 400_000, occurredAt: '2026-11-15T05:00:00.000Z' }));
    const [total, food, other] = qc.getQueryData(qk.budgets.list()) as ReturnType<typeof budget>[];
    expect(total).toMatchObject({ spent: 500_000, remaining: 500_000, percentUsed: 50 });
    expect(food).toMatchObject({ spent: 400_000, remaining: 100_000, percentUsed: 80 });
    expect(other.spent).toBe(100_000);
  });

  it('TC-FE-BUD-04-21 a sub-category expense also counts for the parent category budget', () => {
    const qc = client();
    qc.setQueryData(qk.categories.all, [{ id: 'food', parentId: null }, { id: 'coffee', parentId: 'food' }]);
    qc.setQueryData(qk.budgets.list(), [budget({ id: 'food', categoryId: 'food', spent: 0 })]);
    applyOptimistic(qc, draft({ categoryId: 'coffee', amount: 30_000 }));
    expect((qc.getQueryData(qk.budgets.list()) as ReturnType<typeof budget>[])[0].spent).toBe(30_000);
  });

  it('TC-FE-BUD-04-22 income, transfers and expenses outside the budget period never touch a budget', () => {
    const qc = client();
    qc.setQueryData(qk.budgets.list(), [budget({})]);
    applyOptimistic(qc, draft({ type: 'INCOME' }));
    applyOptimistic(qc, draft({ type: 'TRANSFER', transferWalletId: W2 }));
    applyOptimistic(qc, draft({ occurredAt: '2026-12-01T00:00:00.000Z' })); // boundary: period end is exclusive
    applyOptimistic(qc, draft({ occurredAt: '2026-10-31T23:59:59.000Z' }));
    expect((qc.getQueryData(qk.budgets.list()) as ReturnType<typeof budget>[])[0].spent).toBe(100_000);
  });

  it('TC-FE-BUD-04-23 rollback restores the budgets', () => {
    const qc = client();
    qc.setQueryData(qk.budgets.list(), [budget({})]);
    const { rollback } = applyOptimistic(qc, draft());
    expect((qc.getQueryData(qk.budgets.list()) as ReturnType<typeof budget>[])[0].spent).toBe(150_000);
    rollback();
    expect((qc.getQueryData(qk.budgets.list()) as ReturnType<typeof budget>[])[0].spent).toBe(100_000);
  });

  it('TC-FE-TXN-01-25 works with empty caches (nothing cached is not an error)', () => {
    const qc = new QueryClient();
    expect(() => applyOptimistic(qc, draft()).rollback()).not.toThrow();
  });
});

describe('TC-FE-TXN-01 keypad maths (pressKey)', () => {
  it('TC-FE-TXN-01-30 digits append, 000 multiplies by 1000, backspace drops the last digit', () => {
    expect(pressKey(null, '1')).toBe(1);
    expect(pressKey(1, '5')).toBe(15);
    expect(pressKey(15, '000')).toBe(15_000);
    expect(pressKey(15_000, 'back')).toBe(1_500);
  });
  it('TC-FE-TXN-01-31 empty / zero collapse to null; "000" on empty stays empty; backspace of a single digit empties', () => {
    expect(pressKey(null, '0')).toBeNull();
    expect(pressKey(null, '000')).toBeNull();
    expect(pressKey(5, 'back')).toBeNull();
    expect(pressKey(null, 'back')).toBeNull();
  });
  it('TC-FE-TXN-01-32 clamps at 999.999.999.999 and always returns an integer', () => {
    expect(pressKey(999_999_999_999, '9')).toBe(999_999_999_999);
    expect(pressKey(999_999_999, '000')).toBe(999_999_999_000);
    expect(pressKey(999_999_999_999, '000')).toBe(999_999_999_999);
    for (const v of [1, 7, 123, 9_999]) expect(Number.isInteger(pressKey(v, 'back') ?? 0)).toBe(true);
  });
});

describe('TC-FE-CAT-03 preselectCategory (shared rule used by quick-add)', () => {
  const s = (confidence: number) => [{ categoryId: 'a', confidence }, { categoryId: 'b', confidence: 0.1 }];
  it('TC-FE-CAT-03-20 threshold 0.6 inclusive', () => {
    expect(preselectCategory(s(0.6))).toBe('a');
    expect(preselectCategory(s(0.95))).toBe('a');
    expect(preselectCategory(s(0.5999))).toBeNull();
    expect(preselectCategory(s(0.59))).toBeNull();
  });
  it('TC-FE-CAT-03-21 no suggestions -> null; only the FIRST suggestion is considered', () => {
    expect(preselectCategory([])).toBeNull();
    expect(preselectCategory([{ categoryId: 'a', confidence: 0.3 }, { categoryId: 'b', confidence: 0.9 }])).toBeNull();
  });
});
