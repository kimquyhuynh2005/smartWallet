import { useEffect, useState } from 'react';
import { CloudOff, RefreshCw, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { isApiError } from '@/api';
import { Button, Skeleton } from '@/ui';

/** the real API has no such endpoint yet (docs/backend-requests.md, A2..A5): a quiet note, never a retry loop */
export const isUnavailable = (e: unknown) => isApiError(e) && (e.status === 404 || e.status === 405 || e.status === 501 || e.code === 'NOT_FOUND' || e.code === 'RESPONSE_SHAPE');

export function Unavailable() {
  const { t } = useTranslation('admin');
  return (
    <div role="status" className="flex items-start gap-2.5 rounded-md border border-dashed border-line-strong p-4 text-sm text-ink-2">
      <CloudOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>{t('unavailable')}</span>
    </div>
  );
}

export function ErrorRetry({ onRetry, busy }: { onRetry: () => void; busy?: boolean }) {
  const { t } = useTranslation('admin');
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-md border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
      <span className="flex items-start gap-2.5 font-medium"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{t('loadError')}</span>
      <Button size="sm" variant="secondary" onClick={onRetry} loading={busy}><RefreshCw className="h-4 w-4" aria-hidden />{t('retry')}</Button>
    </div>
  );
}

/** loading / unavailable / error-with-retry wrapper for one query */
export function QueryState<T>({ q, skeleton, children }: { q: { isLoading: boolean; isError: boolean; error: unknown; data: T | undefined; refetch: () => unknown; isFetching: boolean }; skeleton?: ReactNode; children: (data: T) => ReactNode }) {
  const { t } = useTranslation('admin');
  if (q.isLoading) return <div role="status" aria-busy><span className="sr-only">{t('loading')}</span>{skeleton ?? <Skeleton className="h-40" />}</div>;
  if (q.isError) return isUnavailable(q.error) ? <Unavailable /> : <ErrorRetry onRetry={() => void q.refetch()} busy={q.isFetching} />;
  if (q.data === undefined) return null;
  return <>{children(q.data)}</>;
}

/** friendly sentence for a failed admin mutation (409 CANNOT_MODIFY_SELF / CANNOT_MODIFY_ADMIN, else generic) */
export function mutationMessage(e: unknown, t: (k: string) => string): string {
  if (isApiError(e)) {
    if (e.code === 'CANNOT_MODIFY_SELF') return t('errors.self');
    if (e.code === 'CANNOT_MODIFY_ADMIN') return t('errors.admin');
    if (isUnavailable(e)) return t('unavailable');
  }
  return t('errors.generic');
}

/** curated picker data, re-implemented here (same idea as features/categories) */
export const ICON_CHOICES = ['tag', 'utensils', 'car', 'home', 'receipt', 'shopping-bag', 'clapperboard', 'graduation-cap', 'heart-pulse', 'gift', 'banknote', 'hand-coins', 'briefcase', 'trophy', 'ellipsis', 'coffee', 'plane', 'bus', 'dumbbell', 'music', 'paw-print', 'baby', 'phone', 'wifi', 'fuel', 'shirt', 'book-open', 'piggy-bank', 'wallet', 'landmark'] as const;
export const COLOR_CHOICES = ['#B85C38', '#4F6FA3', '#8C7442', '#A8841A', '#B2506F', '#2F8A85', '#5666A6', '#BC4A43', '#BE7358', '#737A74', '#2C7A58', '#4F955F', '#33868B', '#7E9A2E'] as const;

/** lower-case, no diacritics: how the API stores a keyword (shown for information; the server is the source of truth) */
export const normalizeKeyword = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim().replace(/\s+/g, ' ');

export function useDebounced<T>(value: T, ms = 250): T {
  // small local hook: avoids a cross-folder import
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}
