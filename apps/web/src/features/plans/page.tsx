import { Check, Gem, Minus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMe } from '@/app/auth';
import { isApiError, useCancelSubscription, useMockCheckout, usePlan } from '@/api';
import { PageHeader } from '@/features/common/parts';
import { useLang } from '@/hooks/useLang';
import { formatDate, formatMoney } from '@/lib/format';
import { toast } from '@/stores/ui';
import { Alert, Badge, Button, Card, ResponsiveDialog, Skeleton } from '@/ui';
import { FREE_LIMITS, PREMIUM_LIMITS, PREMIUM_PRICE_VND, USAGE_KEY, type Limits } from './constants';

/** Pricing and plan management (SUB-01): current plan + usage, Free vs Premium, mock checkout, cancel. */
export default function PlansPage() {
  const { t } = useTranslation('plans');
  const { t: tc } = useTranslation();
  const lang = useLang();
  const me = useMe();
  const planQ = usePlan();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  // GET /subscriptions/me is mocked-only: when it is missing fall back to the profile plan and the static limits, quietly
  const plan = planQ.data?.plan ?? me.data?.plan ?? null;
  const premium = plan === 'PREMIUM';
  const limits: Limits = planQ.data?.limits ?? (premium ? PREMIUM_LIMITS : FREE_LIMITS);
  const usage = planQ.data?.usage;
  const loading = planQ.isPending && me.isPending;
  const usageMissing = planQ.isError && !(isApiError(planQ.error) && planQ.error.status === 404);
  const price = formatMoney(PREMIUM_PRICE_VND, lang);

  const limitText = (n: number | null, unit?: 'months') => (n === null ? t('page.unlimited') : unit ? t('page.months', { n }) : String(n));

  return (
    <>
      <PageHeader title={t('page.title')} subtitle={t('page.subtitle')} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-ink">{t('page.currentTitle')}</h2>
            {loading ? <Skeleton className="h-6 w-20" /> : <Badge tone={premium ? 'accent' : 'neutral'} icon={premium ? <Gem /> : undefined}>{premium ? t('premium') : t('free')}</Badge>}
          </div>
          {loading ? (
            <div className="flex flex-col gap-3" role="status" aria-label={tc('common.loading')}><Skeleton className="h-5 w-2/3" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : (
            <>
              <p className="text-sm text-ink-2">
                {premium ? t('page.premiumNow') : t('page.freeNow')}
                {premium && planQ.data?.currentPeriodEnd ? ` ${t('page.premiumUntil', { date: formatDate(planQ.data.currentPeriodEnd, lang, 'short') })}` : ''}
              </p>
              <h3 className="text-sm font-medium text-ink">{t('page.usageTitle')}</h3>
              <ul className="flex flex-col gap-4">
                {(['max_wallets', 'max_budgets', 'max_goals'] as const).map((k) => {
                  const label = t(`page.${USAGE_KEY[k]}`);
                  const used = usage?.[USAGE_KEY[k]];
                  const lim = limits[k];
                  return (
                    <li key={k} className="flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-ink">{label}</span>
                        <span className="num whitespace-nowrap text-right font-medium text-ink">
                          {used !== undefined && lim !== null ? t('page.usageOf', { used, limit: lim }) : used !== undefined ? <>{used} <span className="font-normal text-ink-2">({t('page.unlimited')})</span></> : <span className="text-ink-2">{limitText(lim)}</span>}
                        </span>
                      </div>
                      {used !== undefined && lim !== null && <UsageBar used={used} limit={lim} label={label} />}
                    </li>
                  );
                })}
                <li className="flex items-baseline justify-between gap-3 text-sm"><span className="text-ink">{t('page.history')}</span><span className="num font-medium text-ink">{limitText(limits.history_months, 'months')}</span></li>
              </ul>
              {usageMissing && (
                <p className="flex flex-wrap items-center gap-2 text-sm text-ink-2">{t('page.usageUnknown')}<Button size="sm" variant="ghost" className="min-h-11" onClick={() => void planQ.refetch()}>{t('page.usageRetry')}</Button></p>
              )}
            </>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2"><Gem className="h-5 w-5 text-accent" aria-hidden /><h2 className="text-lg font-semibold text-ink">{t('premium')}</h2></div>
          <p className="num text-2xl font-semibold text-ink">{t('page.price', { price })}</p>
          <p className="text-sm text-ink-2">{t('page.premiumCard')} {t('page.priceNote')}</p>
          {loading ? <Skeleton className="h-11 w-full" /> : premium ? (
            <>
              <Badge tone="accent" icon={<Check />} className="self-start">{t('page.current')}</Badge>
              <Button variant="secondary" onClick={() => setCancelOpen(true)}>{t('page.cancel')}</Button>
            </>
          ) : (
            <Button onClick={() => setUpgradeOpen(true)}>{t('page.upgrade')}</Button>
          )}
          <p className="text-xs text-ink-2">{t('mockNote')}</p>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold text-ink">{t('page.compareTitle')}</h2>
      <Card className="p-0 md:p-0">
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <caption className="sr-only">{t('page.compareTitle')}</caption>
          <thead>
            <tr className="border-b border-line text-ink">
              <th scope="col" className="w-[40%] px-3 py-3 font-medium md:px-4">{t('page.feature')}</th>
              <th scope="col" className="px-3 py-3 font-medium md:px-4">{t('free')}{plan === 'FREE' && <span className="block text-xs font-normal text-ink-2">({t('page.current')})</span>}</th>
              <th scope="col" className="px-3 py-3 font-medium md:px-4">{t('premium')}{premium && <span className="block text-xs font-normal text-ink-2">({t('page.current')})</span>}</th>
            </tr>
          </thead>
          <tbody>
            <Row label={t('page.wallets')} free={String(FREE_LIMITS.max_wallets)} prem={t('page.unlimited')} />
            <Row label={t('page.budgets')} free={String(FREE_LIMITS.max_budgets)} prem={t('page.unlimited')} />
            <Row label={t('page.goals')} free={String(FREE_LIMITS.max_goals)} prem={t('page.unlimited')} />
            <Row label={t('page.history')} free={t('page.historyValue', { n: FREE_LIMITS.history_months })} prem={t('page.unlimited')} />
            <Row label={t('page.csvImport')} free={false} prem />
            <Row label={t('page.csvExport')} free={false} prem />
            <Row label={t('page.advancedReports')} free={false} prem />
            <Row label={t('page.alertThresholds')} free={false} prem />
          </tbody>
        </table>
      </Card>

      <CheckoutDialog open={upgradeOpen} onClose={() => setUpgradeOpen(false)} price={price} />
      <CancelDialog open={cancelOpen} onClose={() => setCancelOpen(false)} />
    </>
  );
}

/** plain usage bar: plan usage is not a budget, so no warning/over states and no red */
function UsageBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const { t } = useTranslation('plans');
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const full = used >= limit;
  return (
    <div className="flex flex-col gap-1">
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2 overflow-hidden rounded-full bg-sunken ring-1 ring-inset ring-line">
        <div className={full ? 'h-full bg-ink' : 'h-full bg-accent'} style={{ width: `${pct}%` }} />
      </div>
      {full && <span className="text-xs text-ink-2">{t('page.usedUp')}</span>}
    </div>
  );
}

function Cell({ v }: { v: string | boolean }) {
  const { t } = useTranslation('plans');
  if (typeof v === 'string') return <span className="num">{v}</span>;
  return v
    ? <span className="inline-flex items-center gap-1.5 text-accent"><Check className="h-4 w-4" aria-hidden />{t('page.included')}</span>
    : <span className="inline-flex items-center gap-1.5 text-ink-2"><Minus className="h-4 w-4" aria-hidden /><span aria-hidden>—</span><span className="sr-only">{t('page.notIncluded')}</span></span>;
}
function Row({ label, free, prem }: { label: ReactNode; free: string | boolean; prem: string | boolean }) {
  return (
    <tr className="border-b border-line last:border-0">
      <th scope="row" className="px-3 py-3 font-normal text-ink md:px-4">{label}</th>
      <td className="px-3 py-3 text-ink md:px-4"><Cell v={free} /></td>
      <td className="px-3 py-3 text-ink md:px-4"><Cell v={prem} /></td>
    </tr>
  );
}

function CheckoutDialog({ open, onClose, price }: { open: boolean; onClose: () => void; price: string }) {
  const { t } = useTranslation('plans');
  const checkout = useMockCheckout();
  return (
    <ResponsiveDialog
      open={open} onOpenChange={(o) => !o && !checkout.isPending && onClose()} title={t('checkout.title')} description={t('checkout.price', { price })}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={checkout.isPending}>{t('checkout.back')}</Button>
        <Button loading={checkout.isPending} onClick={() => checkout.mutate(undefined, { onSuccess: () => { onClose(); toast.success(t('welcome')); }, onError: () => toast.error(t('checkoutFailed')) })}>{t('checkout.confirm')}</Button>
      </>}
    >
      <Alert tone="info"><p className="font-semibold">{t('checkout.demoTitle')}</p><p className="font-normal">{t('checkout.demo')}</p></Alert>
      <ul className="flex flex-col gap-2 text-sm text-ink">
        {['benefit1', 'benefit2', 'benefit3'].map((k) => <li key={k} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />{t(k)}</li>)}
      </ul>
    </ResponsiveDialog>
  );
}

function CancelDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('plans');
  const cancel = useCancelSubscription();
  const [unavailable, setUnavailable] = useState(false);
  const go = () => cancel.mutate(undefined, {
    onSuccess: () => { onClose(); toast.success(t('cancel.done')); },
    onError: (e) => { if (isApiError(e) && e.status === 404) setUnavailable(true); else toast.error(t('page.cancelFailed')); },
  });
  return (
    <ResponsiveDialog
      open={open} onOpenChange={(o) => { if (!o && !cancel.isPending) { setUnavailable(false); onClose(); } }} title={t('cancel.title')} description={t('cancel.desc')}
      footer={<>
        <Button autoFocus onClick={onClose} disabled={cancel.isPending}>{t('cancel.keep')}</Button>
        <Button variant="destructive" loading={cancel.isPending} onClick={go}>{t('cancel.confirm')}</Button>
      </>}
    >
      <p className="text-sm text-ink">{t('cancel.keepData')}</p>
      <p className="text-sm text-ink-2">{t('cancel.limits')}</p>
      {unavailable && <Alert>{t('page.cancelUnavailable')}</Alert>}
    </ResponsiveDialog>
  );
}
