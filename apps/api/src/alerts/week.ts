const VN_MS = 7 * 3_600_000;
const DAY = 86_400_000;

/** yyyy-MM-dd of the Monday that starts the Vietnam-local week containing `now` (idempotency key for weekly jobs) */
export function isoWeekKey(now: Date): string {
  const local = new Date(now.getTime() + VN_MS);
  const sinceMonday = (local.getUTCDay() + 6) % 7;
  return new Date(local.getTime() - sinceMonday * DAY).toISOString().slice(0, 10);
}

export const vnd = (n: number | bigint, locale = 'vi-VN') => `${new Intl.NumberFormat(locale).format(Number(n))} ₫`;
