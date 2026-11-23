import { z } from 'zod';
import {
  ApplyTemplateOut, ApplyTemplateSchema, BudgetOut, ByCategoryOut, CategoryOut, ConfirmImportSchema, ContributionResultOut, ContributionSchema, CreateBudgetSchema,
  CreateCategorySchema, CreateGoalSchema, CreateRecurringRuleSchema, CreateTransactionSchema, CreateWalletSchema, DailyOut, DashboardOut, GoalOut, ImportConfirmOut, ImportPreviewOut,
  LoginSchema, NotificationOut, NotificationSettingsSchema, OnboardingSchema, ReadAllOut, ReceiptUploadOut, ReceiptUploadSchema, RecurringRuleOut, RegisterSchema, RolloverOut,
  SuggestCategoryBodySchema, SuggestCategoryOut, TransactionCreatedOut, TransactionOut, TransferSchema, TrendOut, UpdateBudgetSchema, UpdateCategorySchema, UpdateGoalSchema,
  UpdateNotificationSettingsSchema, UpdateProfileSchema, UpdateRecurringRuleSchema, UpdateTransactionSchema, UpdateWalletSchema, WalletOut,
} from '@smartwallet/shared';
import { request } from './client';
import { AdminCategorySchema, AdminGrowthSchema, AdminPlanSchema, AdminRuleSchema, AdminStatsSchema, AdminUserSchema, ContributionRowSchema, MeSchema, PlanInfoSchema, SessionSchema, TokenSchema, TopNotesSchema } from './schemas';

type In<S extends z.ZodTypeAny> = z.input<S>;
const arr = <S extends z.ZodTypeAny>(s: S) => z.array(s);
const NoContent = undefined;
void NoContent;

export type Me = z.infer<typeof MeSchema>;
export type Wallet = z.infer<typeof WalletOut>;
export type Transaction = z.infer<typeof TransactionOut>;
export type Category = z.infer<typeof CategoryOut>;
export type Budget = z.infer<typeof BudgetOut>;
export type Goal = z.infer<typeof GoalOut>;
export type RecurringRule = z.infer<typeof RecurringRuleOut>;
export type AppNotification = z.infer<typeof NotificationOut>;
export type Dashboard = z.infer<typeof DashboardOut>;
export type Suggestions = z.infer<typeof SuggestCategoryOut>;
export type TriggeredAlert = z.infer<typeof TransactionCreatedOut>['triggeredAlerts'][number];
export type PlanInfo = z.infer<typeof PlanInfoSchema>;
export interface TransactionFilters {
  page?: number; limit?: number; sort?: string; from?: string; to?: string; type?: 'INCOME' | 'EXPENSE' | 'TRANSFER'; walletId?: string; categoryId?: string;
  minAmount?: number; maxAmount?: number; q?: string;
}

/** Every call of the API contract (apps/api/openapi.json), typed with the shared Zod schemas. */
export const endpoints = {
  auth: {
    register: (b: In<typeof RegisterSchema>) => request('/auth/register', { method: 'POST', body: b, anonymous: true }),
    verifyEmail: (token: string) => request('/auth/verify-email', { method: 'POST', body: { token }, anonymous: true }),
    login: (b: In<typeof LoginSchema>): Promise<z.infer<typeof TokenSchema>> => request('/auth/login', { method: 'POST', body: b, anonymous: true, schema: TokenSchema }),
    logout: () => request('/auth/logout', { method: 'POST', anonymous: true }),
    forgotPassword: (email: string) => request('/auth/forgot-password', { method: 'POST', body: { email }, anonymous: true }),
    /** NOT in the real API yet (docs/backend-requests.md #7): mocked only, the UI hides it when mocks are off */
    resendVerification: (email: string) => request('/auth/resend-verification', { method: 'POST', body: { email }, anonymous: true }),
    resetPassword: (token: string, password: string) => request('/auth/reset-password', { method: 'POST', body: { token, password }, anonymous: true }),
  },
  me: {
    get: (): Promise<Me> => request('/me', { schema: MeSchema }),
    update: (b: In<typeof UpdateProfileSchema>): Promise<Me> => request('/me', { method: 'PATCH', body: b, schema: MeSchema }),
    remove: (password?: string) => request('/me', { method: 'DELETE', body: { password } }),
    /** NOT in the API yet (docs/backend-requests.md #8): mocked */
    changePassword: (b: { currentPassword: string; newPassword: string }) => request('/me/password', { method: 'POST', body: b }),
    /** NOT in the API yet: mocked */
    sessions: (): Promise<z.infer<typeof SessionSchema>[]> => request('/me/sessions', { schema: arr(SessionSchema) }),
    revokeSession: (id: string) => request(`/me/sessions/${id}`, { method: 'DELETE' }),
    revokeOtherSessions: () => request('/me/sessions/revoke-others', { method: 'POST' }),
    onboarding: (b: In<typeof OnboardingSchema>) => request('/me/onboarding', { method: 'POST', body: b }),
  },
  wallets: {
    list: (includeArchived = false): Promise<Wallet[]> => request('/wallets', { query: { includeArchived: includeArchived || undefined }, schema: arr(WalletOut) }),
    create: (b: In<typeof CreateWalletSchema>): Promise<Wallet> => request('/wallets', { method: 'POST', body: b, schema: WalletOut }),
    get: (id: string): Promise<Wallet> => request(`/wallets/${id}`, { schema: WalletOut }),
    update: (id: string, b: In<typeof UpdateWalletSchema>): Promise<Wallet> => request(`/wallets/${id}`, { method: 'PATCH', body: b, schema: WalletOut }),
    remove: (id: string) => request(`/wallets/${id}`, { method: 'DELETE' }),
  },
  transactions: {
    list: (f: TransactionFilters = {}): Promise<{ data: Transaction[]; meta: { page: number; limit: number; total: number } }> => request('/transactions', { query: f as any, schema: arr(TransactionOut) }),
    create: (b: In<typeof CreateTransactionSchema>): Promise<z.infer<typeof TransactionCreatedOut>> => request('/transactions', { method: 'POST', body: b, schema: TransactionCreatedOut }),
    transfer: (b: In<typeof TransferSchema>): Promise<Transaction> => request('/transactions/transfer', { method: 'POST', body: b, schema: TransactionOut }),
    get: (id: string): Promise<Transaction> => request(`/transactions/${id}`, { schema: TransactionOut }),
    update: (id: string, b: In<typeof UpdateTransactionSchema>): Promise<Transaction> => request(`/transactions/${id}`, { method: 'PATCH', body: b, schema: TransactionOut }),
    remove: (id: string) => request(`/transactions/${id}`, { method: 'DELETE' }),
    receiptUploadUrl: (b: In<typeof ReceiptUploadSchema>): Promise<z.infer<typeof ReceiptUploadOut>> => request('/transactions/receipts/upload-url', { method: 'POST', body: b, schema: ReceiptUploadOut }),
    importPreview: (walletId: string, file: File): Promise<z.infer<typeof ImportPreviewOut>> => {
      const f = new FormData();
      f.set('walletId', walletId);
      f.set('file', file);
      return request('/transactions/import', { method: 'POST', formData: f, schema: ImportPreviewOut });
    },
    importConfirm: (importId: string, b: In<typeof ConfirmImportSchema> = {}): Promise<z.infer<typeof ImportConfirmOut>> => request(`/transactions/import/${importId}/confirm`, { method: 'POST', body: b, schema: ImportConfirmOut }),
  },
  categories: {
    list: (type?: 'INCOME' | 'EXPENSE'): Promise<Category[]> => request('/categories', { query: { type }, schema: arr(CategoryOut) }),
    create: (b: In<typeof CreateCategorySchema>): Promise<Category> => request('/categories', { method: 'POST', body: b, schema: CategoryOut }),
    update: (id: string, b: In<typeof UpdateCategorySchema>): Promise<Category> => request(`/categories/${id}`, { method: 'PATCH', body: b, schema: CategoryOut }),
    remove: (id: string) => request(`/categories/${id}`, { method: 'DELETE' }),
    suggest: (b: In<typeof SuggestCategoryBodySchema>): Promise<Suggestions> => request('/categories/suggest', { method: 'POST', body: b, schema: SuggestCategoryOut }),
  },
  recurring: {
    list: (): Promise<RecurringRule[]> => request('/recurring-rules', { schema: arr(RecurringRuleOut) }),
    create: (b: In<typeof CreateRecurringRuleSchema>): Promise<RecurringRule> => request('/recurring-rules', { method: 'POST', body: b, schema: RecurringRuleOut }),
    update: (id: string, b: In<typeof UpdateRecurringRuleSchema>): Promise<RecurringRule> => request(`/recurring-rules/${id}`, { method: 'PATCH', body: b, schema: RecurringRuleOut }),
    remove: (id: string) => request(`/recurring-rules/${id}`, { method: 'DELETE' }),
  },
  budgets: {
    list: (period?: string): Promise<Budget[]> => request('/budgets', { query: { period }, schema: arr(BudgetOut) }),
    create: (b: In<typeof CreateBudgetSchema>): Promise<Budget> => request('/budgets', { method: 'POST', body: b, schema: BudgetOut }),
    update: (id: string, b: In<typeof UpdateBudgetSchema>): Promise<Budget> => request(`/budgets/${id}`, { method: 'PATCH', body: b, schema: BudgetOut }),
    remove: (id: string) => request(`/budgets/${id}`, { method: 'DELETE' }),
    applyTemplate: (b: In<typeof ApplyTemplateSchema>): Promise<z.infer<typeof ApplyTemplateOut>> => request('/budgets/apply-template', { method: 'POST', body: b, schema: ApplyTemplateOut }),
    rollover: (period?: string): Promise<z.infer<typeof RolloverOut>> => request('/budgets/rollover', { method: 'POST', body: { period }, schema: RolloverOut }),
  },
  goals: {
    list: (): Promise<Goal[]> => request('/goals', { schema: arr(GoalOut) }),
    create: (b: In<typeof CreateGoalSchema>): Promise<Goal> => request('/goals', { method: 'POST', body: b, schema: GoalOut }),
    update: (id: string, b: In<typeof UpdateGoalSchema>): Promise<Goal> => request(`/goals/${id}`, { method: 'PATCH', body: b, schema: GoalOut }),
    remove: (id: string) => request(`/goals/${id}`, { method: 'DELETE' }),
    contribute: (id: string, b: In<typeof ContributionSchema>): Promise<z.infer<typeof ContributionResultOut>> => request(`/goals/${id}/contributions`, { method: 'POST', body: b, schema: ContributionResultOut }),
    /** not in the API yet: mocked (docs/backend-requests.md #2) */
    contributions: (id: string): Promise<z.infer<typeof ContributionRowSchema>[]> => request(`/goals/${id}/contributions`, { schema: arr(ContributionRowSchema) }),
  },
  notifications: {
    list: (q: { page?: number; limit?: number; unread?: boolean } = {}): Promise<{ data: AppNotification[]; meta: { page: number; limit: number; total: number } }> => request('/notifications', { query: q, schema: arr(NotificationOut) }),
    markRead: (id: string): Promise<AppNotification> => request(`/notifications/${id}/read`, { method: 'PATCH', schema: NotificationOut }),
    readAll: (): Promise<z.infer<typeof ReadAllOut>> => request('/notifications/read-all', { method: 'POST', schema: ReadAllOut }),
    settings: (): Promise<z.infer<typeof NotificationSettingsSchema>> => request('/notification-settings', { schema: NotificationSettingsSchema }),
    updateSettings: (b: In<typeof UpdateNotificationSettingsSchema>): Promise<z.infer<typeof NotificationSettingsSchema>> => request('/notification-settings', { method: 'PATCH', body: b, schema: NotificationSettingsSchema }),
  },
  reports: {
    dashboard: (period?: string): Promise<Dashboard> => request('/reports/dashboard', { query: { period }, schema: DashboardOut }),
    byCategory: (period?: string, type: 'INCOME' | 'EXPENSE' = 'EXPENSE'): Promise<z.infer<typeof ByCategoryOut>> => request('/reports/by-category', { query: { period, type }, schema: ByCategoryOut }),
    trend: (months = 6): Promise<z.infer<typeof TrendOut>> => request('/reports/trend', { query: { months }, schema: TrendOut }),
    daily: (period?: string): Promise<z.infer<typeof DailyOut>> => request('/reports/daily', { query: { period }, schema: DailyOut }),
    /** NOT in the API yet: mocked (top notes / merchants of a period) */
    topNotes: (period?: string, type: 'INCOME' | 'EXPENSE' = 'EXPENSE', limit = 8): Promise<z.infer<typeof TopNotesSchema>> => request('/reports/top-notes', { query: { period, type, limit }, schema: TopNotesSchema }),
    exportCsv: (period?: string): Promise<string> => request('/reports/export', { query: { format: 'csv', period }, text: true }),
  },
  subscription: {
    mockCheckout: () => request('/subscriptions/mock-checkout', { method: 'POST' }),
    /** NOT in the API yet: mocked */
    cancel: () => request('/subscriptions/cancel', { method: 'POST' }),
    /** not in the API yet: mocked (docs/backend-requests.md #1) */
    me: (): Promise<PlanInfo> => request('/subscriptions/me', { schema: PlanInfoSchema }),
  },
  admin: {
    stats: (): Promise<z.infer<typeof AdminStatsSchema>> => request('/admin/stats', { schema: AdminStatsSchema }),
    users: (): Promise<z.infer<typeof AdminUserSchema>[]> => request('/admin/users', { schema: arr(AdminUserSchema) }),
    // everything below is NOT in the API yet: mocked (docs/backend-requests.md #5, #6 and the admin rows)
    updateUser: (id: string, b: { status?: 'ACTIVE' | 'LOCKED'; plan?: 'FREE' | 'PREMIUM' }): Promise<z.infer<typeof AdminUserSchema>> => request(`/admin/users/${id}`, { method: 'PATCH', body: b, schema: AdminUserSchema }),
    growth: (months = 12): Promise<z.infer<typeof AdminGrowthSchema>> => request('/admin/stats/growth', { query: { months }, schema: AdminGrowthSchema }),
    categories: (): Promise<z.infer<typeof AdminCategorySchema>[]> => request('/admin/categories', { schema: arr(AdminCategorySchema) }),
    createCategory: (b: { nameVi: string; nameEn: string; type: 'INCOME' | 'EXPENSE'; icon?: string | null; color?: string | null }): Promise<z.infer<typeof AdminCategorySchema>> => request('/admin/categories', { method: 'POST', body: b, schema: AdminCategorySchema }),
    updateCategory: (id: string, b: Partial<{ nameVi: string; nameEn: string; type: 'INCOME' | 'EXPENSE'; icon: string | null; color: string | null }>): Promise<z.infer<typeof AdminCategorySchema>> => request(`/admin/categories/${id}`, { method: 'PATCH', body: b, schema: AdminCategorySchema }),
    deleteCategory: (id: string) => request(`/admin/categories/${id}`, { method: 'DELETE' }),
    rules: (): Promise<z.infer<typeof AdminRuleSchema>[]> => request('/admin/category-rules', { schema: arr(AdminRuleSchema) }),
    createRule: (b: { keyword: string; categoryId: string }): Promise<z.infer<typeof AdminRuleSchema>> => request('/admin/category-rules', { method: 'POST', body: b, schema: AdminRuleSchema }),
    deleteRule: (id: string) => request(`/admin/category-rules/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    plans: (): Promise<z.infer<typeof AdminPlanSchema>[]> => request('/admin/plans', { schema: arr(AdminPlanSchema) }),
    updatePlan: (code: 'FREE' | 'PREMIUM', limits: z.infer<typeof AdminPlanSchema>['limits']): Promise<z.infer<typeof AdminPlanSchema>> => request(`/admin/plans/${code}`, { method: 'PATCH', body: { limits }, schema: AdminPlanSchema }),
  },
};
