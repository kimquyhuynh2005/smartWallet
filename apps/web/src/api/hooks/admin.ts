import { useMutation, useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api/endpoints';
import { qk } from '@/lib/queryKeys';
import { useInvalidate } from './_util';

// ADM-01. Admins never get transaction rows from any endpoint, and no hook here may ask for them.
// NOT in the real API yet (docs/backend-requests.md, "settings, plans, reports, admin"): everything except useAdminStats / useAdminUsers is mocked.
type Limits = Parameters<typeof endpoints.admin.updatePlan>[1];

export const useAdminGrowth = (months = 12) => useQuery({ queryKey: qk.admin.growth(months), queryFn: () => endpoints.admin.growth(months) });
export function useUpdateAdminUser() { const inv = useInvalidate(); return useMutation({ mutationFn: (v: { id: string; body: Parameters<typeof endpoints.admin.updateUser>[1] }) => endpoints.admin.updateUser(v.id, v.body), onSuccess: () => inv(['admin']) }); }
export const useAdminCategories = () => useQuery({ queryKey: qk.admin.categories, queryFn: endpoints.admin.categories });
export function useCreateAdminCategory() { const inv = useInvalidate(); return useMutation({ mutationFn: (b: Parameters<typeof endpoints.admin.createCategory>[0]) => endpoints.admin.createCategory(b), onSuccess: () => inv(qk.admin.categories, qk.categories.all) }); }
export function useUpdateAdminCategory() { const inv = useInvalidate(); return useMutation({ mutationFn: (v: { id: string; body: Parameters<typeof endpoints.admin.updateCategory>[1] }) => endpoints.admin.updateCategory(v.id, v.body), onSuccess: () => inv(qk.admin.categories, qk.categories.all) }); }
export function useDeleteAdminCategory() { const inv = useInvalidate(); return useMutation({ mutationFn: (id: string) => endpoints.admin.deleteCategory(id), onSuccess: () => inv(qk.admin.categories, qk.admin.rules, qk.categories.all) }); }
export const useAdminRules = () => useQuery({ queryKey: qk.admin.rules, queryFn: endpoints.admin.rules });
export function useCreateAdminRule() { const inv = useInvalidate(); return useMutation({ mutationFn: (b: Parameters<typeof endpoints.admin.createRule>[0]) => endpoints.admin.createRule(b), onSuccess: () => inv(qk.admin.rules, qk.admin.categories) }); }
export function useDeleteAdminRule() { const inv = useInvalidate(); return useMutation({ mutationFn: (id: string) => endpoints.admin.deleteRule(id), onSuccess: () => inv(qk.admin.rules, qk.admin.categories) }); }
export const useAdminPlans = () => useQuery({ queryKey: qk.admin.plans, queryFn: endpoints.admin.plans });
export function useUpdateAdminPlan() { const inv = useInvalidate(); return useMutation({ mutationFn: (v: { code: 'FREE' | 'PREMIUM'; limits: Limits }) => endpoints.admin.updatePlan(v.code, v.limits), onSuccess: () => inv(qk.admin.plans, qk.plan) }); }
