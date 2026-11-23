import { useMutation, useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api/endpoints';
import { qk } from '@/lib/queryKeys';
import { useInvalidate } from './_util';

type Create = Parameters<typeof endpoints.budgets.create>[0];
type Update = Parameters<typeof endpoints.budgets.update>[1];
type Template = Parameters<typeof endpoints.budgets.applyTemplate>[0];

const CHANGED = [qk.budgets.all, qk.reports.all] as const;

/** `period` = "YYYY-MM" (usePeriod().apiPeriod); undefined = the current period. "spent" is computed by the API, never stored. */
export const useBudgets = (period?: string) => useQuery({ queryKey: qk.budgets.list(period), queryFn: () => endpoints.budgets.list(period) });
/** 403 PLAN_LIMIT_REACHED (max_budgets) opens the global plan dialog */
export function useCreateBudget() { const inv = useInvalidate(); return useMutation({ mutationFn: (b: Create) => endpoints.budgets.create(b), onSuccess: () => inv(...CHANGED) }); }
export function useUpdateBudget() { const inv = useInvalidate(); return useMutation({ mutationFn: (v: { id: string; body: Update }) => endpoints.budgets.update(v.id, v.body), onSuccess: () => inv(...CHANGED) }); }
export function useDeleteBudget() { const inv = useInvalidate(); return useMutation({ mutationFn: (id: string) => endpoints.budgets.remove(id), onSuccess: () => inv(...CHANGED) }); }
/** 50/30/20, 6 Jars or CUSTOM. Writes; there is no dry run yet (docs/backend-requests.md #17). */
export function useApplyTemplate() { const inv = useInvalidate(); return useMutation({ mutationFn: (b: Template) => endpoints.budgets.applyTemplate(b), onSuccess: () => inv(...CHANGED) }); }
export function useRollover() { const inv = useInvalidate(); return useMutation({ mutationFn: (period?: string) => endpoints.budgets.rollover(period), onSuccess: () => inv(...CHANGED) }); }
