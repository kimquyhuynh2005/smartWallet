import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { endpoints } from '@/lib/api/endpoints';
import { qk } from '@/lib/queryKeys';
import { useInvalidate } from './_util';

type Profile = Parameters<typeof endpoints.me.update>[0];
type Onboarding = Parameters<typeof endpoints.me.onboarding>[0];

/** current user (guarded by the session; the shell also exposes useMe in app/auth) */
export const useProfile = () => useQuery({ queryKey: qk.me, queryFn: endpoints.me.get, staleTime: 60_000 });
export function useUpdateProfile() { const qc = useQueryClient(); return useMutation({ mutationFn: (b: Profile) => endpoints.me.update(b), onSuccess: (me) => qc.setQueryData(qk.me, me) }); }
/** USER-03: soft delete now, purge after 30 days. The caller logs the user out afterwards. */
export const useDeleteAccount = () => useMutation({ mutationFn: (password?: string) => endpoints.me.remove(password) });
export function useOnboarding() { const inv = useInvalidate(); return useMutation({ mutationFn: (b: Onboarding) => endpoints.me.onboarding(b), onSuccess: () => inv(qk.me, qk.wallets.all, qk.budgets.all) }); }

/** current plan, limits and usage. NOT in the API yet: mocked (docs/backend-requests.md #1) */
export const usePlan = () => useQuery({ queryKey: qk.plan, queryFn: endpoints.subscription.me, retry: false });
/** mock checkout: upgrades to Premium. Invalidate everything: limits changed. */
export function useMockCheckout() { const qc = useQueryClient(); return useMutation({ mutationFn: endpoints.subscription.mockCheckout, onSuccess: () => qc.invalidateQueries() }); }

/** cancel Premium (SUB-01): back to Free, data kept. NOT in the API yet: mocked */
export function useCancelSubscription() { const qc = useQueryClient(); return useMutation({ mutationFn: endpoints.subscription.cancel, onSuccess: () => qc.invalidateQueries() }); }

export const useAdminStats = () => useQuery({ queryKey: qk.admin.stats, queryFn: endpoints.admin.stats });
/** admins never get transaction rows from any endpoint */
export const useAdminUsers = () => useQuery({ queryKey: qk.admin.users(), queryFn: endpoints.admin.users });
