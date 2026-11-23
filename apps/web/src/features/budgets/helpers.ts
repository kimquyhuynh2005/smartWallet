import { periodBounds, periodFromMonth } from '@smartwallet/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { endpoints, qk, useProfile, usePeriod, type Budget } from '@/api';
import { useLang } from '@/hooks/useLang';
import { formatDate } from '@/lib/format';

/** The selected period with its REAL date range ("5/11 – 4/12"), following the user's month_start_day. endsAt is exclusive. */
export function usePeriodRange() {
  const p = usePeriod();
  const lang = useLang();
  const day = useProfile().data?.monthStartDay ?? 1;
  const { startsAt, endsAt } = periodBounds(periodFromMonth(p.period, day));
  const lastDay = new Date(endsAt.getTime() - 1);
  return { ...p, startsAt, endsAt, range: `${formatDate(startsAt, lang, 'day')} – ${formatDate(lastDay, lang, 'day')}`, toIso: lastDay.toISOString(), fromIso: startsAt.toISOString() };
}

/** Same maths as the API's computeProgress, used only to repaint a row while a limit edit is in flight. */
export function withLimit(b: Budget, limit: number): Budget {
  const remaining = limit - b.spent;
  return {
    ...b, limitAmount: limit, remaining,
    percentUsed: limit > 0 ? Math.floor((b.spent * 10000) / limit) / 100 : 0,
    safeToSpendToday: b.daysLeft > 0 ? Math.floor(Math.max(0, remaining) / b.daysLeft) : 0,
  };
}

/** Inline limit edit: the row updates at once, and rolls back when the server says no. */
export function useEditLimit(apiPeriod: string | undefined) {
  const qc = useQueryClient();
  const key = qk.budgets.list(apiPeriod);
  return useMutation({
    mutationFn: (v: { id: string; limit: number }) => endpoints.budgets.update(v.id, { limitAmount: v.limit }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Budget[]>(key);
      if (prev) qc.setQueryData<Budget[]>(key, prev.map((b) => (b.id === v.id ? withLimit(b, v.limit) : b)));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); },
    onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: qk.budgets.all }), qc.invalidateQueries({ queryKey: qk.reports.all })]),
  });
}
