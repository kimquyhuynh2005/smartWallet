import { Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { describeError, useUpdateBudget, type Budget, type Category } from '@/api';
import { categoryName } from '@/hooks/useCategories';
import { useLang } from '@/hooks/useLang';
import { toast } from '@/stores/ui';
import { AmountText, Button, Card, CategoryIcon, ProgressBar, Switch } from '@/ui';
import { LimitCell } from './LimitCell';

/** "Còn lại X" or "Vượt X" and the daily allowance: numbers first, status words come from the ProgressBar */
function Remaining({ b }: { b: Budget }) {
  const { t } = useTranslation('budgets');
  const over = b.remaining < 0;
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-2">
      <p className="flex items-baseline gap-1.5">{over ? t('row.over') : t('row.left')}<AmountText amount={Math.abs(b.remaining)} size="sm" className={over ? 'text-danger' : undefined} /></p>
      {b.daysLeft > 0 ? (
        <p className="flex items-baseline gap-1.5">{t('row.safe')}<AmountText amount={b.safeToSpendToday} size="sm" /></p>
      ) : (
        <p>{t('total.ended')}</p>
      )}
    </div>
  );
}

export function TotalCard({ budget, apiPeriod }: { budget: Budget; apiPeriod: string | undefined }) {
  const { t } = useTranslation('budgets');
  const over = budget.remaining < 0;
  return (
    <Card className="flex flex-col gap-4" aria-labelledby="total-budget-title">
      <div className="flex items-start justify-between gap-3">
        <h2 id="total-budget-title" className="eyebrow">{t('total.title')}</h2>
      </div>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-sm text-ink-2">{t('total.spent')}</p>
          <AmountText amount={budget.spent} size="hero" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-ink-2">{t('total.limit')}</p>
          <LimitCell budget={budget} name={t('total.title')} apiPeriod={apiPeriod} size="xl" />
        </div>
      </div>
      <ProgressBar percent={budget.percentUsed} label={t('total.title')} />
      <div className="grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
        <div>
          <p className="text-sm text-ink-2">{over ? t('total.over') : t('total.remaining')}</p>
          <AmountText amount={Math.abs(budget.remaining)} size="lg" className={over ? 'text-danger' : undefined} />
        </div>
        <div>
          <p className="text-sm text-ink-2">{t('total.safe')}</p>
          {budget.daysLeft > 0 ? (
            <p className="flex flex-wrap items-baseline gap-x-2"><AmountText amount={budget.safeToSpendToday} size="lg" /><span className="text-sm text-ink-2">{t('total.perDay', { days: budget.daysLeft })}</span></p>
          ) : <p className="text-base text-ink-2">{t('total.ended')}</p>}
        </div>
      </div>
    </Card>
  );
}

export function CategoryCard({ budget, category, apiPeriod, onDelete, showName = true }: { showName?: boolean; budget: Budget; category?: Category; apiPeriod: string | undefined; onDelete: (b: Budget, name: string) => void }) {
  const { t } = useTranslation('budgets');
  const { t: tc } = useTranslation();
  const lang = useLang();
  const update = useUpdateBudget();
  const name = categoryName(category, lang, t('detail.unknown'));
  const carry = budget.rolloverMode === 'CARRY_FORWARD';
  const setCarry = (on: boolean) => update.mutate(
    { id: budget.id, body: { rolloverMode: on ? 'CARRY_FORWARD' : 'NONE' } },
    { onSuccess: () => toast.success(t('toast.carrySaved')), onError: (e) => toast.error(describeError(e, tc)) },
  );
  return (
    <Card className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-3">
        {showName && <CategoryIcon category={category} />}
        {showName ? <Link to={`/budgets/category/${budget.categoryId}`} aria-label={t('row.details', { name })} className="inline-flex min-h-11 min-w-0 flex-1 items-center truncate rounded-sm text-base font-semibold text-ink hover:underline">{name}</Link> : <span className="flex-1" />}
        <Button size="icon" variant="ghost" onClick={() => onDelete(budget, name)} aria-label={`${t('actions.delete')}: ${name}`}><Trash2 className="h-5 w-5" aria-hidden /></Button>
      </div>
      <div className="grid grid-cols-1 gap-x-4 min-[420px]:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <p className="text-sm text-ink-2">{t('row.spent')}</p>
          <div className="flex min-h-11 items-center"><AmountText amount={budget.spent} size="lg" /></div>
        </div>
        <div className="min-w-0">
          <p className="text-sm text-ink-2">{t('row.limit')}</p>
          <LimitCell budget={budget} name={name} apiPeriod={apiPeriod} />
        </div>
      </div>
      <ProgressBar percent={budget.percentUsed} label={name} />
      <Remaining b={budget} />
      {budget.rolloverAmount > 0 && <p className="flex items-baseline gap-1.5 text-sm text-ink-2">{t('row.carried')}<AmountText amount={budget.rolloverAmount} size="sm" /></p>}
      <div className="mt-auto flex min-h-11 items-center justify-between gap-3 border-t border-line pt-2">
        <p className="min-w-0 flex-1 cursor-pointer py-2 text-sm text-ink-2" title={t('row.carryHint')} onClick={() => { if (!update.isPending) setCarry(!carry); }}>{t('row.carry')}</p>
        <Switch checked={carry} onChange={setCarry} label={`${t('row.carry')}: ${name}`} disabled={update.isPending} />
      </div>
    </Card>
  );
}
