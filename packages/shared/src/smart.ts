import { z } from 'zod';
import { CategoryType, Money, WalletType } from './base';
import { GoalOut, TransactionOut } from './api';

const Uuid = z.string().uuid();
const IsoDateTime = z.string().datetime();
const nonEmpty = { message: 'at least one field is required' };
const hasKeys = (v: object) => Object.keys(v).length > 0;
const boolString = z.enum(['true', 'false']).transform((v) => v === 'true');

// ======================================================================
// CAT-03 / CAT-04  auto-categorization
// ======================================================================
/** The web form pre-selects the top suggestion only at or above this confidence. */
export const PRESELECT_CONFIDENCE = 0.6;
export const SuggestReason = z.enum(['personal_rule', 'global_keyword', 'history', 'amount']);
export const SuggestCategoryBodySchema = z
  .object({ note: z.string().trim().max(500), amount: Money.positive().optional(), type: z.enum(['INCOME', 'EXPENSE']).optional() })
  .strict();
export const CategorySuggestionOut = z.object({
  categoryId: Uuid, confidence: z.number().min(0).max(1), nameVi: z.string(), nameEn: z.string(), type: CategoryType, reasons: z.array(SuggestReason),
});
export const SuggestCategoryOut = z.object({ suggestions: z.array(CategorySuggestionOut).max(3), preselectedCategoryId: Uuid.nullable() });
/** id of the suggestion the form should pre-select, or null (shared by API and web so the 0.6 rule lives in one place) */
export const preselectCategory = (suggestions: { categoryId: string; confidence: number }[], threshold = PRESELECT_CONFIDENCE): string | null =>
  suggestions[0] && suggestions[0].confidence >= threshold ? suggestions[0].categoryId : null;

// ======================================================================
// BUD-01..04 budgets
// ======================================================================
export const PeriodString = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'expected YYYY-MM');
export const RolloverMode = z.enum(['NONE', 'CARRY_FORWARD']);
const Thresholds = z.array(z.number().int().min(1).max(200)).min(1).max(5);
export const ListBudgetsQuerySchema = z.object({ period: PeriodString.optional() }).strict();
export const CreateBudgetSchema = z
  .object({
    categoryId: Uuid.nullable(), // null = total budget
    limitAmount: Money.positive(),
    period: PeriodString.optional(), // default: current period
    rolloverMode: RolloverMode.optional(),
    alertThresholds: Thresholds.optional(), // Premium only
  })
  .strict();
export const UpdateBudgetSchema = z
  .object({ limitAmount: Money.positive(), rolloverMode: RolloverMode, alertThresholds: Thresholds })
  .partial()
  .strict()
  .refine(hasKeys, nonEmpty);
const CustomGroup = z.object({ name: z.string().trim().min(1).max(40), percent: z.number().int().min(1).max(100), categoryIds: z.array(Uuid).max(30) }).strict(); // no categories = savings
export const ApplyTemplateSchema = z
  .object({
    template: z.enum(['50_30_20', '6_JARS', 'CUSTOM']),
    monthlyIncome: Money.positive(),
    period: PeriodString.optional(),
    overwrite: z.boolean().default(false), // false: keep budgets that already exist for a category
    groups: z.array(CustomGroup).min(1).max(12).optional(), // CUSTOM only; percentages must total 100
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.template === 'CUSTOM') {
      if (!v.groups) return ctx.addIssue({ code: 'custom', path: ['groups'], message: 'groups are required for CUSTOM' });
      const total = v.groups.reduce((a, g) => a + g.percent, 0);
      if (total !== 100) ctx.addIssue({ code: 'custom', path: ['groups'], message: `percentages must total 100 (got ${total})` });
    } else if (v.groups) ctx.addIssue({ code: 'custom', path: ['groups'], message: 'groups are only allowed with template CUSTOM' });
  });
export const RolloverSchema = z.object({ period: PeriodString.optional() }).strict(); // target period; source = the one before

export const BudgetOut = z.object({
  id: Uuid, period: PeriodString, periodStartsAt: IsoDateTime, periodEndsAt: IsoDateTime, categoryId: Uuid.nullable(), limitAmount: Money,
  rolloverMode: RolloverMode, rolloverAmount: Money, alertThresholds: z.array(z.number().int()),
  spent: Money, remaining: Money, percentUsed: z.number(), safeToSpendToday: Money, daysLeft: z.number().int(), createdAt: IsoDateTime, updatedAt: IsoDateTime,
});
export const ApplyTemplateOut = z.object({
  period: PeriodString, template: z.string(), totalBudget: Money, reservedForSavings: Money,
  created: z.number().int(), updated: z.number().int(), skipped: z.number().int(), truncatedByPlan: z.number().int(), budgets: z.array(BudgetOut),
});
export const RolloverOut = z.object({
  period: PeriodString, from: PeriodString, created: z.number().int(), updated: z.number().int(), skipped: z.number().int(), skippedForPlanLimit: z.number().int(),
  carriedOver: Money, budgets: z.array(BudgetOut),
});

// ======================================================================
// ALR-01..03 alerts + notifications
// ======================================================================
export const NotificationTypeEnum = z.enum(['BUDGET_WARNING', 'BUDGET_EXCEEDED', 'GOAL', 'SYSTEM']);
export const NotificationSettingsSchema = z.object({ inApp: z.boolean(), email: z.boolean(), weeklySummary: z.boolean(), goalReminders: z.boolean() });
export type NotificationSettings = z.infer<typeof NotificationSettingsSchema>;
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = { inApp: true, email: true, weeklySummary: true, goalReminders: true };
export const UpdateNotificationSettingsSchema = NotificationSettingsSchema.partial().strict().refine(hasKeys, nonEmpty);
export const NotificationQuerySchema = z
  .object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20), unread: boolString.optional() })
  .strict();
export const NotificationOut = z.object({
  id: Uuid, type: NotificationTypeEnum, message: z.string(), payload: z.record(z.any()), readAt: IsoDateTime.nullable(), createdAt: IsoDateTime,
});
export const ReadAllOut = z.object({ updated: z.number().int() });
/** returned by POST /transactions so the UI can warn without a WebSocket */
export const TriggeredAlertOut = z.object({
  id: Uuid, type: z.enum(['BUDGET_WARNING', 'BUDGET_EXCEEDED']), threshold: z.number().int(), budgetId: Uuid, categoryId: Uuid.nullable(), percentUsed: z.number().int(), message: z.string(),
});
export const TransactionCreatedOut = TransactionOut.extend({ triggeredAlerts: z.array(TriggeredAlertOut) });
/** Socket.IO contract: namespace /ws, auth { token }, room user:{id}, events below */
export const WS_NAMESPACE = '/ws';
export const WS_EVENTS = { notification: 'notification:new', budget: 'budget:updated' } as const;

// ======================================================================
// RPT-01..03 reports
// ======================================================================
export const ReportPeriodQuerySchema = z.object({ period: PeriodString.optional() }).strict();
export const ByCategoryQuerySchema = z.object({ period: PeriodString.optional(), type: CategoryType.default('EXPENSE') }).strict();
export const TrendQuerySchema = z.object({ months: z.coerce.number().int().min(1).max(12).default(6) }).strict();
export const ExportQuerySchema = z.object({ format: z.enum(['csv']).default('csv'), period: PeriodString.optional() }).strict();

export const PeriodInfo = z.object({ label: PeriodString, start: IsoDateTime, end: IsoDateTime, daysLeft: z.number().int() });
export const TotalsOut = z.object({ income: Money, expense: Money, net: Money, savingsRate: z.number().nullable() });
export const ByCategoryItemOut = z.object({ categoryId: Uuid.nullable(), parentId: Uuid.nullable(), nameVi: z.string(), nameEn: z.string(), total: Money, count: z.number().int(), percent: z.number() });
export const ByCategoryOut = z.object({ period: PeriodInfo, type: CategoryType, total: Money, items: z.array(ByCategoryItemOut) });
export const TrendPointOut = z.object({ period: PeriodString, start: IsoDateTime, income: Money, expense: Money, net: Money });
export const TrendOut = z.object({ months: z.number().int(), points: z.array(TrendPointOut) });
export const DailyPointOut = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), income: Money, expense: Money });
export const DailyOut = z.object({ period: PeriodInfo, days: z.array(DailyPointOut) });
export const DashboardOut = z.object({
  period: PeriodInfo, totals: TotalsOut,
  wallets: z.object({ total: Money, items: z.array(z.object({ id: Uuid, name: z.string(), type: WalletType, balance: Money })) }),
  budgets: z.array(BudgetOut), topCategories: z.array(ByCategoryItemOut), dailySpending: z.array(DailyPointOut), trend: z.array(TrendPointOut),
  goals: z.array(GoalOut), recentTransactions: z.array(TransactionOut), generatedAt: IsoDateTime,
});
