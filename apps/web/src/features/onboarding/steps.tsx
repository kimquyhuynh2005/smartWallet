import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { budgetPeriod } from '@smartwallet/shared';
import { categoryName, useCategories } from '@/hooks/useCategories';
import { useLang } from '@/hooks/useLang';
import { formatDate, formatMoney } from '@/lib/format';
import { CUSTOM_DEFAULT, fitToPlan, groupsOf, planTemplate, type PlanGroupIn, type PlanRow, type TemplateKind } from '@/lib/templates';
import { cn } from '@/lib/utils';
import { AmountText, Alert, CategoryIcon, Field, Input, MoneyInput, Select } from '@/ui';
import type { Category } from '@/lib/api/endpoints';

export type WalletKind = 'CASH' | 'BANK' | 'EWALLET';
export type TemplateChoice = TemplateKind | 'NONE';
export interface WizardState {
  fullName: string; language: 'vi' | 'en';
  income: number | null; startDay: number;
  walletType: WalletKind; walletName: string; nameTouched: boolean; balance: number;
  template: TemplateChoice; custom: PlanGroupIn[]; edits: Record<string, number>;
}
export type Patch = (p: Partial<WizardState>) => void;
export const FREE_MAX_BUDGETS = 5; // a brand-new account is always on the Free plan

const radioItem = (on: boolean) => cn('flex min-h-11 items-center justify-center rounded-sm px-3 text-base font-medium transition-colors', on ? 'bg-surface text-ink shadow-[0_0_0_1px_rgb(var(--line))]' : 'text-ink-2 hover:text-ink');

function Segmented<T extends string>({ value, onChange, options, label, cols }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; cols?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('grid gap-1 rounded-md border border-line bg-sunken p-1', cols ?? 'grid-cols-2')}>
      {options.map((o) => <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)} className={radioItem(value === o.value)}>{o.label}</button>)}
    </div>
  );
}

export function StepName({ s, set, errors }: { s: WizardState; set: Patch; errors: Record<string, string> }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-5">
      <Field label={t('onb.a.fullName')} error={errors.fullName} required><Input autoFocus autoComplete="name" value={s.fullName} invalid={!!errors.fullName} onChange={(e) => set({ fullName: e.target.value })} /></Field>
      <Field label={t('onb.a.language')}><Segmented value={s.language} onChange={(v) => set({ language: v })} label={t('onb.a.language')} options={[{ value: 'vi', label: 'Tiếng Việt' }, { value: 'en', label: 'English' }]} /></Field>
    </div>
  );
}

export function StepIncome({ s, set, errors }: { s: WizardState; set: Patch; errors: Record<string, string> }) {
  const { t } = useTranslation();
  const lang = useLang();
  const { start, end } = budgetPeriod(new Date(), s.startDay);
  const last = new Date(end.getTime() - 86_400_000);
  return (
    <div className="flex flex-col gap-5">
      <Field label={t('onb.b.income')} hint={t('onb.b.incomeHint')} error={errors.income} required><MoneyInput autoFocus value={s.income} onChange={(v) => set({ income: v, edits: {} })} invalid={!!errors.income} /></Field>
      <Field label={t('onb.b.startDay')} hint={t('onb.b.startDayHint')}>
        <Select value={String(s.startDay)} onChange={(e) => set({ startDay: Number(e.target.value), edits: {} })} options={Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: t('onb.b.day', { day: i + 1 }) }))} />
      </Field>
      <p className="rounded-md bg-sunken px-4 py-3 text-sm text-ink-2" role="status">{t('onb.b.period', { from: formatDate(start, lang, 'long'), to: formatDate(last, lang, 'long') })}</p>
    </div>
  );
}

const QUICK: Record<WalletKind, string[]> = { CASH: [], BANK: ['Vietcombank', 'Techcombank', 'MB Bank', 'BIDV'], EWALLET: ['MoMo', 'ZaloPay', 'ShopeePay', 'VNPay'] };

export function StepWallet({ s, set, errors }: { s: WizardState; set: Patch; errors: Record<string, string> }) {
  const { t } = useTranslation();
  const kinds = (['CASH', 'BANK', 'EWALLET'] as const).map((k) => ({ value: k, label: t(`onb.c.types.${k}`) }));
  const defaultName = (k: WalletKind) => (k === 'EWALLET' ? 'MoMo' : t(`onb.c.types.${k}`));
  return (
    <div className="flex flex-col gap-5">
      <Field label={t('onb.c.type')}><Segmented cols="grid-cols-3" value={s.walletType} onChange={(k) => set({ walletType: k, ...(s.nameTouched ? {} : { walletName: defaultName(k) }) })} label={t('onb.c.type')} options={kinds} /></Field>
      <Field label={t('onb.c.walletName')} error={errors.walletName} required><Input value={s.walletName} invalid={!!errors.walletName} onChange={(e) => set({ walletName: e.target.value, nameTouched: true })} /></Field>
      {QUICK[s.walletType].length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink-2">{t('onb.c.quick')}</p>
          <ul className="flex flex-wrap gap-2">
            {QUICK[s.walletType].map((n) => (
              <li key={n}><button type="button" aria-pressed={s.walletName === n} onClick={() => set({ walletName: n, nameTouched: true })} className={cn('min-h-11 rounded-full border px-4 text-sm font-medium transition-colors', s.walletName === n ? 'border-accent bg-accent-soft text-ink' : 'border-line-strong text-ink-2 hover:bg-sunken')}>{n}</button></li>
            ))}
          </ul>
        </div>
      )}
      <Field label={t('onb.c.balance')} hint={t('onb.c.balanceHint')}><MoneyInput value={s.balance} onChange={(v) => set({ balance: v ?? 0 })} /></Field>
    </div>
  );
}

/** the plan shown in the preview: template maths -> user edits -> what the Free plan can hold */
export function usePlan(s: WizardState, cats: Category[]) {
  const income = s.income ?? 0;
  const groups = s.template === 'NONE' ? [] : groupsOf(s.template, s.custom);
  const plan = planTemplate(groups, income);
  const rows: PlanRow[] = plan.groups.flatMap((g) => g.rows).map((r) => ({ ...r, limit: s.edits[r.nameEn] ?? r.limit }));
  const { kept, cut } = fitToPlan(rows, FREE_MAX_BUDGETS);
  const idOf = new Map(cats.filter((c) => c.type === 'EXPENSE' && !c.parentId).map((c) => [c.nameEn, c]));
  const items = kept.filter((r) => idOf.has(r.nameEn)).map((r) => ({ ...r, category: idOf.get(r.nameEn)! }));
  const total = items.reduce((a, r) => a + r.limit, 0);
  const edited = Object.keys(s.edits).length > 0;
  return { plan, items, total, cut, edited, reserved: plan.reserved, kind: s.template };
}

export function StepBudget({ s, set, cats }: { s: WizardState; set: Patch; cats: Category[] }) {
  const { t } = useTranslation();
  const lang = useLang();
  const p = usePlan(s, cats);
  const opts: { value: TemplateChoice; title: string; desc: string }[] = [
    { value: '50_30_20', title: t('onb.d.t5030'), desc: t('onb.d.t5030d') },
    { value: '6_JARS', title: t('onb.d.t6jars'), desc: t('onb.d.t6jarsd') },
    { value: 'CUSTOM', title: t('onb.d.custom'), desc: t('onb.d.customd') },
    { value: 'NONE', title: t('onb.d.none'), desc: t('onb.d.noned') },
  ];
  const customTotal = s.custom.reduce((a, g) => a + g.percent, 0);
  const catOf = (n: string) => cats.find((c) => c.nameEn === n && !c.parentId);
  const groupLabel = (k: string) => t(`onb.d.groups.${k}`);
  return (
    <div className="flex flex-col gap-6">
      <div role="radiogroup" aria-label={t('onb.d.choose')} className="flex flex-col gap-2">
        {opts.map((o) => {
          const on = s.template === o.value;
          return (
            <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => set({ template: o.value, edits: {} })} className={cn('flex min-h-14 items-start gap-3 rounded-md border p-3 text-left transition-colors', on ? 'border-accent bg-accent-soft' : 'border-line-strong hover:bg-sunken')}>
              <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', on ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong')} aria-hidden>{on && <Check className="h-3.5 w-3.5" />}</span>
              <span><span className="block text-base font-medium text-ink">{o.title}</span><span className="block text-sm text-ink-2">{o.desc}</span></span>
            </button>
          );
        })}
      </div>

      {s.template === 'CUSTOM' && (
        <div className="flex flex-col gap-3 rounded-md border border-line p-4">
          <p className="eyebrow">{t('onb.d.percent')}</p>
          {s.custom.map((g, i) => (
            <div key={g.key} className="flex items-center justify-between gap-3">
              <label htmlFor={`pct-${g.key}`} className="text-base text-ink">{groupLabel(g.key)}</label>
              <div className="flex items-center gap-2">
                <input id={`pct-${g.key}`} inputMode="numeric" className="num h-11 w-20 rounded-md border border-line-strong bg-surface px-3 text-right text-base text-ink focus-visible:outline-none" value={g.percent}
                  onChange={(e) => { const v = Math.min(100, Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0)); set({ custom: s.custom.map((x, j) => (j === i ? { ...x, percent: v } : x)), edits: {} }); }} />
                <span className="text-ink-2" aria-hidden>%</span>
              </div>
            </div>
          ))}
          <p className={cn('num text-sm font-medium', customTotal === 100 ? 'text-accent' : 'text-danger')} role="status">
            {customTotal === 100 ? <Check className="mr-1 inline h-4 w-4" aria-hidden /> : null}{t('onb.d.percentTotal', { total: customTotal })}{customTotal !== 100 && ` — ${t('onb.d.percentMustBe100')}`}
          </p>
        </div>
      )}

      {s.template !== 'NONE' && (s.template !== 'CUSTOM' || customTotal === 100) && (s.income ?? 0) > 0 && (
        <section aria-label={t('onb.d.previewTitle', { income: formatMoney(s.income ?? 0, lang) })} className="flex flex-col gap-4">
          <h3 className="text-base font-semibold text-ink">{t('onb.d.previewTitle', { income: formatMoney(s.income ?? 0, lang) })}</h3>
          {p.plan.groups.map((g) => (
            <div key={g.key} className="flex flex-col">
              <div className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5">
                <p className="text-sm font-semibold text-ink">{groupLabel(g.key)} <span className="num font-normal text-ink-2">· {g.percent}%</span></p>
                <p className="num text-sm text-ink-2">{formatMoney(g.amount, lang)}</p>
              </div>
              {g.rows.length === 0 ? <p className="py-2 text-sm text-ink-2">{t('onb.d.reserved')}</p> : (
                <ul className="divide-y divide-line">
                  {g.rows.map((r) => {
                    const kept = p.items.find((i) => i.nameEn === r.nameEn);
                    const cat = catOf(r.nameEn);
                    return (
                      <li key={r.nameEn} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
                        <span className="flex min-w-[9rem] flex-1 items-center gap-3">
                          <CategoryIcon category={cat ?? { nameEn: r.nameEn, nameVi: r.nameEn }} size="sm" />
                          <span className={cn('min-w-0 flex-1 truncate text-base', kept ? 'text-ink' : 'text-ink-3')}>{categoryName(cat, lang, r.nameEn)}</span>
                        </span>
                        {kept ? (
                          <div className="w-full shrink-0 sm:w-48">
                            <MoneyInput aria-label={`${t('onb.d.adjust')}: ${categoryName(cat, lang, r.nameEn)}`} value={s.edits[r.nameEn] ?? r.limit} onChange={(v) => set({ edits: { ...s.edits, [r.nameEn]: v ?? 0 } })} className="!h-10 !text-base" />
                          </div>
                        ) : <span className="text-sm text-ink-3">{t('onb.d.notKept')}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-3 rounded-md bg-sunken px-4 py-3">
            <span className="text-sm font-medium text-ink">{t('onb.d.total')}</span>
            <AmountText amount={p.total} size="md" />
          </div>
          <p className="text-sm text-ink-2">{t('onb.d.evenNote')}</p>
          {p.cut > 0 && <Alert tone="info">{t('onb.d.planCut', { max: FREE_MAX_BUDGETS })}</Alert>}
        </section>
      )}
    </div>
  );
}

export const initialCustom = () => CUSTOM_DEFAULT.map((g) => ({ ...g, categories: [...g.categories] }));
