import { useQueryClient } from '@tanstack/react-query';

type Key = readonly unknown[];

/** `const invalidate = useInvalidate(); onSuccess: () => invalidate(qk.wallets.all, qk.reports.all)` */
export function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: Key[]) => Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
}
