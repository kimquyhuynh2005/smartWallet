import { ArrowDownUp, CalendarClock, LayoutTemplate, PiggyBank, Plus, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBudgets, type Budget } from '@/api';
import { PageHeader } from '@/features/common/parts';
import { useCategories } from '@/hooks/useCategories';
import { Alert, Button, EmptyState, Skeleton, Tabs, TabsList, TabsTrigger } from '@/ui';
import { CategoryCard, TotalCard } from './BudgetCards';
import { AddBudgetDialog, DeleteBudgetDialog, RolloverDialog } from './dialogs';
import { usePeriodRange } from './helpers';
import { TemplateDialog } from './TemplateDialog';

export function ErrorBlock({ title, hint, onRetry }: { title: string; hint: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Alert tone="danger" className="items-center">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="font-semibold">{title}</p><p className="font-normal">{hint}</p></div>
        <Button variant="secondary" onClick={onRetry}><RefreshCw className="h-4 w-4" aria-hidden />{t('common.retry')}</Button>
      </div>
    </Alert>
  );
}

export default function Overview() {
  const { t } = useTranslation('budgets');
  const range = usePeriodRange();
  const q = useBudgets(range.apiPeriod);
  const cats = useCategories();
  const [sort, setSort] = useState<'risk' | 'category'>('risk');
  const [dialog, setDialog] = useState<null | 'add' | 'total' | 'template' | 'rollover'>(null);
  const [deleting, setDeleting] = useState<{ budget: Budget; name: string } | null>(null);

  const budgets = q.data ?? [];
  const total = budgets.find((b) => b.categoryId === null);
  const rows = useMemo(() => {
    const list = budgets.filter((b) => b.categoryId !== null);
    if (sort === 'risk') return [...list].sort((a, b) => b.percentUsed - a.percentUsed);
    const order = new Map((cats.data ?? []).map((c, i) => [c.id, i]));
    return [...list].sort((a, b) => (order.get(a.categoryId!) ?? 999) - (order.get(b.categoryId!) ?? 999));
  }, [budgets, sort, cats.data]);

  const actions = (
    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
      {range.isCurrent && <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setDialog('template')}><LayoutTemplate className="h-4 w-4" aria-hidden />{t('actions.template')}</Button>}
      <Button className="w-full sm:w-auto" onClick={() => setDialog('add')}><Plus className="h-4 w-4" aria-hidden />{t('actions.add')}</Button>
    </div>
  );

  return (
    <>
      <PageHeader title={t('title')} subtitle={<span className="inline-flex items-center gap-1.5"><CalendarClock className="h-4 w-4" aria-hidden /><span className="num">{t('periodRange', { range: range.range })}</span></span>} actions={actions} />
      {!range.isCurrent && <Alert tone="info" className="mb-4">{t('pastPeriod')}</Alert>}

      {q.isLoading ? (
        <div className="flex flex-col gap-4" aria-busy="true"><Skeleton className="h-56" /><div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-60" /><Skeleton className="h-60" /></div></div>
      ) : q.isError ? (
        <ErrorBlock title={t('error.title')} hint={t('error.hint')} onRetry={() => void q.refetch()} />
      ) : !budgets.length ? (
        !range.isCurrent ? <EmptyState icon={PiggyBank} title={t('empty.pastTitle')}>{t('empty.pastHint')}</EmptyState>
        : <EmptyState icon={PiggyBank} title={t('empty.title')} action={<div className="flex flex-wrap gap-2"><Button onClick={() => setDialog('template')}><LayoutTemplate className="h-4 w-4" aria-hidden />{t('list.emptyAction')}</Button><Button variant="secondary" onClick={() => setDialog('add')}><Plus className="h-4 w-4" aria-hidden />{t('actions.add')}</Button></div>}>{t('empty.hint')}</EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {total ? <TotalCard budget={total} apiPeriod={range.apiPeriod} /> : (
            <EmptyState title={t('total.none')} action={<Button variant="secondary" onClick={() => setDialog('total')}><Plus className="h-4 w-4" aria-hidden />{t('total.set')}</Button>}>{t('total.noneHint')}</EmptyState>
          )}
          <section aria-labelledby="by-category">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 id="by-category" className="text-lg font-semibold text-ink">{t('list.title')}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <Tabs value={sort} onValueChange={(v) => setSort(v as 'risk' | 'category')}>
                  <TabsList variant="segmented" aria-label={t('sort.label')}>
                    <TabsTrigger value="risk"><ArrowDownUp className="mr-1 inline h-4 w-4" aria-hidden />{t('sort.risk')}</TabsTrigger>
                    <TabsTrigger value="category">{t('sort.category')}</TabsTrigger>
                  </TabsList>
                </Tabs>
                {range.isCurrent && <Button variant="secondary" size="sm" onClick={() => setDialog('rollover')}><RefreshCw className="h-4 w-4" aria-hidden />{t('actions.rollover')}</Button>}
              </div>
            </div>
            {rows.length ? (
              <ul className="grid gap-4 md:grid-cols-2">
                {rows.map((b) => <li key={b.id}><CategoryCard budget={b} category={cats.map.get(b.categoryId!)} apiPeriod={range.apiPeriod} onDelete={(x, name) => setDeleting({ budget: x, name })} /></li>)}
              </ul>
            ) : (
              <EmptyState icon={PiggyBank} title={t('list.empty')} action={<Button onClick={() => setDialog('template')}><LayoutTemplate className="h-4 w-4" aria-hidden />{t('list.emptyAction')}</Button>}>{t('list.emptyHint')}</EmptyState>
            )}
          </section>
        </div>
      )}

      <AddBudgetDialog open={dialog === 'add' || dialog === 'total'} forTotal={dialog === 'total'} onClose={() => setDialog(null)} apiPeriod={range.apiPeriod} budgets={budgets} />
      <TemplateDialog open={dialog === 'template'} onClose={() => setDialog(null)} apiPeriod={range.apiPeriod} />
      <RolloverDialog open={dialog === 'rollover'} onClose={() => setDialog(null)} apiPeriod={range.apiPeriod} rangeText={range.range} />
      <DeleteBudgetDialog target={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}
