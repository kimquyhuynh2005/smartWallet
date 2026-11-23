import type { NotificationSettings } from '@smartwallet/shared';

/** The in-memory "database" behind the mock API. Money is integer VND, ids are UUIDs, dates are ISO strings: same as the real API. */
export const uuid = (): string => crypto.randomUUID();
export const sysId = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;

export interface SysCategory { id: string; nameEn: string; nameVi: string; type: 'INCOME' | 'EXPENSE'; icon: string; color: string }
export const SYSTEM_CATEGORIES: SysCategory[] = [
  { id: sysId(1), nameEn: 'Food & Drinks', nameVi: 'Ăn uống', type: 'EXPENSE', icon: 'utensils', color: '#F97316' },
  { id: sysId(2), nameEn: 'Transport', nameVi: 'Di chuyển', type: 'EXPENSE', icon: 'car', color: '#3B82F6' },
  { id: sysId(3), nameEn: 'Housing', nameVi: 'Nhà ở', type: 'EXPENSE', icon: 'home', color: '#8B5CF6' },
  { id: sysId(4), nameEn: 'Bills', nameVi: 'Hóa đơn', type: 'EXPENSE', icon: 'receipt', color: '#EAB308' },
  { id: sysId(5), nameEn: 'Shopping', nameVi: 'Mua sắm', type: 'EXPENSE', icon: 'shopping-bag', color: '#EC4899' },
  { id: sysId(6), nameEn: 'Entertainment', nameVi: 'Giải trí', type: 'EXPENSE', icon: 'clapperboard', color: '#14B8A6' },
  { id: sysId(7), nameEn: 'Education', nameVi: 'Học tập', type: 'EXPENSE', icon: 'graduation-cap', color: '#6366F1' },
  { id: sysId(8), nameEn: 'Health', nameVi: 'Sức khỏe', type: 'EXPENSE', icon: 'heart-pulse', color: '#EF4444' },
  { id: sysId(9), nameEn: 'Gifts', nameVi: 'Quà tặng', type: 'EXPENSE', icon: 'gift', color: '#F43F5E' },
  { id: sysId(10), nameEn: 'Other', nameVi: 'Khác', type: 'EXPENSE', icon: 'ellipsis', color: '#64748B' },
  { id: sysId(11), nameEn: 'Salary', nameVi: 'Lương', type: 'INCOME', icon: 'banknote', color: '#16A34A' },
  { id: sysId(12), nameEn: 'Allowance', nameVi: 'Tiền được cho', type: 'INCOME', icon: 'hand-coins', color: '#22C55E' },
  { id: sysId(13), nameEn: 'Part-time', nameVi: 'Làm thêm', type: 'INCOME', icon: 'briefcase', color: '#10B981' },
  { id: sysId(14), nameEn: 'Bonus', nameVi: 'Thưởng', type: 'INCOME', icon: 'trophy', color: '#84CC16' },
  { id: sysId(15), nameEn: 'Other', nameVi: 'Khác', type: 'INCOME', icon: 'ellipsis', color: '#64748B' },
];
export const CAT = Object.fromEntries(SYSTEM_CATEGORIES.filter((c) => !(c.nameEn === 'Other' && c.type === 'INCOME')).map((c) => [c.nameEn, c.id])) as Record<string, string>;

/** global auto-categorization keywords (same as the API seed), diacritic-free */
export const GLOBAL_RULES: Record<string, string[]> = {
  [CAT['Transport']]: ['grab', 'be', 'xang'],
  [CAT['Food & Drinks']]: ['highlands', 'phuc long', 'tra sua', 'ca phe'],
  [CAT['Shopping']]: ['shopee', 'lazada', 'tiki'],
  [CAT['Bills']]: ['dien', 'nuoc', 'internet'],
};

export interface UserRec {
  id: string; email: string; password: string; fullName: string; avatarUrl: string | null; role: 'USER' | 'ADMIN'; status: 'ACTIVE' | 'LOCKED';
  locale: string; currency: string; monthStartDay: number; plan: 'FREE' | 'PREMIUM'; onboarded: boolean; createdAt: string; settings: NotificationSettings;
  /** null = registered but email not verified yet (undefined = seeded, verified) */
  verifiedAt?: string | null;
}
export interface WalletRec { id: string; userId: string; name: string; type: 'CASH' | 'BANK' | 'EWALLET' | 'CREDIT'; openingBalance: number; currency: string; color: string | null; isArchived: boolean; createdAt: string; updatedAt: string; deletedAt: string | null }
export interface CategoryRec { id: string; userId: string; parentId: string | null; nameVi: string; nameEn: string; type: 'INCOME' | 'EXPENSE'; icon: string | null; color: string | null }
export interface TxnRec { id: string; userId: string; walletId: string; transferWalletId: string | null; categoryId: string | null; type: 'INCOME' | 'EXPENSE' | 'TRANSFER'; amount: number; occurredAt: string; note: string | null; receiptKey: string | null; recurringRuleId: string | null; source: 'MANUAL' | 'IMPORT' | 'RECURRING'; createdAt: string; updatedAt: string; deletedAt: string | null }
export interface BudgetRec { id: string; userId: string; period: string; categoryId: string | null; limitAmount: number; rolloverMode: 'NONE' | 'CARRY_FORWARD'; rolloverAmount: number; alertThresholds: number[]; createdAt: string; updatedAt: string; deletedAt: string | null }
export interface GoalRec { id: string; userId: string; name: string; targetAmount: number; savedAmount: number; deadline: string | null; walletId: string | null; status: 'ACTIVE' | 'ACHIEVED' | 'CANCELED'; createdAt: string; updatedAt: string; deletedAt: string | null }
export interface ContributionRec { id: string; goalId: string; amount: number; occurredAt: string; note: string | null; createdAt: string }
export interface RecurringRec { id: string; userId: string; walletId: string; categoryId: string | null; type: 'INCOME' | 'EXPENSE'; amount: number; note: string | null; frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'; interval: number; nextRunAt: string; endAt: string | null; createdAt: string; updatedAt: string; deletedAt: string | null }
export interface NotificationRec { id: string; userId: string; type: 'BUDGET_WARNING' | 'BUDGET_EXCEEDED' | 'GOAL' | 'SYSTEM'; payload: Record<string, unknown>; message: { en: string; vi: string }; dedupeKey: string; readAt: string | null; createdAt: string }
export interface ImportRec { userId: string; walletId: string; rows: { line: number; occurredAt: string; amount: number; type: 'INCOME' | 'EXPENSE'; note: string | null; categoryId: string | null; duplicate: boolean }[] }

/** what the mock mailer "sent": the demo UI offers these links because there is no inbox */
export interface OutboxRec { to: string; kind: 'verify' | 'reset'; token: string; at: string }

export const db = {
  outbox: [] as OutboxRec[],
  users: [] as UserRec[], wallets: [] as WalletRec[], categories: [] as CategoryRec[], txns: [] as TxnRec[], budgets: [] as BudgetRec[], goals: [] as GoalRec[],
  contributions: [] as ContributionRec[], recurring: [] as RecurringRec[], notifications: [] as NotificationRec[], imports: new Map<string, ImportRec>(),
  /** tokens issued before this instant are rejected: lets /dev/ui prove the silent refresh */
  invalidBefore: 0,
  /** simulate "server down" for the offline banner demo */
  down: false,
};
export const iso = (d: Date | number) => new Date(d).toISOString();
