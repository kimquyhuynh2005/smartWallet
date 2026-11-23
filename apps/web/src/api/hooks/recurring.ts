import { useMutation, useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api/endpoints';
import { qk } from '@/lib/queryKeys';
import { useInvalidate } from './_util';

type Create = Parameters<typeof endpoints.recurring.create>[0];
type Update = Parameters<typeof endpoints.recurring.update>[1];

export const useRecurringRules = () => useQuery({ queryKey: qk.recurring.all, queryFn: endpoints.recurring.list });
export function useCreateRecurringRule() { const inv = useInvalidate(); return useMutation({ mutationFn: (b: Create) => endpoints.recurring.create(b), onSuccess: () => inv(qk.recurring.all) }); }
export function useUpdateRecurringRule() { const inv = useInvalidate(); return useMutation({ mutationFn: (v: { id: string; body: Update }) => endpoints.recurring.update(v.id, v.body), onSuccess: () => inv(qk.recurring.all) }); }
export function useDeleteRecurringRule() { const inv = useInvalidate(); return useMutation({ mutationFn: (id: string) => endpoints.recurring.remove(id), onSuccess: () => inv(qk.recurring.all) }); }
