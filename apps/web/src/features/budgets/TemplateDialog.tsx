import { CircleAlert, CircleCheck, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { describeError, isPlanLimit, useApplyTemplate, usePlan, type Category } from '@/api';
import { categoryName, useCategories } from '@/hooks/useCategories';
import { useLang } from '@/hooks/useLang';
import { fitToPlan, groupsOf, planTemplate, type PlanGroupIn, type TemplateKind } from '@/lib/templates';
import { cn } from '@/lib/utils';
import { Alert, AmountText, Button, CategoryIcon, Field, Input, MoneyInput, ResponsiveDialog } from '@/ui';

interface CustomGroup { id: number; name: string; percent: number; categoryIds: string[] }
const KINDS: TemplateKind[] = ['50_30_20', '6_JARS', 'CUSTOM'];
let seq = 0;

export function TemplateDialog({ open, onClose, apiPeriod }: { open: boolean; onClose: () => void; apiPeriod: string | undefined }) {
  const { t } = useTranslation('budgets');
  const { t: tc } = useTranslation();
  const lang = useLang();
  const cats = useCategories();
  const plan = usePlan();
  const apply = useApplyTemplate();
  const [step, setStep] = useState<'setup' | 'preview'>('setup');
  const [kind, setKind] = useState<TemplateKind>('50_30_20');
  const [income, setIncome] = useState<number | null>(null);
  const [incomeError, setIncomeError] = useState(false);
  const [custom, setCustom] = useState<CustomGroup[] | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  useEffect(() => { if (open) { setStep('setup'); setIncome(null); setIncomeError(false); setOverwrite(false); apply.reset(); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const expense = useMemo(() => (cats.data ?? []).filter((c) => c.type === 'EXPENSE'), [cats.data]);
  const idOf = (nameEn: string) => expense.find((c) => c.isSystem && c.nameEn === nameEn)?.id;
  const groupLabel = (key: string) => (kind === 'CUSTOM' ? key : t(`template.groups.${key}`, { defaultValue: key }));

  const pickKind = (k: TemplateKind) => {
    setKind(k);
    if (k === 'CUSTOM' && !custom) {
      setCustom(groupsOf('CUSTOM').map((g) => ({ id: ++seq, name: t(`template.groups.${g.key}`), percent: g.percent, categoryIds: g.categories.map(idOf).filter((x): x is string => !!x) })));
    }
  };

  const groups: PlanGroupIn[] = useMemo(() => (kind === 'CUSTOM'
    ? (custom ?? []).map((g) => ({ key: g.name.trim() || '-', percent: g.percent, categories: g.categoryIds }))
    : groupsOf(kind).map((g) => ({ ...g, categories: g.categories.map(idOf).filter((x): x is string => !!x) }))), [kind, custom, expense]); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = useMemo(() => planTemplate(groups, income ?? 0), [groups, income]);
  const totalPercent = kind === 'CUSTOM' ? (custom ?? []).reduce((a, g) => a + (Number.isFinite(g.percent) ? g.percent : 0), 0) : 100;
  const customValid = kind !== 'CUSTOM' || (!!custom?.length && totalPercent === 100 && custom.every((g) => g.name.trim() && g.percent >= 1 && g.percent <= 100));
  const maxBudgets = plan.data?.limits.max_budgets ?? null;
  const rows = preview.groups.flatMap((g) => g.rows);
  const cut = fitToPlan(rows, maxBudgets).cut;

  const next = () => {
    if (!income || income <= 0) { setIncomeError(true); return; }
    if (!customValid) { document.getElementById('custom-total')?.scrollIntoView({ block: 'center' }); return; }
    setStep('preview');
  };
  const run = () => apply.mutate({
    template: kind, monthlyIncome: income!, overwrite, ...(apiPeriod ? { period: apiPeriod } : {}),
    ...(kind === 'CUSTOM' ? { groups: (custom ?? []).map((g) => ({ name: g.name.trim(), percent: g.percent, categoryIds: g.categoryIds })) } : {}),
  });

  const r = apply.data;
  const title = r ? t('template.done.title') : t('template.title');
  return (
    <ResponsiveDialog
      open={open} onOpenChange={(o) => !o && onClose()} title={title} description={r ? undefined : t('template.desc')} className="md:max-w-2xl"
      footer={r ? <Button size="lg" onClick={onClose}>{t('template.done.close')}</Button>
        : step === 'setup' ? <><Button size="lg" onClick={next} disabled={!customValid} aria-describedby={kind === 'CUSTOM' ? 'custom-total' : undefined}>{t('template.next')}</Button><Button size="lg" variant="ghost" onClick={onClose}>{tc('common.cancel')}</Button></>
        : <><Button size="lg" loading={apply.isPending} onClick={run}>{t('template.apply')}</Button><Button size="lg" variant="ghost" onClick={() => setStep('setup')}>{t('template.back')}</Button></>}
    >
      {r ? (
        <div className="flex flex-col gap-3" role="status">
          <Alert tone="success">{t('template.done.title')}</Alert>
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 min-[400px]:grid-cols-2">
            <div><p className="text-sm text-ink-2">{t('template.preview.total')}</p><AmountText amount={r.totalBudget} size="lg" /></div>
            <div><p className="text-sm text-ink-2">{t('template.preview.savings')}</p><AmountText amount={r.reservedForSavings} size="lg" /></div>
          </div>
          <ul className="flex flex-col gap-1 text-sm text-ink-2">
            <li>{t('template.done.created', { n: r.created })}</li>
            <li>{t('template.done.updated', { n: r.updated })}</li>
            <li>{t('template.done.skipped', { n: r.skipped })}</li>
            {r.truncatedByPlan > 0 && <li className="font-medium text-warn">{t('template.done.cut', { n: r.truncatedByPlan })}</li>}
          </ul>
        </div>
      ) : step === 'setup' ? (
        <div className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">{t('template.title')}</legend>
            <div role="radiogroup" aria-label={t('template.title')} className="grid gap-2 sm:grid-cols-3">
              {KINDS.map((k) => (
                <button
                  key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => pickKind(k)}
                  className={cn('min-h-11 rounded-md border px-3 py-2 text-left text-base font-medium transition-colors', kind === k ? 'border-accent bg-accent-soft text-accent' : 'border-line-strong text-ink hover:bg-sunken')}
                >
                  {t(`template.kind.${k}`)}
                </button>
              ))}
            </div>
            <p className="text-sm text-ink-2">{t(`template.kindHint.${kind}`)}</p>
          </fieldset>
          <Field label={t('template.income')} hint={t('template.incomeHint')} error={incomeError && !income ? t('template.incomeRequired') : undefined} required>
            <MoneyInput autoFocus value={income} onChange={(v) => { setIncome(v); setIncomeError(false); }} />
          </Field>
          {kind === 'CUSTOM' && custom && <CustomEditor groups={custom} setGroups={setCustom} expense={expense} total={totalPercent} />}
          {kind !== 'CUSTOM' && (
            <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
              {preview.groups.map((g) => (
                <li key={g.key} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <span className="text-ink">{groupLabel(g.key)}</span><span className="num font-medium text-ink-2">{g.percent}%</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 min-[400px]:grid-cols-2">
            <div><p className="text-sm text-ink-2">{t('template.preview.total')}</p><AmountText amount={preview.total} size="xl" /></div>
            <div><p className="text-sm text-ink-2">{t('template.preview.reserved')}</p><AmountText amount={preview.reserved} size="xl" /><p className="text-xs text-ink-2">{t('template.preview.reservedHint')}</p></div>
          </div>
          {!rows.length && <Alert tone="warning">{t('template.preview.empty')}</Alert>}
          <div className="flex flex-col gap-4">
            {preview.groups.filter((g) => g.rows.length).map((g) => (
              <section key={`${g.key}-${g.percent}-${g.amount}`} aria-label={groupLabel(g.key)}>
                <h3 className="mb-1 text-sm font-semibold text-ink">{t('template.preview.group', { name: groupLabel(g.key), percent: g.percent })} · <AmountText amount={g.amount} size="sm" /></h3>
                <ul className="divide-y divide-line rounded-md border border-line">
                  {g.rows.map((row) => {
                    const c = cats.map.get(row.nameEn);
                    return (
                      <li key={row.nameEn} className="flex items-center gap-3 px-3 py-2">
                        <CategoryIcon category={c} />
                        <span className="min-w-0 flex-1 truncate text-base text-ink">{categoryName(c, lang)}</span>
                        <AmountText amount={row.limit} />
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
          <p className="text-sm text-ink-2">{t('template.preview.approx')}</p>
          {maxBudgets !== null && cut > 0 && <Alert tone="warning">{t('template.preview.planCut', { max: maxBudgets })}</Alert>}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-ink">{t('template.overwrite.legend')}</legend>
            {([false, true] as const).map((v) => (
              <label key={String(v)} className={cn('flex min-h-11 cursor-pointer items-start gap-3 rounded-md border p-3', overwrite === v ? 'border-accent bg-accent-soft' : 'border-line-strong hover:bg-sunken')}>
                <input type="radio" name="overwrite" className="mt-1 h-4 w-4 accent-[rgb(var(--accent))]" checked={overwrite === v} onChange={() => setOverwrite(v)} />
                <span className="min-w-0">
                  <span className="block text-base font-medium text-ink">{v ? t('template.overwrite.replace') : t('template.overwrite.keep')}</span>
                  <span className="block text-sm text-ink-2">{v ? t('template.overwrite.replaceHint') : t('template.overwrite.keepHint')}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </div>
      )}
      {apply.error && <Alert tone={isPlanLimit(apply.error) ? 'warning' : 'danger'}>{describeError(apply.error, tc)}</Alert>}
    </ResponsiveDialog>
  );
}

function CustomEditor({ groups, setGroups, expense, total }: { groups: CustomGroup[]; setGroups: (g: CustomGroup[]) => void; expense: Category[]; total: number }) {
  const { t } = useTranslation('budgets');
  const lang = useLang();
  const tops = expense.filter((c) => !c.parentId);
  const patch = (id: number, p: Partial<CustomGroup>) => setGroups(groups.map((g) => (g.id === id ? { ...g, ...p } : g)));
  const toggle = (g: CustomGroup, cid: string) => {
    const has = g.categoryIds.includes(cid);
    // a category lives in one group only
    setGroups(groups.map((x) => (x.id === g.id ? { ...x, categoryIds: has ? x.categoryIds.filter((i) => i !== cid) : [...x.categoryIds, cid] } : { ...x, categoryIds: x.categoryIds.filter((i) => i !== cid) })));
  };
  const diff = 100 - total;
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g.id} className="flex flex-col gap-3 rounded-md border border-line p-3">
          <div className="grid grid-cols-[1fr_6.5rem_auto] items-end gap-2">
            <Field label={t('template.custom.groupName')}><Input value={g.name} maxLength={40} onChange={(e) => patch(g.id, { name: e.target.value })} /></Field>
            <Field label={t('template.custom.percent')}><Input type="number" inputMode="numeric" min={1} max={100} step={1} value={Number.isFinite(g.percent) ? g.percent : ''} onChange={(e) => patch(g.id, { percent: e.target.value === '' ? NaN : Math.round(Number(e.target.value)) })} className="num text-right" /></Field>
            <Button size="icon" variant="ghost" disabled={groups.length <= 1} onClick={() => setGroups(groups.filter((x) => x.id !== g.id))} aria-label={t('template.custom.removeGroup', { name: g.name })}><Trash2 className="h-5 w-5" aria-hidden /></Button>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">{t('template.custom.categories')}</p>
            <div className="flex flex-wrap gap-2">
              {tops.map((c) => (
                <button
                  key={c.id} type="button" aria-pressed={g.categoryIds.includes(c.id)} onClick={() => toggle(g, c.id)}
                  className={cn('min-h-9 rounded-full border px-3 text-sm transition-colors', g.categoryIds.includes(c.id) ? 'border-accent bg-accent-soft text-accent' : 'border-line-strong text-ink-2 hover:bg-sunken')}
                >
                  {categoryName(c, lang)}
                </button>
              ))}
            </div>
            {!g.categoryIds.length && <p className="mt-1.5 text-sm text-ink-2">{t('template.custom.noCategories')}</p>}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" onClick={() => setGroups([...groups, { id: ++seq, name: t('template.custom.newName', { n: groups.length + 1 }), percent: Math.max(1, diff), categoryIds: [] }])} disabled={groups.length >= 12}><Plus className="h-4 w-4" aria-hidden />{t('template.custom.addGroup')}</Button>
        <p id="custom-total" role="status" className={cn('num sticky bottom-0 flex items-center gap-1.5 bg-surface py-2 text-sm font-medium', diff === 0 ? 'text-accent' : 'text-danger')}>
          {diff === 0 ? <CircleCheck className="h-4 w-4" aria-hidden /> : <CircleAlert className="h-4 w-4" aria-hidden />}
          <span>{t('template.custom.total', { total })}</span>
          <span>{diff === 0 ? t('template.custom.ok') : diff > 0 ? t('template.custom.short', { n: diff }) : t('template.custom.extra', { n: -diff })}</span>
        </p>
      </div>
    </div>
  );
}
