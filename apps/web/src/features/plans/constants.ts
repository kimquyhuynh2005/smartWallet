/** Placeholder price for the mock checkout (VND per month). The same number lives in pages/landing/Sections.tsx; the real price comes with real billing. */
export const PREMIUM_PRICE_VND = 49_000;

export type Limits = { max_wallets: number | null; max_budgets: number | null; max_goals: number | null; history_months: number | null };

/** Static fallback when GET /subscriptions/me is not available (CLAUDE.md section 2: Free = 3 wallets, 5 budgets, 2 goals, 6 months). */
export const FREE_LIMITS: Limits = { max_wallets: 3, max_budgets: 5, max_goals: 2, history_months: 6 };
export const PREMIUM_LIMITS: Limits = { max_wallets: null, max_budgets: null, max_goals: null, history_months: null };

/** limit key -> usage key of PlanInfo.usage */
export const USAGE_KEY = { max_wallets: 'wallets', max_budgets: 'budgets', max_goals: 'goals' } as const;
