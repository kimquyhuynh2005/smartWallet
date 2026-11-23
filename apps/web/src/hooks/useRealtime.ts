import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAccessToken } from '@/lib/api/session';
import { qk } from '@/lib/queryKeys';
import { connectRealtime, seenAlertIds } from '@/lib/realtime';
import { toast } from '@/stores/ui';

/** Mount once in the authenticated shell: alerts appear within a second of saving an expense, and the right queries refresh. */
export function useRealtime() {
  const qc = useQueryClient();
  const authed = !!useAccessToken();
  useEffect(() => {
    if (!authed) return;
    const conn = connectRealtime({
      onNotification: (n) => {
        void qc.invalidateQueries({ queryKey: qk.notifications.all });
        void qc.invalidateQueries({ queryKey: qk.budgets.all });
        void qc.invalidateQueries({ queryKey: qk.reports.all });
        // The POST response of the expense that caused this alert shows it with an action. The socket can win the race, so wait a beat and re-check.
        setTimeout(() => {
          if (seenAlertIds.has(n.id)) return;
          seenAlertIds.add(n.id);
          (n.type === 'BUDGET_EXCEEDED' ? toast.error : toast.warning)(n.message);
        }, 400);
      },
      onBudget: () => {
        void qc.invalidateQueries({ queryKey: qk.budgets.all });
        void qc.invalidateQueries({ queryKey: qk.reports.dashboard() });
      },
    });
    return conn.close;
  }, [authed, qc]); // reconnect on login/logout only, not on every silent token refresh
}
