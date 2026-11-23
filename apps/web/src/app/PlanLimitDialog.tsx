import { lazy, Suspense, useEffect, useState } from 'react';
import { usePeriodStore } from '@/stores/period';
import { useUi } from '@/stores/ui';

// The words and the checkout live in features/plans; the shell only decides when it is open.
const Content = lazy(() => import('@/features/plans').then((m) => ({ default: m.PlanLimitDialogContent })));

/**
 * Global plan-limit dialog. The error policy (lib/api/handleError) calls useUi.openUpgrade({key|feature, limit}) on ANY 403 PLAN_LIMIT_REACHED:
 * wallets, budgets, goals, CSV import/export, alert thresholds, report history beyond the Free window. Features never build their own.
 * Closing it after a history limit puts the month switcher back on the current period so the screen is not stuck on a locked month.
 */
export function PlanLimitDialog() {
  const { open, reason } = useUi((s) => s.upgrade);
  const close = useUi((s) => s.closeUpgrade);
  const [wanted, setWanted] = useState(false);
  useEffect(() => { if (open) setWanted(true); }, [open]);
  if (!wanted) return null;
  const onClose = () => {
    if (reason?.key === 'history_months') usePeriodStore.getState().select(null);
    close();
  };
  return <Suspense fallback={null}><Content open={open} reason={reason ?? null} onClose={onClose} /></Suspense>;
}
