import { z } from 'zod';
import { Locale } from '@smartwallet/shared';

// Shapes the API returns but does not (yet) export from packages/shared. Keep in sync with apps/api/openapi.json.
export const TokenSchema = z.object({ accessToken: z.string(), expiresIn: z.number().int() });

export const MeSchema = z.object({
  id: z.string().uuid(), email: z.string(), fullName: z.string(), avatarUrl: z.string().nullable(), role: z.enum(['USER', 'ADMIN']), status: z.enum(['ACTIVE', 'LOCKED']),
  locale: Locale.or(z.string()), currency: z.string(), monthStartDay: z.number().int(), emailVerifiedAt: z.string().nullable(), createdAt: z.string(),
  hasPassword: z.boolean(), plan: z.enum(['FREE', 'PREMIUM']), onboarded: z.boolean(),
});

export const AdminStatsSchema = z.object({ users: z.number().int(), premium: z.number().int() });
export const AdminUserSchema = z.object({ id: z.string().uuid(), email: z.string(), fullName: z.string(), role: z.enum(['USER', 'ADMIN']), status: z.enum(['ACTIVE', 'LOCKED']), plan: z.enum(['FREE', 'PREMIUM']).optional(), createdAt: z.string() });

// --- mocked-only (docs/backend-requests.md) ---
export const PlanInfoSchema = z.object({
  plan: z.enum(['FREE', 'PREMIUM']),
  limits: z.object({ max_wallets: z.number().nullable(), max_budgets: z.number().nullable(), max_goals: z.number().nullable(), history_months: z.number().nullable() }),
  usage: z.object({ wallets: z.number(), budgets: z.number(), goals: z.number() }),
  currentPeriodEnd: z.string().nullable(),
});
export const ContributionRowSchema = z.object({ id: z.string().uuid(), goalId: z.string().uuid(), amount: z.number(), occurredAt: z.string(), note: z.string().nullable(), createdAt: z.string() });

// --- mocked-only: settings / plans / reports / admin (docs/backend-requests.md, section "settings, plans, reports, admin") ---
export const SessionSchema = z.object({ id: z.string().uuid(), device: z.string(), place: z.string(), lastActiveAt: z.string(), current: z.boolean() });
export const TopNotesSchema = z.object({ period: z.string(), items: z.array(z.object({ note: z.string(), count: z.number().int(), total: z.number() })) });
const Limits = z.object({ max_wallets: z.number().nullable(), max_budgets: z.number().nullable(), max_goals: z.number().nullable(), history_months: z.number().nullable() });
export const AdminPlanSchema = z.object({ code: z.enum(['FREE', 'PREMIUM']), name: z.string(), limits: Limits, users: z.number().int() });
export const AdminGrowthSchema = z.object({ months: z.number().int(), points: z.array(z.object({ period: z.string(), newUsers: z.number().int(), totalUsers: z.number().int(), premium: z.number().int() })) });
export const AdminCategorySchema = z.object({ id: z.string().uuid(), nameVi: z.string(), nameEn: z.string(), type: z.enum(['INCOME', 'EXPENSE']), icon: z.string().nullable().optional(), color: z.string().nullable().optional(), keywordCount: z.number().int() });
export const AdminRuleSchema = z.object({ id: z.string(), keyword: z.string(), categoryId: z.string().uuid(), weight: z.number() });
