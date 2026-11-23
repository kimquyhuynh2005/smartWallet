import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { endpoints, type TransactionFilters } from '@/lib/api/endpoints';
import { qk } from '@/lib/queryKeys';
import { useInvalidate } from './_util';

type Create = Parameters<typeof endpoints.transactions.create>[0];
type Update = Parameters<typeof endpoints.transactions.update>[1];
type Transfer = Parameters<typeof endpoints.transactions.transfer>[0];
type Receipt = Parameters<typeof endpoints.transactions.receiptUploadUrl>[0];

/** Everything a money write can change: the list, balances, budget progress (+ alerts), reports. */
const MONEY = [qk.transactions.all, qk.wallets.all, qk.budgets.all, qk.reports.all, qk.notifications.all] as const;

export const useTransactions = (f: TransactionFilters = {}) => useQuery({ queryKey: qk.transactions.list(f), queryFn: () => endpoints.transactions.list(f) });
/** "load more" lists; `meta.total` drives hasNextPage */
export const useInfiniteTransactions = (f: Omit<TransactionFilters, 'page'> = {}) => useInfiniteQuery({
  queryKey: qk.transactions.list(f), initialPageParam: 1,
  queryFn: ({ pageParam }) => endpoints.transactions.list({ ...f, page: pageParam }),
  getNextPageParam: (last) => (last.meta.page * last.meta.limit < last.meta.total ? last.meta.page + 1 : undefined),
});
export const useTransaction = (id: string) => useQuery({ queryKey: qk.transactions.one(id), queryFn: () => endpoints.transactions.get(id), enabled: !!id });
/** resolves with `triggeredAlerts` (budget thresholds this expense crossed) */
export function useCreateTransaction() { const inv = useInvalidate(); return useMutation({ mutationFn: (b: Create) => endpoints.transactions.create(b), onSuccess: () => inv(...MONEY) }); }
export function useTransfer() { const inv = useInvalidate(); return useMutation({ mutationFn: (b: Transfer) => endpoints.transactions.transfer(b), onSuccess: () => inv(...MONEY) }); }
export function useUpdateTransaction() { const inv = useInvalidate(); return useMutation({ mutationFn: (v: { id: string; body: Update }) => endpoints.transactions.update(v.id, v.body), onSuccess: () => inv(...MONEY) }); }
export function useDeleteTransaction() { const inv = useInvalidate(); return useMutation({ mutationFn: (id: string) => endpoints.transactions.remove(id), onSuccess: () => inv(...MONEY) }); }
/** pre-signed S3 POST for receipts/{userId}/{uuid}.ext (the response carries the fields to post with the file) */
export const useReceiptUploadUrl = () => useMutation({ mutationFn: (b: Receipt) => endpoints.transactions.receiptUploadUrl(b) });
/** TXN-06 (Premium): preview writes nothing; confirm is single-use. 403 PLAN_LIMIT_REACHED (csv_import) opens the global dialog. */
export const useImportPreview = () => useMutation({ mutationFn: (v: { walletId: string; file: File }) => endpoints.transactions.importPreview(v.walletId, v.file) });
export function useImportConfirm() { const inv = useInvalidate(); return useMutation({ mutationFn: (v: { importId: string; body?: Parameters<typeof endpoints.transactions.importConfirm>[1] }) => endpoints.transactions.importConfirm(v.importId, v.body), onSuccess: () => inv(...MONEY) }); }
