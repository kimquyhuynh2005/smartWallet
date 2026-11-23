const VN_OFFSET_MS = 7 * 3_600_000;
const DAY = 86_400_000;

/**
 * Next occurrence after `from`. Monthly arithmetic runs on the Vietnam wall clock and clamps to the month end
 * (31 Jan -> 28 Feb). Limitation: without a stored anchor day, a clamped date drifts (31 Jan -> 28 Feb -> 28 Mar).
 */
export function nextRunAfter(from: Date, frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY', interval: number): Date {
  if (frequency === 'DAILY') return new Date(from.getTime() + interval * DAY);
  if (frequency === 'WEEKLY') return new Date(from.getTime() + interval * 7 * DAY);
  const l = new Date(from.getTime() + VN_OFFSET_MS);
  const monthIndex = l.getUTCMonth() + interval;
  const dim = new Date(Date.UTC(l.getUTCFullYear(), monthIndex + 1, 0)).getUTCDate();
  const day = Math.min(l.getUTCDate(), dim);
  return new Date(Date.UTC(l.getUTCFullYear(), monthIndex, day, l.getUTCHours(), l.getUTCMinutes(), l.getUTCSeconds(), l.getUTCMilliseconds()) - VN_OFFSET_MS);
}
