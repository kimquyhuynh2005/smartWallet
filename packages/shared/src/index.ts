import { z } from 'zod';

import { Money, WalletType, CategoryType, Locale } from './base';
export * from './base';
export * from './api';
export * from './smart';

export const ALERT_THRESHOLDS_DEFAULT = [80, 100] as const;
export const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';
export const DEFAULT_LOCALE = 'vi';
export const VN_UTC_OFFSET_HOURS = 7; // Asia/Ho_Chi_Minh has no DST

/** Stored in plans.limits (JSONB). null = unlimited. */
export interface PlanLimits {
  max_wallets: number | null;
  max_budgets: number | null;
  max_goals: number | null;
  history_months: number | null;
}


// ---- Auth / user schemas (all strict: unknown keys are rejected) ----
export const PasswordSchema = z
  .string()
  .min(8)
  .max(72) // bcrypt only uses the first 72 bytes
  .regex(/[A-Za-z]/, 'must contain a letter')
  .regex(/\d/, 'must contain a digit');
const EmailSchema = z.string().trim().toLowerCase().email().max(254);

export const RegisterSchema = z.object({ email: EmailSchema, password: PasswordSchema, fullName: z.string().trim().min(1).max(100) }).strict();
export const LoginSchema = z.object({ email: EmailSchema, password: z.string().min(1).max(72) }).strict();
export const VerifyEmailSchema = z.object({ token: z.string().min(10) }).strict();
export const ForgotPasswordSchema = z.object({ email: EmailSchema }).strict();
export const ResetPasswordSchema = z.object({ token: z.string().min(10), password: PasswordSchema }).strict();

export const UpdateProfileSchema = z
  .object({
    fullName: z.string().trim().min(1).max(100),
    avatarUrl: z.string().url().max(500).nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    locale: Locale,
    monthStartDay: z.number().int().min(1).max(28),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'at least one field is required' });

export const DeleteAccountSchema = z.object({ password: z.string().max(72).optional() }).strict();

// ---- Budget templates (BUD-02). Percent of monthly income; categories are system category nameEn. ----
export interface TemplateGroup { key: string; percent: number; categories: string[] } // categories [] = savings, not budgeted
export const BUDGET_TEMPLATES: Record<'50_30_20' | '6_JARS', TemplateGroup[]> = {
  '50_30_20': [
    { key: 'needs', percent: 50, categories: ['Housing', 'Food & Drinks', 'Transport', 'Bills'] },
    { key: 'wants', percent: 30, categories: ['Shopping', 'Entertainment'] },
    { key: 'savings', percent: 20, categories: [] }, // funded through goals, not a budget
  ],
  '6_JARS': [
    { key: 'necessities', percent: 55, categories: ['Housing', 'Food & Drinks', 'Transport', 'Bills', 'Health'] },
    { key: 'education', percent: 10, categories: ['Education'] },
    { key: 'long_term_savings', percent: 10, categories: [] },
    { key: 'play', percent: 10, categories: ['Entertainment', 'Shopping'] },
    { key: 'financial_freedom', percent: 10, categories: [] },
    { key: 'give', percent: 5, categories: ['Gifts'] },
  ],
};
export const TemplateName = z.enum(['50_30_20', '6_JARS', 'NONE']);

export const OnboardingSchema = z
  .object({
    monthlyIncome: Money.positive(),
    wallet: z.object({ name: z.string().trim().min(1).max(100), type: WalletType, openingBalance: Money.default(0) }).strict(),
    template: TemplateName.default('50_30_20'),
  })
  .strict();

export const CreateWalletSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    type: WalletType,
    openingBalance: Money.default(0),
    currency: z.string().regex(/^[A-Z]{3}$/).default('VND'),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  })
  .strict();

export const CreateTransactionSchema = z
  .object({
    walletId: z.string().uuid(),
    categoryId: z.string().uuid().optional(),
    type: z.enum(['INCOME', 'EXPENSE']),
    amount: Money.positive(),
    note: z.string().max(500).optional(),
    occurredAt: z.string().datetime(),
    receiptKey: z.string().max(300).optional(), // S3 key from POST /transactions/receipts/upload-url
  })
  .strict();
export const TransferSchema = z
  .object({
    fromWalletId: z.string().uuid(),
    toWalletId: z.string().uuid(),
    amount: Money.positive(),
    note: z.string().max(500).optional(),
    occurredAt: z.string().datetime(),
  })
  .strict()
  .refine((v) => v.fromWalletId !== v.toWalletId, { message: 'wallets must differ' });

export const CreateGoalSchema = z
  .object({ name: z.string().trim().min(1).max(100), targetAmount: Money.positive(), deadline: z.string().datetime().optional(), walletId: z.string().uuid().optional() })
  .strict();

// ---- API envelopes ----
export interface PageMeta { page: number; limit: number; total: number }
export interface ApiSuccess<T> { data: T; meta?: PageMeta }
export interface ApiError { error: { code: string; message: string; details?: unknown } }

// ---- Budget period (month_start_day 1-28). e.g. day 5 -> 5 Nov .. 4 Dec ----
export function budgetPeriod(ref: Date, monthStartDay: number): { start: Date; end: Date } {
  if (monthStartDay < 1 || monthStartDay > 28) throw new RangeError('monthStartDay must be 1-28');
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  const startMonth = ref.getUTCDate() >= monthStartDay ? m : m - 1;
  const start = new Date(Date.UTC(y, startMonth, monthStartDay));
  const end = new Date(Date.UTC(y, startMonth + 1, monthStartDay)); // exclusive
  return { start, end };
}

/**
 * Current budget period in Asia/Ho_Chi_Minh.
 * periodStart = date-only UTC midnight (what budgets.period stores);
 * startsAt/endsAt = real instants (end exclusive) for querying transactions.occurred_at.
 */
export function currentBudgetPeriod(now: Date, monthStartDay: number) {
  const offset = VN_UTC_OFFSET_HOURS * 3_600_000;
  const { start, end } = budgetPeriod(new Date(now.getTime() + offset), monthStartDay);
  return { periodStart: start, startsAt: new Date(start.getTime() - offset), endsAt: new Date(end.getTime() - offset) };
}

export const alertDedupeKey = (budgetId: string, threshold: number) => `budget:${budgetId}:${threshold}`;

/** Lower-case, strip Vietnamese diacritics (đ -> d), collapse whitespace. Used for category rule keywords + notes. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// ---------------- budget periods (YYYY-MM = the period that STARTS in that calendar month) ----------------
const VN_MS = VN_UTC_OFFSET_HOURS * 3_600_000;
/** date-only (UTC midnight) start of the budget period that contains `instant`, in Vietnam time */
export const periodStartFor = (instant: Date, monthStartDay: number): Date => currentBudgetPeriod(instant, monthStartDay).periodStart;
export const shiftPeriodStart = (periodStart: Date, months: number): Date =>
  new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + months, periodStart.getUTCDate()));
/** instants [startsAt, endsAt) of a period given its date-only start */
export const periodBounds = (periodStart: Date) => ({ startsAt: new Date(periodStart.getTime() - VN_MS), endsAt: new Date(shiftPeriodStart(periodStart, 1).getTime() - VN_MS) });
export const periodFromMonth = (yyyyMm: string, monthStartDay: number): Date => {
  const [y, m] = yyyyMm.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, monthStartDay));
};
export const formatPeriod = (periodStart: Date): string => `${periodStart.getUTCFullYear()}-${String(periodStart.getUTCMonth() + 1).padStart(2, '0')}`;
