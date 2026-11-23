import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, PartyPopper } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMe } from '@/app/auth';
import { Logo } from '@/app/layouts/Logo';
import { StepBudget, StepIncome, StepName, StepWallet, initialCustom, usePlan, type Patch, type WizardState } from '@/features/onboarding/steps';
import { useCategories } from '@/hooks/useCategories';
import { endpoints } from '@/lib/api/endpoints';
import { describeError, isApiError } from '@/lib/api/errors';
import { qk } from '@/lib/queryKeys';
import { cn } from '@/lib/utils';
import { useUi } from '@/stores/ui';
import { Alert, Button, Card, LanguageToggle, Skeleton, ThemeToggle } from '@/ui';

const STEPS = ['a', 'b', 'c', 'd'] as const;
type Step = 0 | 1 | 2 | 3 | 4; // 4 = done

/**
 * USER-02. Nothing is written until the last step: profile -> wallet (+ template budgets) in order, each part remembered so a retry only redoes what failed.
 * `me` is refetched only when the user leaves the wizard, otherwise the "onboarded" guard would pull them off the finish screen.
 */
export default function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const language = useUi((u) => u.language);
  const setLanguage = useUi((u) => u.setLanguage);
  const cats = useCategories();
  const [step, setStep] = useState<Step>(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [s, setS] = useState<WizardState | null>(null);
  const [summary, setSummary] = useState<{ wallet: string; budgets: number } | null>(null);
  const alreadyOnboarded = useRef<boolean | null>(null);
  const done = useRef({ profile: false, wallet: false, budgets: new Set<string>() });
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (me.data && alreadyOnboarded.current === null) {
      alreadyOnboarded.current = me.data.onboarded;
      setS({
        fullName: me.data.fullName, language, income: null, startDay: me.data.monthStartDay ?? 1,
        walletType: 'CASH', walletName: language === 'en' ? 'Cash' : 'Tiền mặt', nameTouched: false, balance: 0,
        template: '50_30_20', custom: initialCustom(), edits: {},
      });
    }
  }, [me.data, language]);
  useEffect(() => { headingRef.current?.focus(); }, [step]);

  const set: Patch = (p) => {
    setS((cur) => (cur ? { ...cur, ...p } : cur));
    if (p.language) setLanguage(p.language); // the wizard itself switches language as soon as it is chosen
    setErrors({});
  };

  const plan = usePlan(s ?? ({ template: 'NONE', custom: [], edits: {}, income: 0 } as unknown as WizardState), cats.data ?? []);
  const customTotal = s?.custom.reduce((a, g) => a + g.percent, 0) ?? 100;

  const finish = useMutation({
    mutationFn: async (st: WizardState) => {
      const d = done.current;
      if (!d.profile) {
        await endpoints.me.update({ fullName: st.fullName.trim(), locale: st.language, monthStartDay: st.startDay });
        d.profile = true;
      }
      // a standard template with no edits is created by the API in the same DB transaction as the wallet; anything else is created row by row
      const direct = (st.template === '50_30_20' || st.template === '6_JARS') && !plan.edited ? st.template : null; // the API applies the same Free-plan cut itself
      if (!d.wallet) {
        try {
          await endpoints.me.onboarding({ monthlyIncome: st.income!, wallet: { name: st.walletName.trim(), type: st.walletType, openingBalance: st.balance }, template: direct ?? 'NONE' });
        } catch (e) { if (!(isApiError(e) && e.code === 'ONBOARDING_DONE')) throw e; }
        d.wallet = true;
        if (direct) d.budgets.add('__direct__');
      }
      let count = d.budgets.has('__direct__') ? plan.items.length + 1 : 0;
      if (!d.budgets.has('__direct__') && st.template !== 'NONE') {
        const rows = [{ key: '__total__', categoryId: null as string | null, limit: plan.total }, ...plan.items.map((i) => ({ key: i.nameEn, categoryId: i.category.id as string | null, limit: i.limit }))].filter((r) => r.limit > 0);
        for (const r of rows) {
          if (!d.budgets.has(r.key)) { await endpoints.budgets.create({ categoryId: r.categoryId, limitAmount: r.limit }); d.budgets.add(r.key); }
        }
        count = rows.length;
      }
      return { wallet: st.walletName.trim(), budgets: count };
    },
    onSuccess: (r) => { setSummary(r); setStep(4); },
    meta: { silent: true },
  });

  function validate(): boolean {
    if (!s) return false;
    const e: Record<string, string> = {};
    if (step === 0 && !s.fullName.trim()) e.fullName = t('authx.nameRequired');
    if (step === 1 && !(s.income && s.income > 0)) e.income = t('onb.b.incomeRequired');
    if (step === 2 && !s.walletName.trim()) e.walletName = t('onb.c.nameRequired');
    if (step === 3 && s.template === 'CUSTOM' && customTotal !== 100) e.percent = t('onb.d.percentMustBe100');
    setErrors(e);
    return Object.keys(e).length === 0;
  }
  const next = () => { if (!validate() || !s) return; if (step === 3) finish.mutate(s); else setStep((step + 1) as Step); };
  const skip = () => { if (!s) return; if (step === 3) { const n = { ...s, template: 'NONE' as const }; setS(n); finish.mutate(n); } else setStep((step + 1) as Step); };
  const leave = () => {
    qc.setQueryData(qk.me, (m: typeof me.data) => (m ? { ...m, onboarded: true } : m)); // the guard must see the new state at once, not after a refetch
    void qc.invalidateQueries({ queryKey: qk.me }); void qc.invalidateQueries({ queryKey: qk.wallets.all }); navigate('/dashboard', { replace: true }); };

  if (me.isLoading || !s) return <Shell><Skeleton className="h-72" /></Shell>;
  if (alreadyOnboarded.current) return <Navigate to="/dashboard" replace />;

  if (step === 4 && summary) return (
    <Shell>
      <Card className="flex flex-col gap-5 p-6 md:p-8">
        <PartyPopper className="h-9 w-9 text-accent" aria-hidden />
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold text-ink outline-none md:text-3xl">{t('onb.done.title')}</h1>
        <ul className="flex flex-col gap-1.5 text-base text-ink">
          <li>{t('onb.done.wallet', { name: summary.wallet })}</li>
          <li>{summary.budgets > 0 ? t('onb.done.budgets', { count: summary.budgets }) : t('onb.done.noBudgets')}</li>
        </ul>
        <p className="rounded-md bg-sunken px-4 py-3 text-sm text-ink-2"><span className="lg:hidden">{t('onb.done.tip')}</span><span className="hidden lg:inline">{t('onb.done.tipDesktop')}</span></p>
        <Button size="lg" className="self-start" onClick={leave}>{t('onb.done.go')}<ArrowRight className="h-4 w-4" aria-hidden /></Button>
      </Card>
    </Shell>
  );

  const key = STEPS[Math.min(step, 3)];
  const skippable = step === 0 || step === 3;
  const nextLabel = step === 3 ? t('onb.finish') : t('onb.next');
  return (
    <Shell>
      <nav aria-label={t('onb.progress')} className="mb-6">
        <p className="mb-2 text-sm text-ink-2"><span className="num font-medium text-ink">{t('onb.step', { current: step + 1, total: STEPS.length })}</span> · {t(`onb.${key}.name`)}</p>
        <ol className="grid grid-cols-4 gap-1.5">
          {STEPS.map((k, i) => (
            <li key={k} aria-current={i === step ? 'step' : undefined} className="flex flex-col gap-1.5">
              <span className={cn('h-1.5 rounded-full', i <= step ? 'bg-accent' : 'bg-sunken ring-1 ring-inset ring-line')} />
              <span className={cn('hidden text-xs sm:block', i === step ? 'font-medium text-ink' : 'text-ink-3')}>{t(`onb.${k}.name`)}</span>
            </li>
          ))}
        </ol>
      </nav>

      <Card className="flex flex-col gap-6 p-5 md:p-8">
        <div>
          <h1 ref={headingRef} tabIndex={-1} className="text-xl font-semibold text-ink outline-none md:text-2xl">{t(`onb.${key}.title`)}</h1>
          <p className="mt-1 text-sm text-ink-2 md:text-base">{t(`onb.${key}.sub`)}</p>
        </div>
        {finish.error && <Alert tone="danger">{step === 3 ? t('onb.d.saveError') : t('onb.error')} {describeError(finish.error, t)}</Alert>}
        {step === 0 && <StepName s={s} set={set} errors={errors} />}
        {step === 1 && <StepIncome s={s} set={set} errors={errors} />}
        {step === 2 && <StepWallet s={s} set={set} errors={errors} />}
        {step === 3 && <StepBudget s={s} set={set} cats={cats.data ?? []} />}
        {errors.percent && <Alert tone="danger">{errors.percent}</Alert>}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          {step > 0 && <Button variant="ghost" onClick={() => { setErrors({}); setStep((step - 1) as Step); }} disabled={finish.isPending}><ArrowLeft className="h-4 w-4" aria-hidden />{t('onb.back')}</Button>}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {skippable && <Button variant="ghost" onClick={skip} disabled={finish.isPending}>{t('onb.skip')}</Button>}
            <Button size="lg" onClick={next} loading={finish.isPending}>{nextLabel}{step < 3 && <ArrowRight className="h-4 w-4" aria-hidden />}</Button>
          </div>
        </div>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-page items-center justify-between gap-3 px-4 py-4 md:px-6 lg:px-8">
        <Logo to="/onboarding" />
        <div className="flex items-center gap-2"><ThemeToggle compact /><LanguageToggle compact /></div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-12 pt-2 md:px-6" aria-label={t('onb.title')}>{children}</main>
    </div>
  );
}
