import { Lock, Plus, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { UseQueryResult } from '@tanstack/react-query';
import { describeError, isPlanLimit } from '@/api';
import { Alert, Button, Card, EmptyState, Skeleton } from '@/ui';
import { useUi } from '@/stores/ui';

/** one section = one card with a heading (and optional controls) */
export function Section({ title, hint, actions, children }: { title: string; hint?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          {hint && <p className="mt-0.5 text-sm text-ink-2">{hint}</p>}
        </div>
        {actions}
      </div>
      {children}
    </Card>
  );
}

export const HISTORY_LOCK = { key: 'history_months', limit: 6 } as const;

/** calm locked state: no red, no alarm; one sentence and one way forward */
export function LockedCard({ text, reason = HISTORY_LOCK }: { text: string; reason?: { key?: string; limit?: number; feature?: string } }) {
  const { t } = useTranslation('reports');
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-line bg-sunken p-4 md:flex-row md:items-center md:p-5">
      <Lock className="h-5 w-5 text-ink-3" aria-hidden />
      <p className="max-w-prose flex-1 text-sm text-ink-2">{text}</p>
      <Button size="sm" variant="secondary" className="shrink-0" onClick={() => useUi.getState().openUpgrade({ ...reason })}>{t('upgrade')}</Button>
    </div>
  );
}

export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation('reports');
  const { t: tc } = useTranslation();
  return (
    <div className="flex flex-col items-start gap-3">
      <Alert tone="danger">{describeError(error, tc)}</Alert>
      <Button size="sm" variant="secondary" onClick={onRetry}>{t('retry')}</Button>
    </div>
  );
}

export function EmptyBlock({ icon, title, children }: { icon: LucideIcon; title: string; children: string }) {
  const { t } = useTranslation('reports');
  return (
    <EmptyState icon={icon} title={title} action={<Button size="sm" onClick={() => useUi.getState().openQuickAdd()}><Plus className="h-4 w-4" aria-hidden />{t('addTransaction')}</Button>}>{children}</EmptyState>
  );
}

/** loading / locked / error / empty / success for one query */
export function Boundary<T>({ q, skeleton, isEmpty, empty, locked, children }: {
  q: UseQueryResult<T>; skeleton: ReactNode; isEmpty: (d: T) => boolean; empty: ReactNode; locked?: string; children: (d: T) => ReactNode;
}) {
  if (q.isPending) return <div role="status" aria-busy>{skeleton}</div>;
  if (q.isError) {
    if (isPlanLimit(q.error)) return <LockedCard text={locked ?? ''} />;
    return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;
  }
  return isEmpty(q.data) ? <>{empty}</> : <>{children(q.data)}</>;
}

export const ChartSkeleton = ({ h = 'h-56' }: { h?: string }) => <Skeleton className={`${h} w-full`} />;

interface TipRow { name?: string | number; value?: number | string | readonly (number | string)[] | null; color?: string }
/** tooltip in the app's surface, ink text (never the series colour), a swatch beside each row */
export function ChartTip({ active, payload, label, format }: { active?: boolean; payload?: readonly TipRow[]; label?: string | number; format: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="max-w-[16rem] rounded-md border border-line bg-surface px-3 py-2 text-sm shadow-float">
      <p className="mb-1 font-medium text-ink">{label}</p>
      {payload.filter((p) => p.value !== null && p.value !== undefined).map((p) => (
        <p key={String(p.name)} className="flex items-center justify-between gap-4 text-ink-2">
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.color }} aria-hidden />{p.name}</span>
          <span className="num font-medium text-ink">{format(Number(p.value))}</span>
        </p>
      ))}
    </div>
  );
}

/** smallest "round" ceiling (1, 2, 2.5, 5 x 10^k per step) so 5 ticks (0..4 steps) land on clean values */
export const niceCeil = (max: number) => {
  if (max <= 0) return 4;
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)) ?? raw;
  return step * 4;
};

export const AXIS = { fill: 'rgb(var(--ink-2))', fontSize: 12 } as const;

/** Vietnam calendar day (yyyy-mm-dd) of an ISO instant; `endExclusive` for a period end that is the next midnight */
export const dayOf = (iso: string, endExclusive = false) => {
  const d = new Date(iso);
  const x = endExclusive ? new Date(d.getTime() - 1) : d;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(x);
};
