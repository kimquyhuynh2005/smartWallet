const UNIT = 1000; // VND budgets are rounded to 1,000

/**
 * Splits `total` (a multiple of 1,000) between `keys` in proportion to `weights` (e.g. the last 3 months of spending),
 * in whole thousands, using the largest-remainder method so the parts add up to EXACTLY `total`.
 * No usable history (all weights 0) -> an even split. A key with weight 0 next to keys that have history gets nothing.
 */
export function splitByRatio(total: number, keys: string[], weights: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  if (!keys.length || total <= 0) return out;
  const w = keys.map((k) => Math.max(0, weights[k] ?? 0));
  const sum = w.reduce((a, b) => a + b, 0);
  const eff = sum > 0 ? w : keys.map(() => 1);
  const effSum = sum > 0 ? sum : keys.length;
  const units = Math.floor(total / UNIT);
  const raw = eff.map((x) => (units * x) / effSum);
  const floors = raw.map(Math.floor);
  let left = units - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - floors[i], w: eff[i] })).sort((a, b) => b.frac - a.frac || b.w - a.w || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  keys.forEach((k, i) => (out[k] = floors[i] * UNIT));
  return out;
}

export interface PlanGroup { percent: number; keys: string[] } // keys = [] means savings (funded by goals, not a budget)
export interface TemplatePlan {
  total: number; // the total budget: everything that is spendable
  reservedForSavings: number;
  items: { key: string; limit: number }[];
}

/** BUD-02: percentages of monthly income -> per-category limits. `weights` are per-key spending (empty for new users). */
export function planTemplate(groups: PlanGroup[], monthlyIncome: number, weights: Record<string, number> = {}): TemplatePlan {
  let total = 0;
  let reserved = 0;
  const items: TemplatePlan['items'] = [];
  for (const g of groups) {
    const amount = Math.floor((monthlyIncome * g.percent) / 100 / UNIT) * UNIT;
    if (!g.keys.length) { reserved += amount; continue; }
    const parts = splitByRatio(amount, g.keys, weights);
    for (const key of g.keys) if (parts[key] > 0) items.push({ key, limit: parts[key] });
    total += Object.values(parts).reduce((a, b) => a + b, 0);
  }
  return { total, reservedForSavings: reserved, items };
}
