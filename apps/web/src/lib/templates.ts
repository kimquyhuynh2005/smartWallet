import { BUDGET_TEMPLATES } from '@smartwallet/shared';

/**
 * Budget template maths for the onboarding PREVIEW. A port of apps/api/src/budgets/templates.ts (splitByRatio / planTemplate, even split because a
 * new user has no spending history) so the preview matches what the server saves. The API has no dry-run yet (docs/backend-requests.md #4);
 * when it does, swap this for POST /budgets/apply-template {dryRun:true} and delete the port.
 */
const UNIT = 1000;

export function splitEvenly(total: number, keys: string[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  if (!keys.length || total <= 0) return out;
  const units = Math.floor(total / UNIT);
  const base = Math.floor(units / keys.length);
  let left = units - base * keys.length;
  keys.forEach((k) => { out[k] = (base + (left > 0 ? 1 : 0)) * UNIT; if (left > 0) left -= 1; }); // largest remainder: the first keys get the extra thousand
  return out;
}

export type TemplateKind = '50_30_20' | '6_JARS' | 'CUSTOM';
export interface PlanGroupIn { key: string; percent: number; categories: string[] } // categories = nameEn; [] = savings
export interface PlanRow { nameEn: string; limit: number; group: string }
export interface Plan { groups: { key: string; percent: number; amount: number; rows: PlanRow[] }[]; total: number; reserved: number }

export const CUSTOM_DEFAULT: PlanGroupIn[] = [
  { key: 'needs', percent: 50, categories: BUDGET_TEMPLATES['50_30_20'][0].categories },
  { key: 'wants', percent: 30, categories: BUDGET_TEMPLATES['50_30_20'][1].categories },
  { key: 'savings', percent: 20, categories: [] },
];

export const groupsOf = (kind: TemplateKind, custom: PlanGroupIn[] = CUSTOM_DEFAULT): PlanGroupIn[] =>
  kind === 'CUSTOM' ? custom : BUDGET_TEMPLATES[kind].map((g) => ({ key: g.key, percent: g.percent, categories: [...g.categories] }));

export function planTemplate(groups: PlanGroupIn[], income: number): Plan {
  let total = 0, reserved = 0;
  const out: Plan['groups'] = [];
  for (const g of groups) {
    const amount = Math.floor((income * g.percent) / 100 / UNIT) * UNIT;
    if (!g.categories.length) { reserved += amount; out.push({ key: g.key, percent: g.percent, amount, rows: [] }); continue; }
    const parts = splitEvenly(amount, g.categories);
    const rows = g.categories.filter((c) => parts[c] > 0).map((c) => ({ nameEn: c, limit: parts[c], group: g.key }));
    total += rows.reduce((a, r) => a + r.limit, 0);
    out.push({ key: g.key, percent: g.percent, amount, rows });
  }
  return { groups: out, total, reserved };
}

/** Free plan: the total budget counts as one, then the biggest category budgets that still fit (same rule as the API). */
export function fitToPlan(rows: PlanRow[], maxBudgets: number | null): { kept: PlanRow[]; cut: number } {
  if (maxBudgets === null) return { kept: rows, cut: 0 };
  const room = Math.max(0, maxBudgets - 1);
  const sorted = [...rows].sort((a, b) => b.limit - a.limit);
  return { kept: sorted.slice(0, room), cut: Math.max(0, sorted.length - room) };
}
