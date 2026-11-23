import { useMutation, useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api/endpoints';
import { qk } from '@/lib/queryKeys';
import { useInvalidate } from './_util';

type Create = Parameters<typeof endpoints.goals.create>[0];
type Update = Parameters<typeof endpoints.goals.update>[1];
type Contribute = Parameters<typeof endpoints.goals.contribute>[1];

export const useGoals = () => useQuery({ queryKey: qk.goals.all, queryFn: endpoints.goals.list });
/** contribution history. NOT in the API yet: mocked (docs/backend-requests.md #2) */
export const useGoalContributions = (id: string) => useQuery({ queryKey: qk.goals.contributions(id), queryFn: () => endpoints.goals.contributions(id), enabled: !!id });
/** 403 PLAN_LIMIT_REACHED (max_goals) opens the global plan dialog */
export function useCreateGoal() { const inv = useInvalidate(); return useMutation({ mutationFn: (b: Create) => endpoints.goals.create(b), onSuccess: () => inv(qk.goals.all, qk.reports.all) }); }
export function useUpdateGoal() { const inv = useInvalidate(); return useMutation({ mutationFn: (v: { id: string; body: Update }) => endpoints.goals.update(v.id, v.body), onSuccess: () => inv(qk.goals.all, qk.reports.all) }); }
export function useDeleteGoal() { const inv = useInvalidate(); return useMutation({ mutationFn: (id: string) => endpoints.goals.remove(id), onSuccess: () => inv(qk.goals.all, qk.reports.all) }); }
/** deposits or withdrawals (negative); ACHIEVED is derived by the API, never set by hand */
export function useContributeToGoal() { const inv = useInvalidate(); return useMutation({ mutationFn: (v: { id: string; body: Contribute }) => endpoints.goals.contribute(v.id, v.body), onSuccess: (_r, v) => inv(qk.goals.all, qk.goals.contributions(v.id), qk.reports.all, qk.notifications.all) }); }
