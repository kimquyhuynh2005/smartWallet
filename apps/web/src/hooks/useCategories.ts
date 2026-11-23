import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { endpoints, type Category } from '@/lib/api/endpoints';
import { qk } from '@/lib/queryKeys';
import type { Lang } from '@/lib/format';

export const categoryName = (c: { nameVi: string; nameEn: string } | undefined | null, lang: Lang, fallback = '') => (c ? (lang === 'en' ? c.nameEn : c.nameVi) : fallback);

/** categories (system + own) with an id -> category map for list rows */
export function useCategories() {
  const q = useQuery({ queryKey: qk.categories.all, queryFn: () => endpoints.categories.list(), staleTime: 5 * 60_000 });
  const map = useMemo(() => new Map<string, Category>((q.data ?? []).map((c) => [c.id, c])), [q.data]);
  return { ...q, map };
}
export function useWallets() {
  const q = useQuery({ queryKey: qk.wallets.list(false), queryFn: () => endpoints.wallets.list() });
  const map = useMemo(() => new Map((q.data ?? []).map((w) => [w.id, w])), [q.data]);
  return { ...q, map };
}
