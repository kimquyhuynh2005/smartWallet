/**
 * The data layer every feature uses. FROZEN for feature work: changes here go through docs/shared-requests.md.
 *   endpoints   typed calls of the API contract (apps/api/openapi.json), validated with the shared Zod schemas  (src/lib/api/endpoints.ts)
 *   qk          one query-key factory per module                                                                 (src/lib/queryKeys.ts)
 *   hooks       one thin TanStack Query hook per endpoint, with the right invalidations                          (src/api/hooks/*)
 * Plan limits: a 403 PLAN_LIMIT_REACHED from ANY hook opens the global plan dialog; hooks and screens never handle it.
 */
export { endpoints } from '@/lib/api/endpoints';
export type { Me, Wallet, Transaction, Category, Budget, Goal, RecurringRule, AppNotification, Dashboard, Suggestions, TriggeredAlert, PlanInfo, TransactionFilters } from '@/lib/api/endpoints';
export { ApiError } from '@/lib/api/client';
export { applyFieldErrors, describeError, isApiError, isPlanLimit } from '@/lib/api/errors';
export { qk } from '@/lib/queryKeys';
export * from './hooks/wallets';
export * from './hooks/transactions';
export * from './hooks/categories';
export * from './hooks/recurring';
export * from './hooks/budgets';
export * from './hooks/goals';
export * from './hooks/notifications';
export * from './hooks/reports';
export * from './hooks/account';
export * from './hooks/settings';
export * from './hooks/admin';
export { usePeriod } from '@/hooks/usePeriod';
