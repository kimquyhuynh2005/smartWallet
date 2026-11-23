import { currentBudgetPeriod, formatPeriod, periodFromMonth, shiftPeriodStart } from '@smartwallet/shared';
import { useMe } from '@/app/auth';
import { formatPeriodLabel } from '@/lib/format';
import { usePeriodStore } from '@/stores/period';
import { useLang } from './useLang';

/**
 * The period chosen in the top-bar month switcher. Features read this instead of owning a month picker.
 *  - `period`    "YYYY-MM" = the month the period STARTS in (the API's period format), always defined
 *  - `apiPeriod` the same, or undefined for the current period: pass it straight to `endpoints.*(period)` / query keys
 *  - going back further than the Free plan's history makes the API answer 403 PLAN_LIMIT_REACHED, which opens the global plan dialog
 */
export function usePeriod() {
  const lang = useLang();
  const day = useMe().data?.monthStartDay ?? 1;
  const selected = usePeriodStore((s) => s.selected);
  const select = usePeriodStore((s) => s.select);
  const current = formatPeriod(currentBudgetPeriod(new Date(), day).periodStart);
  const period = selected ?? current;
  const isCurrent = period === current;
  const shift = (n: number) => {
    const next = formatPeriod(shiftPeriodStart(periodFromMonth(period, day), n));
    select(next >= current ? null : next); // YYYY-MM strings sort chronologically; never past the current period
  };
  return {
    period, apiPeriod: isCurrent ? undefined : period, current, isCurrent,
    label: formatPeriodLabel(period, lang),
    prev: () => shift(-1), next: () => shift(1), reset: () => select(null),
  };
}
