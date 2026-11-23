import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { periodBounds, periodFromMonth } from '@smartwallet/shared';
import { useMe } from '@/app/auth';
import { usePeriod } from '@/api';
import { vnDayKey } from '@/lib/format';
import type { TransactionFilters } from '@/api';

export type TxType = 'INCOME' | 'EXPENSE' | 'TRANSFER';
const TYPES: TxType[] = ['INCOME', 'EXPENSE', 'TRANSFER'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: string | null) => (v && /^\d{1,13}$/.test(v) ? Number(v) : undefined);

/** What the list asks the API for. `from`/`to` are Vietnam calendar days (yyyy-mm-dd); absent in the URL = the month picked in the top bar. */
export interface TxFilters { q: string; type?: TxType; walletId?: string; categoryId?: string; from?: string; to?: string; minAmount?: number; maxAmount?: number }

/** The URL is the single source of truth (other screens link here with ?categoryId=…&walletId=…&type=…&q=…&from=…&to=…). */
export function useTxFilters() {
  const [params, setParams] = useSearchParams();
  const { period } = usePeriod();
  const day = useMe().data?.monthStartDay ?? 1;
  const bounds = useMemo(() => {
    const b = periodBounds(periodFromMonth(period, day));
    return { from: vnDayKey(b.startsAt), to: vnDayKey(new Date(b.endsAt.getTime() - 1)) };
  }, [period, day]);

  const explicit = useMemo<TxFilters>(() => {
    const type = params.get('type') as TxType | null;
    const from = params.get('from');
    const to = params.get('to');
    return {
      q: params.get('q')?.trim() ?? '',
      type: type && TYPES.includes(type) ? type : undefined,
      walletId: params.get('walletId') || undefined,
      categoryId: params.get('categoryId') || undefined,
      from: from && DAY.test(from) ? from : undefined,
      to: to && DAY.test(to) ? to : undefined,
      minAmount: num(params.get('min')),
      maxAmount: num(params.get('max')),
    };
  }, [params]);

  const effective = { ...explicit, from: explicit.from ?? bounds.from, to: explicit.to ?? bounds.to };

  const set = (patch: Partial<TxFilters>) => {
    const next = new URLSearchParams(params);
    const put = (k: string, v: string | number | undefined) => { if (v === undefined || v === '') next.delete(k); else next.set(k, String(v)); };
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'minAmount') put('min', v as number | undefined);
      else if (k === 'maxAmount') put('max', v as number | undefined);
      else put(k, v as string | undefined);
    }
    setParams(next, { replace: true });
  };
  const clear = () => setParams(new URLSearchParams(), { replace: true });

  const api: TransactionFilters = {
    limit: 20, from: effective.from, to: effective.to,
    ...(effective.q ? { q: effective.q } : {}), ...(effective.type ? { type: effective.type } : {}), ...(effective.walletId ? { walletId: effective.walletId } : {}),
    ...(effective.categoryId ? { categoryId: effective.categoryId } : {}), ...(effective.minAmount !== undefined ? { minAmount: effective.minAmount } : {}), ...(effective.maxAmount !== undefined ? { maxAmount: effective.maxAmount } : {}),
  };
  return { explicit, effective, bounds, api, set, clear };
}

/** a Vietnam day (yyyy-mm-dd) -> an ISO instant for the API (noon, or "now" when the day is today so it is never in the future) */
export function dayToIso(day: string): string {
  if (day === vnDayKey(new Date())) return new Date().toISOString();
  return new Date(`${day}T12:00:00+07:00`).toISOString();
}
