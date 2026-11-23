import { useQuery } from '@tanstack/react-query';
import { preselectCategory } from '@smartwallet/shared';
import { useEffect, useState } from 'react';
import { endpoints } from '@/lib/api/endpoints';
import { qk } from '@/lib/queryKeys';

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * CAT-03: POST /categories/suggest for the note being typed (debounced).
 * `preselectedId` is non-null only when the top suggestion's confidence is >= 0.6; that rule lives in @smartwallet/shared.
 */
export function useCategorySuggestion(note: string, amount: number | undefined, type: 'INCOME' | 'EXPENSE') {
  const debounced = useDebounced(note.trim());
  const q = useQuery({
    queryKey: qk.categories.suggest(debounced, amount, type),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
    meta: { silent: true }, // a missing suggestion must never interrupt typing
    queryFn: () => endpoints.categories.suggest({ note: debounced, ...(amount ? { amount } : {}), type }),
  });
  const suggestions = debounced.length >= 2 ? (q.data?.suggestions ?? []) : [];
  return { suggestions, preselectedId: preselectCategory(suggestions), isLoading: q.isFetching };
}
