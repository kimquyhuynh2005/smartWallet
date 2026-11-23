import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { describeError, isPlanLimit, useCreateBudget, useDeleteBudget, useRollover, type Budget } from '@/api';
import { categoryName, useCategories } from '@/hooks/useCategories';
import { useLang } from '@/hooks/useLang';
import { toast } from '@/stores/ui';
import { Alert, AmountText, Button, Field, MoneyInput, ResponsiveDialog, Select } from '@/ui';

/** add a category budget (or the total budget when none exists yet): only expense categories without a budget are offered */
export function AddBudgetDialog({ open, onClose, apiPeriod, budgets, forTotal, presetCategoryId }: { presetCategoryId?: string; open: boolean; onClose: () => void; apiPeriod: string | undefined; budgets: Budget[]; forTotal?: boolean }) {
  const { t } = useTranslation('budgets');
  const { t: tc } = useTranslation();
  const lang = useLang();
  const cats = useCategories();
  const create = useCreateBudget();
  const [categoryId, setCategoryId] = useState('');
  const [limit, setLimit] = useState<number | null>(null);
  const [errors, setErrors] = useState<{ cat?: string; amount?: string }>({});
  useEffect(() => { if (open) { setCategoryId(presetCategoryId ?? ''); setLimit(null); setErrors({}); create.reset(); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const free = useMemo(() => {
    const used = new Set(budgets.map((b) => b.categoryId));
    return (cats.data ?? []).filter((c) => c.type === 'EXPENSE' && !used.has(c.id)).sort((a, b) => categoryName(a, lang).localeCompare(categoryName(b, lang), lang));
  }, [cats.data, budgets, lang]);

  const submit = () => {
    const e: typeof errors = {};
    if (!forTotal && !categoryId) e.cat = t('add.required');
    if (!limit || limit <= 0) e.amount = t('add.amountRequired');
    setErrors(e);
    if (e.cat || e.amount) return;
    create.mutate({ categoryId: forTotal ? null : categoryId, limitAmount: limit!, ...(apiPeriod ? { period: apiPeriod } : {}) }, {
      onSuccess: () => { toast.success(t('toast.added')); onClose(); },
      onError: (e) => { if (isPlanLimit(e)) onClose(); },
    });
  };

  return (
    <ResponsiveDialog
      open={open} onOpenChange={(o) => !o && onClose()} title={forTotal ? t('total.set') : t('add.title')} description={forTotal ? t('total.noneHint') : t('add.desc')}
      footer={<><Button size="lg" type="submit" form="add-budget-form" loading={create.isPending} disabled={!forTotal && !free.length}>{t('add.submit')}</Button><Button size="lg" variant="ghost" onClick={onClose}>{tc('common.cancel')}</Button></>}
    >
      <form id="add-budget-form" className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        {!forTotal && (free.length ? (
          <Field label={t('add.category')} error={errors.cat} required>
            <Select autoFocus value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setErrors((x) => ({ ...x, cat: undefined })); }} placeholder={t('add.pick')} options={free.map((c) => ({ value: c.id, label: categoryName(c, lang) }))} />
          </Field>
        ) : <Alert tone="info">{t('add.allUsed')}</Alert>)}
        <Field label={forTotal ? t('add.total') : t('add.limit')} error={errors.amount} required>
          <MoneyInput autoFocus={forTotal} value={limit} onChange={(v) => { setLimit(v); setErrors((x) => ({ ...x, amount: undefined })); }} />
        </Field>
        {create.error && !isPlanLimit(create.error) && <Alert tone="danger">{describeError(create.error, tc)}</Alert>}
      </form>
    </ResponsiveDialog>
  );
}

export function DeleteBudgetDialog({ target, onClose }: { target: { budget: Budget; name: string } | null; onClose: () => void }) {
  const { t } = useTranslation('budgets');
  const { t: tc } = useTranslation();
  const del = useDeleteBudget();
  const run = () => target && del.mutate(target.budget.id, {
    onSuccess: () => { toast.success(t('toast.deleted')); onClose(); },
    onError: (e) => toast.error(describeError(e, tc)),
  });
  return (
    <ResponsiveDialog
      open={!!target} onOpenChange={(o) => !o && onClose()} title={t('delete.title')} description={t('delete.body')}
      footer={<><Button size="lg" variant="destructive" loading={del.isPending} onClick={run}>{t('delete.confirm')}</Button><Button size="lg" variant="ghost" onClick={onClose}>{tc('common.cancel')}</Button></>}
    >
      {target && <p className="text-base font-medium text-ink">{t('delete.name', { name: target.name })}</p>}
    </ResponsiveDialog>
  );
}

/** BUD-03: carry what was not spent last period into this one. Only budgets with carry-over turned on take part. */
export function RolloverDialog({ open, onClose, apiPeriod, rangeText }: { open: boolean; onClose: () => void; apiPeriod: string | undefined; rangeText: string }) {
  const { t } = useTranslation('budgets');
  const { t: tc } = useTranslation();
  const roll = useRollover();
  useEffect(() => { if (open) roll.reset(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const r = roll.data;
  return (
    <ResponsiveDialog
      open={open} onOpenChange={(o) => !o && onClose()} title={t('rollover.title')} description={t('periodRange', { range: rangeText })}
      footer={r
        ? <Button size="lg" onClick={onClose}>{t('rollover.close')}</Button>
        : <><Button size="lg" loading={roll.isPending} onClick={() => roll.mutate(apiPeriod)}>{t('rollover.run')}</Button><Button size="lg" variant="ghost" onClick={onClose}>{tc('common.cancel')}</Button></>}
    >
      {!r && (
        <div className="flex flex-col gap-3 text-sm text-ink-2">
          <p className="text-base text-ink">{t('rollover.intro')}</p>
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>{t('rollover.rule1')}</li><li>{t('rollover.rule2')}</li><li>{t('rollover.rule3')}</li>
          </ul>
        </div>
      )}
      {r && (
        <div className="flex flex-col gap-3" role="status">
          <Alert tone="success">{t('rollover.done')}</Alert>
          <div><p className="text-sm text-ink-2">{t('rollover.carried')}</p><AmountText amount={r.carriedOver} size="xl" /></div>
          <p className="text-sm text-ink-2">{[t('rollover.created', { n: r.created }), t('rollover.updated', { n: r.updated }), t('rollover.skipped', { n: r.skipped }), r.skippedForPlanLimit ? t('rollover.planCut', { n: r.skippedForPlanLimit }) : null].filter(Boolean).join(' · ')}</p>
          {r.carriedOver === 0 && <p className="text-sm text-ink-2">{t('rollover.noneCarried')}</p>}
        </div>
      )}
      {roll.error && <Alert tone={isPlanLimit(roll.error) ? 'warning' : 'danger'}>{describeError(roll.error, tc)}</Alert>}
    </ResponsiveDialog>
  );
}
