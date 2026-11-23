import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { endpoints } from '@/lib/api/endpoints';
import { qk } from '@/lib/queryKeys';
import { toast, type UpgradeReason } from '@/stores/ui';
import { Button, ResponsiveDialog } from '@/ui';
import { USAGE_KEY } from './constants';

/**
 * The CONTENT of the global plan-limit dialog: what limit was hit, what Premium adds, the way out. Short, kind, never a wall.
 * The shell (app/PlanLimitDialog.tsx) opens it on every 403 PLAN_LIMIT_REACHED and owns when it is open; this feature owns what it says and does.
 * Copy: src/locales/{vi,en}/plans.json (namespace "plans"). Reasons: `key` = max_wallets | max_budgets | max_goals | history_months,
 * `feature` = csv_import | csv_export | alert_thresholds.
 */
export function PlanLimitDialogContent({ open, reason, onClose }: { open: boolean; reason: UpgradeReason | null; onClose: () => void }) {
  const { t } = useTranslation('plans');
  const qc = useQueryClient();
  const plan = useQuery({ queryKey: qk.plan, queryFn: endpoints.subscription.me, enabled: open, retry: false, meta: { silent: true } });
  const checkout = useMutation({
    mutationFn: endpoints.subscription.mockCheckout,
    onSuccess: async () => { await qc.invalidateQueries(); onClose(); toast.success(t('welcome')); },
    onError: () => toast.error(t('checkoutFailed')),
  });

  const key = reason?.key as keyof typeof USAGE_KEY | 'history_months' | undefined;
  const specific = key ? `limit_${key}` : reason?.feature ? `feature_${reason.feature}` : 'generic';
  const limit = reason?.limit ?? (key ? plan.data?.limits[key] : undefined) ?? '';
  const text = t(specific, { limit, defaultValue: t('generic') });
  const used = key && key !== 'history_months' ? plan.data?.usage[USAGE_KEY[key]] : undefined;
  const usage = plan.data?.plan !== 'PREMIUM' && key && key !== 'history_months' && used !== undefined && limit !== '' ? t(`usage_${key}`, { used, limit }) : null;

  return (
    <ResponsiveDialog
      open={open} onOpenChange={(o) => !o && onClose()} title={t('upgradeTitle')} description={text}
      footer={<>
        <Button onClick={() => checkout.mutate()} loading={checkout.isPending}><Sparkles className="h-4 w-4" aria-hidden />{t('upgradeCta')}</Button>
        <Button variant="ghost" onClick={onClose}>{t('notNow')}</Button>
      </>}
    >
      {usage && <p className="num rounded-md bg-sunken px-3 py-2 text-sm font-medium text-ink">{usage}</p>}
      <ul className="flex flex-col gap-2 text-sm text-ink">
        {['benefit1', 'benefit2', 'benefit3'].map((k) => (
          <li key={k} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />{t(k)}</li>
        ))}
      </ul>
      <p className="text-xs text-ink-2">{t('mockNote')}</p>
      <Link to="/plans" onClick={onClose} className="inline-flex min-h-11 items-center self-start text-sm font-medium text-accent underline underline-offset-4">{t('seePlans')}</Link>
    </ResponsiveDialog>
  );
}
