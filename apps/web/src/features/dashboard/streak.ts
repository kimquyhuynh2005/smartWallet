import { vnDayKey } from '@/lib/format';

/**
 * Saving streak: consecutive Vietnam days (counting back from today) whose total EXPENSE spending was at or under the daily safe amount.
 * Pure on purpose (no hooks, no clock): the caller passes `now`, so the day boundary is testable.
 * - transfers and income are never passed in (only EXPENSE rows);
 * - days before the first expense in the data do not count (a new user does not start with a free streak);
 * - today counts only while it is within the limit; once today goes over, the current run is 0 (the best run is kept).
 */
export interface StreakExpense { occurredAt: string | Date; amount: number }
export type DayStatus = 'within' | 'over' | 'none';
export interface StreakDay { day: string; spent: number; status: DayStatus }
export interface StreakResult { current: number; best: number; lastDay: string | null; days: StreakDay[] }

export const STREAK_WINDOW_DAYS = 60;

/** calendar-day arithmetic on yyyy-MM-dd keys (no time zone involved) */
export function shiftDayKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** whole-dong daily amount a period budget allows: limit spread over the days of the period (Vietnam days) */
export function dailyLimitOf(limitAmount: number, periodStartsAt: string, periodEndsAt: string): number {
  const first = vnDayKey(periodStartsAt);
  const last = vnDayKey(new Date(new Date(periodEndsAt).getTime() - 1));
  const days = Math.max(1, Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000) + 1);
  return Math.floor(limitAmount / days);
}

export function computeStreak(expenses: StreakExpense[], dailyLimit: number, now: Date = new Date(), windowDays = STREAK_WINDOW_DAYS): StreakResult {
  const today = vnDayKey(now);
  const start = shiftDayKey(today, -(windowDays - 1));
  const spentBy = new Map<string, number>();
  for (const e of expenses) {
    const k = vnDayKey(e.occurredAt);
    if (k < start || k > today) continue;
    spentBy.set(k, (spentBy.get(k) ?? 0) + e.amount);
  }
  const first = [...spentBy.keys()].sort()[0];
  const days: StreakDay[] = [];
  for (let i = 0; i < windowDays; i++) {
    const day = shiftDayKey(start, i);
    const spent = spentBy.get(day) ?? 0;
    const status: DayStatus = first === undefined || day < first || dailyLimit <= 0 ? 'none' : spent <= dailyLimit ? 'within' : 'over';
    days.push({ day, spent, status });
  }
  let best = 0, run = 0, lastDay: string | null = null;
  for (const d of days) {
    run = d.status === 'within' ? run + 1 : 0;
    if (d.status === 'within') lastDay = d.day;
    best = Math.max(best, run);
  }
  return { current: run, best, lastDay, days };
}
