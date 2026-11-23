import { useMutation, useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api/endpoints';
import { qk } from '@/lib/queryKeys';
import { useInvalidate } from './_util';

type Create = Parameters<typeof endpoints.wallets.create>[0];
type Update = Parameters<typeof endpoints.wallets.update>[1];

// Money moved: a wallet write changes balances, budgets (via transactions of a deleted wallet) and reports.
const MONEY = [qk.wallets.all, qk.transactions.all, qk.budgets.all, qk.reports.all] as const;

export const useWallets = (includeArchived = false) => useQuery({ queryKey: qk.wallets.list(includeArchived), queryFn: () => endpoints.wallets.list(includeArchived) });
export const useWallet = (id: string) => useQuery({ queryKey: qk.wallets.one(id), queryFn: () => endpoints.wallets.get(id), enabled: !!id });
/** 403 PLAN_LIMIT_REACHED (max_wallets) opens the global plan dialog; do not handle it here */
export function useCreateWallet() { const inv = useInvalidate(); return useMutation({ mutationFn: (b: Create) => endpoints.wallets.create(b), onSuccess: () => inv(qk.wallets.all, qk.reports.all) }); }
export function useUpdateWallet() { const inv = useInvalidate(); return useMutation({ mutationFn: (v: { id: string; body: Update }) => endpoints.wallets.update(v.id, v.body), onSuccess: () => inv(qk.wallets.all, qk.reports.all) }); }
/** soft-deletes the wallet AND its transactions (transfers included) */
export function useDeleteWallet() { const inv = useInvalidate(); return useMutation({ mutationFn: (id: string) => endpoints.wallets.remove(id), onSuccess: () => inv(...MONEY) }); }
