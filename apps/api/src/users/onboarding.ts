import { BUDGET_TEMPLATES } from '@smartwallet/shared';
import { planTemplate } from '../budgets/templates';

export interface TemplateBudgets {
  total: number; // total budget = the spendable share of income (savings groups excluded)
  items: { categoryNameEn: string; limit: number }[];
}

/** USER-02 / BUD-02 for a brand-new user: no spending history yet, so every group is split evenly (rounded to 1,000 VND). */
export function buildTemplateBudgets(template: '50_30_20' | '6_JARS' | 'NONE', monthlyIncome: number): TemplateBudgets {
  if (template === 'NONE') return { total: 0, items: [] };
  const plan = planTemplate(BUDGET_TEMPLATES[template].map((g) => ({ percent: g.percent, keys: g.categories })), monthlyIncome);
  return { total: plan.total, items: plan.items.map((i) => ({ categoryNameEn: i.key, limit: i.limit })) };
}
