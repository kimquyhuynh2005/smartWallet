import { useMutation, useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api/endpoints';
import { qk } from '@/lib/queryKeys';
import { useInvalidate } from './_util';

type Create = Parameters<typeof endpoints.categories.create>[0];
type Update = Parameters<typeof endpoints.categories.update>[1];
type Suggest = Parameters<typeof endpoints.categories.suggest>[0];

/** system defaults (user_id null, read-only) + the user's own; `type` filters */
export const useCategoryList = (type?: 'INCOME' | 'EXPENSE') => useQuery({ queryKey: qk.categories.list(type), queryFn: () => endpoints.categories.list(type), staleTime: 5 * 60_000 });
export function useCreateCategory() { const inv = useInvalidate(); return useMutation({ mutationFn: (b: Create) => endpoints.categories.create(b), onSuccess: () => inv(qk.categories.all) }); }
export function useUpdateCategory() { const inv = useInvalidate(); return useMutation({ mutationFn: (v: { id: string; body: Update }) => endpoints.categories.update(v.id, v.body), onSuccess: () => inv(qk.categories.all, qk.transactions.all, qk.budgets.all) }); }
/** also removes the children and their budgets/rules; past transactions keep the category */
export function useDeleteCategory() { const inv = useInvalidate(); return useMutation({ mutationFn: (id: string) => endpoints.categories.remove(id), onSuccess: () => inv(qk.categories.all, qk.budgets.all, qk.reports.all) }); }
/** one-off suggestion (the form uses useCategorySuggestion in features/quick-add for the debounced query version) */
export const useSuggestCategory = () => useMutation({ mutationFn: (b: Suggest) => endpoints.categories.suggest(b) });
