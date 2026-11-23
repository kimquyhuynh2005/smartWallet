import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Ban, Pencil, Plus, RotateCcw, Trash2, History } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { describeError, isApiError, useDeleteGoal, useGoalContributions, useGoals, useUpdateGoal, type Goal } from '@/api';
import { PageHeader } from '@/features/common/parts';
import { useLang } from '@/hooks/useLang';
import { formatDate } from '@/lib/format';
import { toast } from '@/stores/ui';
import { Alert, AmountText, Button, Card, EmptyState, Skeleton } from '@/ui';
import { Celebration, ErrorBlock, StatusBadge } from './bits';
import { ConfirmGoalDialog, ContributeDialog, GoalFormDialog } from './dialogs';
import { GoalRing } from './GoalRing';
import { DeadlineText, RequiredMonthly } from './GoalsList';

/** /goals/:id: ring, numbers, actions and the contribution history */
export default function GoalDetail() {
  const { t } = useTranslation('goals');
  const { t: tc } = useTranslation();
  const lang = useLang();
  const nav = useNavigate();
  const { id = '' } = useParams();
  const goals = useGoals();
  const history = useGoalContributions(id);
  const update = useUpdateGoal();
  const del = useDeleteGoal();
  const goal = goals.data?.find((g) => g.id === id);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<Goal | null>(null);
  const [confirm, setConfirm] = useState<'delete' | 'cancel' | null>(null);
  const [celebrate, setCelebrate] = useState<Goal | null>(null);

  const back = <Link to="/goals" className="mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-medium text-ink-2 hover:text-ink"><ArrowLeft className="h-4 w-4" aria-hidden />{t('detail.back')}</Link>;

  if (goals.isLoading) return <>{back}<div className="flex flex-col gap-4" aria-busy="true"><Skeleton className="h-56" /><Skeleton className="h-48" /></div></>;
  if (goals.isError) return <>{back}<ErrorBlock title={t('error.title')} hint={t('error.hint')} onRetry={() => void goals.refetch()} /></>;
  if (!goal) return <>{back}<EmptyState icon={Ban} title={t('detail.notFound')} action={<Button onClick={() => nav('/goals')}>{t('detail.back')}</Button>}>{t('detail.notFoundHint')}</EmptyState></>;

  const setStatus = (status: 'ACTIVE' | 'CANCELED') => update.mutate({ id: goal.id, body: { status } }, {
    onSuccess: () => { toast.success(status === 'CANCELED' ? t('toast.canceled') : t('toast.reopened')); setConfirm(null); },
    onError: (e) => { toast.error(describeError(e, tc)); setConfirm(null); },
  });
  const remove = () => del.mutate(goal.id, {
    onSuccess: () => { toast.success(t('toast.deleted')); nav('/goals', { replace: true }); },
    onError: (e) => { toast.error(describeError(e, tc)); setConfirm(null); },
  });
  const canceled = goal.status === 'CANCELED';

  return (
    <>
      {back}
      <PageHeader title={goal.name} subtitle={<span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1"><StatusBadge status={goal.status} /><DeadlineText goal={goal} /></span>} />
      {celebrate && <Celebration goal={celebrate} onDismiss={() => setCelebrate(null)} />}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="flex min-w-0 flex-col gap-5">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
              <GoalRing percent={goal.percent} name={goal.name} size={136} canceled={canceled} />
              <div className="grid w-full min-w-0 flex-1 grid-cols-1 gap-x-4 gap-y-3 min-[420px]:grid-cols-2 sm:min-w-[16rem]">
                <div className="min-w-0"><p className="text-sm text-ink-2">{t('card.saved')}</p><AmountText amount={goal.savedAmount} size="lg" /></div>
                <div className="min-w-0"><p className="text-sm text-ink-2">{t('card.target')}</p><AmountText amount={goal.targetAmount} size="lg" /></div>
                {goal.remainingAmount > 0 && <div className="col-span-1 min-[420px]:col-span-2"><p className="text-sm text-ink-2">{t('card.remaining')}</p><AmountText amount={goal.remainingAmount} size="lg" /></div>}
              </div>
            </div>
            <RequiredMonthly goal={goal} />
            {goal.status === 'ACHIEVED' && <Alert tone="success">{t('detail.achievedInfo')}</Alert>}
            {canceled && <Alert tone="info">{t('detail.canceledInfo')}</Alert>}
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              {!canceled && <Button onClick={() => setAdding(goal)}><Plus className="h-4 w-4" aria-hidden />{t('detail.contribute')}</Button>}
              <Button variant="secondary" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" aria-hidden />{t('detail.edit')}</Button>
              {canceled
                ? <Button variant="secondary" loading={update.isPending} onClick={() => setStatus('ACTIVE')}><RotateCcw className="h-4 w-4" aria-hidden />{t('detail.reopen')}</Button>
                : goal.status === 'ACTIVE' && <Button variant="secondary" onClick={() => setConfirm('cancel')}><Ban className="h-4 w-4" aria-hidden />{t('detail.cancelGoal')}</Button>}
              <Button variant="destructive" onClick={() => setConfirm('delete')}><Trash2 className="h-4 w-4" aria-hidden />{t('detail.delete')}</Button>
            </div>
          </Card>
          <p className="text-sm text-ink-2">{t('detail.created', { date: formatDate(goal.createdAt, lang, 'short') })}</p>
        </div>

        <section aria-labelledby="goal-history">
          <h2 id="goal-history" className="mb-3 text-lg font-semibold text-ink">{t('detail.history')}</h2>
          {history.isLoading ? <div className="flex flex-col gap-2" aria-busy="true"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
            : history.isError && isApiError(history.error) && history.error.status === 404 ? <EmptyState icon={History} title={t('detail.historyUnavailable')}>{t('detail.historyUnavailableHint')}</EmptyState>
            : history.isError ? <ErrorBlock title={t('detail.historyError')} hint={t('error.hint')} onRetry={() => void history.refetch()} />
            : !history.data?.length ? <EmptyState icon={History} title={t('detail.historyEmpty')}>{t('detail.historyEmptyHint')}</EmptyState>
            : (
              <Card className="py-1 md:py-2">
                <ul className="divide-y divide-line">
                  {[...history.data].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).map((c) => {
                    const dep = c.amount > 0;
                    return (
                      <li key={c.id} className="flex items-center gap-3 py-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-sunken text-ink-2" aria-hidden>{dep ? <ArrowDownToLine className="h-5 w-5" /> : <ArrowUpFromLine className="h-5 w-5" />}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-medium text-ink">{c.note || (dep ? t('detail.deposit') : t('detail.withdrawal'))}</p>
                          <p className="truncate text-sm text-ink-2">{dep ? t('detail.deposit') : t('detail.withdrawal')} · {formatDate(c.occurredAt, lang, 'short')} {formatDate(c.occurredAt, lang, 'time')}</p>
                        </div>
                        <AmountText amount={Math.abs(c.amount)} kind={dep ? 'income' : 'expense'} />
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
        </section>
      </div>

      <GoalFormDialog open={editing} goal={goal} onClose={() => setEditing(false)} />
      <ContributeDialog goal={adding} onClose={() => setAdding(null)} onAchieved={setCelebrate} />
      <ConfirmGoalDialog goal={confirm ? goal : null} kind={confirm ?? 'delete'} onClose={() => setConfirm(null)} pending={update.isPending || del.isPending} onConfirm={() => (confirm === 'delete' ? remove() : setStatus('CANCELED'))} />
    </>
  );
}
