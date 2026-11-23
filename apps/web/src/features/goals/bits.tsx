import { Ban, CircleCheck, RefreshCw, Target, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, Badge, Button } from '@/ui';
import type { Goal } from '@/api';
import { GoalRing } from './GoalRing';

/** status is always icon + word, never color alone */
export function StatusBadge({ status }: { status: Goal['status'] }) {
  const { t } = useTranslation('goals');
  const icon = status === 'ACHIEVED' ? <CircleCheck /> : status === 'CANCELED' ? <Ban /> : <Target />;
  return <Badge tone={status === 'ACHIEVED' ? 'accent' : 'neutral'} icon={icon}>{t(`status.${status}`)}</Badge>;
}

export function ErrorBlock({ title, hint, onRetry }: { title: string; hint: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Alert tone="danger">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="font-semibold">{title}</p><p className="font-normal">{hint}</p></div>
        <Button variant="secondary" onClick={onRetry}><RefreshCw className="h-4 w-4" aria-hidden />{t('common.retry')}</Button>
      </div>
    </Alert>
  );
}

/**
 * One calm "goal reached" moment: a single soft ring pulse (off with reduced motion) and a message, announced politely. No confetti.
 */
export function Celebration({ goal, onDismiss }: { goal: Goal; onDismiss: () => void }) {
  const { t } = useTranslation('goals');
  return (
    <div role="status" aria-live="polite" className="mb-5 flex items-start gap-4 rounded-lg border border-accent/30 bg-accent-soft p-4">
      <div className="relative shrink-0">
        <span aria-hidden className="absolute inset-0 rounded-full bg-accent/30 motion-safe:animate-ring-pulse motion-reduce:hidden" />
        <GoalRing percent={100} name={goal.name} size={64} className="relative" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-lg font-semibold text-ink">{t('celebrate.title', { name: goal.name })}</p>
        <p className="mt-0.5 text-sm text-ink-2">{t('celebrate.body')}</p>
      </div>
      <Button size="icon" variant="ghost" onClick={onDismiss} aria-label={t('celebrate.dismiss')}><X className="h-5 w-5" aria-hidden /></Button>
    </div>
  );
}
