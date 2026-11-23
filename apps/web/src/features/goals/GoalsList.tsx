import { CalendarClock, Plus, Target, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useGoals, type Goal } from '@/api';
import { PageHeader } from '@/features/common/parts';
import { useLang } from '@/hooks/useLang';
import { formatDate } from '@/lib/format';
import { AmountText, Button, Card, EmptyState, Skeleton, Tabs, TabsList, TabsTrigger } from '@/ui';
import { Celebration, ErrorBlock, StatusBadge } from './bits';
import { ContributeDialog, GoalFormDialog } from './dialogs';
import { GoalRing } from './GoalRing';

const ORDER: Record<Goal['status'], number> = { ACTIVE: 0, ACHIEVED: 1, CANCELED: 2 };
type Filter = 'all' | Goal['status'];

/** deadline line: a date, "no deadline", or an overdue note (icon + words) */
export function DeadlineText({ goal }: { goal: Goal }) {
  const { t } = useTranslation('goals');
  const lang = useLang();
  if (!goal.deadline) return <span>{t('card.noDeadline')}</span>;
  const overdue = goal.status === 'ACTIVE' && new Date(goal.deadline).getTime() < Date.now();
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      <span className="inline-flex items-center gap-1"><CalendarClock className="h-4 w-4" aria-hidden />{t('card.deadline', { date: formatDate(goal.deadline, lang, 'short') })}</span>
      {overdue && <span className="inline-flex items-center gap-1 font-medium text-warn"><TriangleAlert className="h-4 w-4" aria-hidden />{t('card.overdue')}</span>}
    </span>
  );
}

export function RequiredMonthly({ goal }: { goal: Goal }) {
  const { t } = useTranslation('goals');
  if (goal.status !== 'ACTIVE') return null;
  if (!goal.requiredMonthlySaving) return goal.deadline ? null : <p className="text-sm text-ink-2">{t('card.requiredNone')}</p>;
  return <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-ink-2">{t('card.required')}<span className="flex items-baseline gap-1"><AmountText amount={goal.requiredMonthlySaving} size="md" />{t('card.perMonth')}</span></p>;
}

export default function GoalsList() {
  const { t } = useTranslation('goals');
  const q = useGoals();
  const [filter, setFilter] = useState<Filter>('all');
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState<Goal | null>(null);
  const [celebrate, setCelebrate] = useState<Goal | null>(null);

  const goals = useMemo(() => [...(q.data ?? [])].sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.createdAt.localeCompare(a.createdAt)), [q.data]);
  const shown = filter === 'all' ? goals : goals.filter((g) => g.status === filter);
  const addButton = <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden />{t('add')}</Button>;

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} actions={addButton} />
      {celebrate && <Celebration goal={celebrate} onDismiss={() => setCelebrate(null)} />}
      {q.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2" aria-busy="true"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>
      ) : q.isError ? (
        <ErrorBlock title={t('error.title')} hint={t('error.hint')} onRetry={() => void q.refetch()} />
      ) : !goals.length ? (
        <EmptyState icon={Target} title={t('empty.title')} action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden />{t('empty.action')}</Button>}>{t('empty.hint')}</EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList variant="segmented" className="max-w-full self-start overflow-x-auto" aria-label={t('title')}>
              {(['all', 'ACTIVE', 'ACHIEVED', 'CANCELED'] as const).map((f) => <TabsTrigger key={f} value={f}>{t(`filter.${f}`)}</TabsTrigger>)}
            </TabsList>
          </Tabs>
          {!shown.length ? <EmptyState icon={Target} title={t('empty.filtered')} /> : (
            <ul className="grid gap-4 md:grid-cols-2">
              {shown.map((g) => (
                <li key={g.id}>
                  <Card className="flex h-full flex-col gap-4">
                    <div className="flex items-start gap-4">
                      <GoalRing percent={g.percent} name={g.name} canceled={g.status === 'CANCELED'} />
                      <div className="min-w-0 flex-1">
                        <Link to={`/goals/${g.id}`} aria-label={t('card.open', { name: g.name })} className="block truncate rounded-sm text-lg font-semibold text-ink hover:underline">{g.name}</Link>
                        <div className="mt-1"><StatusBadge status={g.status} /></div>
                        <p className="mt-2 text-sm text-ink-2"><DeadlineText goal={g} /></p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-x-4 gap-y-3 min-[420px]:grid-cols-2">
                      <div className="min-w-0"><p className="text-sm text-ink-2">{t('card.saved')}</p><AmountText amount={g.savedAmount} size="lg" /></div>
                      <div className="min-w-0"><p className="text-sm text-ink-2">{t('card.target')}</p><AmountText amount={g.targetAmount} size="lg" /></div>
                    </div>
                    <RequiredMonthly goal={g} />
                    {g.status !== 'CANCELED' && <Button variant="secondary" className="mt-auto self-start" onClick={() => setAdding(g)}><Plus className="h-4 w-4" aria-hidden />{t('detail.contribute')}</Button>}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <GoalFormDialog open={creating} onClose={() => setCreating(false)} />
      <ContributeDialog goal={adding} onClose={() => setAdding(null)} onAchieved={setCelebrate} />
    </>
  );
}
